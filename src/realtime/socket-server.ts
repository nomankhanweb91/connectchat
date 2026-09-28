import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { ClientToServerEvents, InterServerEvents, MessageDto, ServerToClientEvents, SocketData, Ack } from '../types/messaging.dto';
import { env } from '../config/env';
import { notBlockedBetweenSql } from '../services/blocks-check.service';
import { pool } from '../config/database';
import { verifyAccessToken } from '../services/access-token';
import { createMessage, markMessageDelivered, markMessageRead } from '../services/messages.service';
import { isConversationMember } from '../services/conversations.service';
import { conversationEventSchema, deliveredEventSchema, readEventSchema, socketMessageSchema } from '../schemas/messaging.schema';
import { HttpError } from '../utils/http-error';

type AppSocket=Socket<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>;
let ioInstance:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>|undefined;
const activeSockets=new Map<string,Set<string>>();
const messageWindows=new Map<string,number[]>();
const roomName=(conversationId:string)=>`conversation:${conversationId}`;
const genericError={code:'INTERNAL_ERROR',message:'Unable to complete socket request'};
type PresencePeer=import('mysql2').RowDataPacket&{conversation_id:string;user_id:string;last_seen:Date|null};
function socketError(error:unknown){return error instanceof HttpError?{code:error.code,message:error.message}:genericError;}
const sensitiveDiagnosticValue=/\b(password|passwd|secret|token|authorization|cookie|refresh[_-]?token|access[_-]?token|credential|api[_-]?key|private[_-]?key|username|user)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const diagnosticJwtValue=/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const diagnosticBearerValue=/\bBearer\s+[^\s,;]+/gi;
const diagnosticOpaqueValue=/\b[A-Za-z0-9_-]{48,}\b/g;
function redactSocketDiagnostic(value:string):string{
 let safe=value;
 for(const[key,secret]of Object.entries(process.env))if(secret&&/(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|COOKIE|AUTHORIZATION|CREDENTIAL|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_USER|DB_USER)/i.test(key))safe=safe.split(secret).join('[REDACTED]');
 return safe.replace(diagnosticBearerValue,'Bearer [REDACTED]').replace(diagnosticJwtValue,'[REDACTED_JWT]').replace(sensitiveDiagnosticValue,'$1$2[REDACTED]').replace(diagnosticOpaqueValue,'[REDACTED_TOKEN]');
}
function socketErrorDetails(error:unknown,depth=0):Record<string,unknown>{
 const value=typeof error==='object'&&error!==null?error as {name?:unknown;message?:unknown;code?:unknown;errors?:unknown;cause?:unknown;constructor?:{name?:unknown}}:undefined;
 const errorName=error instanceof Error?error.name:typeof value?.name==='string'?value.name:typeof value?.constructor?.name==='string'?value.constructor.name:typeof error;
 const errorMessage=error instanceof Error?error.message:typeof value?.message==='string'?value.message:String(error);
 const details:Record<string,unknown>={errorName:redactSocketDiagnostic(errorName),errorMessage:redactSocketDiagnostic(errorMessage)};
 if(typeof value?.code==='string'||typeof value?.code==='number')details.errorCode=redactSocketDiagnostic(String(value.code));
 if(depth<3){
  if(Array.isArray(value?.errors))details.errors=value.errors.slice(0,8).map(cause=>socketErrorDetails(cause,depth+1));
  if(value?.cause!==undefined)details.cause=socketErrorDetails(value.cause,depth+1);
 }
 return details;
}
function logUnexpectedJoinError(error:unknown,userId:string,conversationId:string|null):void{
 const stack=error instanceof Error?error.stack:undefined;
 console.error('Unexpected Socket.IO handler error:',{event:'conversation:join',userId,conversationId,...socketErrorDetails(error),stack:stack?redactSocketDiagnostic(stack):undefined});
}
function acknowledge<T>(ack:((result:Ack<T>)=>void)|undefined,result:Ack<T>){if(typeof ack==='function')ack(result);}
function success<T>(ack:((result:Ack<T>)=>void)|undefined,data:T){acknowledge(ack,{success:true,data});}
function failure<T>(ack:((result:Ack<T>)=>void)|undefined,error:unknown){acknowledge(ack,{success:false,error:socketError(error)});}
function validPayload<T>(schema:z.ZodType<T>,payload:unknown):T{const result=schema.safeParse(payload);if(!result.success)throw new HttpError(400,'VALIDATION_ERROR',result.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));return result.data;}
function allowMessage(userId:string):boolean{const now=Date.now();const recent=(messageWindows.get(userId)??[]).filter(time=>time>now-60_000);if(recent.length>=env.MESSAGE_SENDS_PER_MINUTE){messageWindows.set(userId,recent);return false;}recent.push(now);messageWindows.set(userId,recent);return true;}

export function emitMessageNew(message:MessageDto):void{ioInstance?.to(roomName(message.conversationId)).emit('message:new',message);}
export function emitMessageRead(receipt:{conversationId:string;messageId:string;status:'READ';readAt:Date|null},readerId:string):void{ioInstance?.to(roomName(receipt.conversationId)).emit('message:read',{...receipt,readerId});}
export function evictConversationRoom(conversationId:string):void{const room=roomName(conversationId);ioInstance?.in(room).socketsLeave(room);}

async function authorizeConversation(socket:AppSocket,conversationId:string):Promise<void>{if(!(await isConversationMember(socket.data.user.id,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');}

async function getPresencePeers(userId:string,conversationId?:string):Promise<PresencePeer[]>{
 const conversationFilter=conversationId?' AND mine.conversation_id=?':'';
 const values=conversationId?[userId,conversationId]:[userId];
 const[rows]=await pool.execute<PresencePeer[]>(`SELECT mine.conversation_id,peer.id AS user_id,peer.last_seen FROM conversation_members mine JOIN conversation_members other ON other.conversation_id=mine.conversation_id AND other.user_id<>mine.user_id JOIN users peer ON peer.id=other.user_id AND peer.is_active=1 WHERE mine.user_id=?${conversationFilter} AND ${notBlockedBetweenSql('mine.user_id','other.user_id')}` ,values);
 return rows;
}

function emitPresenceSnapshot(socket:AppSocket,peers:PresencePeer[]):void{
 for(const peer of peers)socket.emit('presence:update',{userId:peer.user_id,isOnline:(activeSockets.get(peer.user_id)?.size??0)>0,lastSeen:peer.last_seen});
}

function registerHandlers(socket:AppSocket,io:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>):void{
 socket.on('conversation:join',(payload,ack)=>{void (async()=>{let conversationId:string|undefined;try{({conversationId}=validPayload(conversationEventSchema,payload));await authorizeConversation(socket,conversationId);await socket.join(roomName(conversationId));const peers=await getPresencePeers(socket.data.user.id,conversationId);if(peers.length===0){await socket.leave(roomName(conversationId));throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');}emitPresenceSnapshot(socket,peers);success(ack,{conversationId});}catch(error){if(!(error instanceof HttpError))logUnexpectedJoinError(error,socket.data.user.id,conversationId??null);if(conversationId)await socket.leave(roomName(conversationId));failure(ack,error);}})();});
 socket.on('conversation:leave',(payload,ack)=>{void (async()=>{try{const{conversationId}=validPayload(conversationEventSchema,payload);await authorizeConversation(socket,conversationId);await socket.leave(roomName(conversationId));success(ack,{conversationId});}catch(error){failure(ack,error);}})();});
 socket.on('message:send',(payload,ack)=>{void (async()=>{try{const{conversationId,content}=validPayload(socketMessageSchema,payload);if(!allowMessage(socket.data.user.id))throw new HttpError(429,'RATE_LIMITED','Message rate limit exceeded');await authorizeConversation(socket,conversationId);const message=await createMessage(socket.data.user.id,conversationId,content);io.to(roomName(conversationId)).emit('message:new',message);success(ack,message);}catch(error){failure(ack,error);}})();});
 socket.on('message:delivered',(payload,ack)=>{void (async()=>{try{const{messageId}=validPayload(deliveredEventSchema,payload);const receipt=await markMessageDelivered(socket.data.user.id,messageId);if(receipt.status==='DELIVERED')io.to(roomName(receipt.conversationId)).emit('message:delivered',{conversationId:receipt.conversationId,messageId,status:'DELIVERED',deliveredAt:receipt.deliveredAt,recipientId:socket.data.user.id});success(ack,{messageId,status:receipt.status,deliveredAt:receipt.deliveredAt,readAt:receipt.readAt});}catch(error){failure(ack,error);}})();});
 socket.on('message:read',(payload,ack)=>{void (async()=>{try{const{conversationId,messageId}=validPayload(readEventSchema,payload);const receipt=conversationId?await markMessageRead(socket.data.user.id,conversationId,messageId):await markMessageRead(socket.data.user.id,messageId);const{deliveryWasNew,deliveredAt,...readReceipt}=receipt;if(deliveryWasNew)io.to(roomName(receipt.conversationId)).emit('message:delivered',{conversationId:receipt.conversationId,messageId,status:'DELIVERED',deliveredAt,recipientId:socket.data.user.id});io.to(roomName(receipt.conversationId)).emit('message:read',{...readReceipt,readerId:socket.data.user.id});success(ack,readReceipt);}catch(error){failure(ack,error);}})();});
 const typing=(event:'typing:start'|'typing:stop')=>(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>{void (async()=>{try{const{conversationId}=validPayload(conversationEventSchema,payload);await authorizeConversation(socket,conversationId);if(!socket.rooms.has(roomName(conversationId)))throw new HttpError(403,'CONVERSATION_ROOM_REQUIRED','Join the conversation before sending typing events');socket.to(roomName(conversationId)).emit(event,{conversationId,userId:socket.data.user.id});success(ack,{conversationId});}catch(error){failure(ack,error);}})();};
 socket.on('typing:start',typing('typing:start'));
 socket.on('typing:stop',typing('typing:stop'));
}

export function attachSocketServer(httpServer:HttpServer):Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>{
 const io=new Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>(httpServer,{cors:{origin:env.CORS_ORIGIN.split(',').map(origin=>origin.trim()),credentials:true},maxHttpBufferSize:64*1024});ioInstance=io;
 io.use((socket,next)=>{void (async()=>{try{const fromAuth=socket.handshake.auth?.token;const header=socket.handshake.headers.authorization;const token=typeof fromAuth==='string'?fromAuth.replace(/^Bearer\s+/i,''):typeof header==='string'?header.replace(/^Bearer\s+/i,''):'';if(!token)throw new HttpError(401,'UNAUTHENTICATED','Socket authentication required');const claims=verifyAccessToken(token);const[users]=await pool.execute<(import('mysql2').RowDataPacket&{id:string;username:string;role:'USER'|'ADMIN'})[]>('SELECT id,username,role FROM users WHERE id=? AND is_active=1',[claims.sub]);const user=users[0];if(!user)throw new HttpError(401,'ACCOUNT_INACTIVE','Account is inactive');socket.data.user={id:user.id,username:user.username,role:user.role};next();}catch(error){next(new Error(error instanceof HttpError?error.message:'Socket authentication failed'));}})();});
 io.on('connection',socket=>{const typedSocket=socket as AppSocket;registerHandlers(typedSocket,io);typedSocket.on('disconnect',()=>{void onDisconnect(typedSocket,io);});void onConnect(typedSocket,io);});
 return io;
}

async function onConnect(socket:AppSocket,io:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>):Promise<void>{
 try{const[rows]=await pool.execute<(import('mysql2').RowDataPacket&{conversation_id:string})[]>(`SELECT mine.conversation_id FROM conversation_members mine JOIN conversation_members other ON other.conversation_id=mine.conversation_id AND other.user_id<>mine.user_id WHERE mine.user_id=? AND ${notBlockedBetweenSql('mine.user_id','other.user_id')}`,[socket.data.user.id]);if(!socket.connected)return;const roomIds=rows.map(row=>row.conversation_id);await socket.join(roomIds.map(roomName));if(!socket.connected)return;const peers=await getPresencePeers(socket.data.user.id);const allowedRooms=new Set(peers.map(peer=>peer.conversation_id));for(const roomId of roomIds)if(!allowedRooms.has(roomId))await socket.leave(roomName(roomId));if(!socket.connected)return;let sockets=activeSockets.get(socket.data.user.id);const becameOnline=!sockets||sockets.size===0;if(!sockets){sockets=new Set<string>();activeSockets.set(socket.data.user.id,sockets);}sockets.add(socket.id);await pool.execute('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=? AND is_active=1',[socket.data.user.id]);const[lastSeen]=await pool.execute<(import('mysql2').RowDataPacket&{last_seen:Date|null})[]>('SELECT last_seen FROM users WHERE id=?',[socket.data.user.id]);if(becameOnline)for(const id of allowedRooms)io.to(roomName(id)).emit('presence:update',{userId:socket.data.user.id,isOnline:true,lastSeen:lastSeen[0]?.last_seen??new Date()});emitPresenceSnapshot(socket,peers);}catch{socket.disconnect(true);}
}

async function onDisconnect(socket:AppSocket,io:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>):Promise<void>{
 const sockets=activeSockets.get(socket.data.user.id);if(!sockets)return;sockets.delete(socket.id);if(sockets.size>0)return;activeSockets.delete(socket.data.user.id);messageWindows.delete(socket.data.user.id);
 try{await pool.execute('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=?',[socket.data.user.id]);const[rows]=await pool.execute<(import('mysql2').RowDataPacket&{conversation_id:string;last_seen:Date|null})[]>(`SELECT mine.conversation_id,u.last_seen FROM conversation_members mine JOIN conversation_members other ON other.conversation_id=mine.conversation_id AND other.user_id<>mine.user_id JOIN users u ON u.id=mine.user_id WHERE mine.user_id=? AND ${notBlockedBetweenSql('mine.user_id','other.user_id')}`,[socket.data.user.id]);const lastSeen=rows[0]?.last_seen??new Date();for(const row of rows)io.to(roomName(row.conversation_id)).emit('presence:update',{userId:socket.data.user.id,isOnline:false,lastSeen});}catch{/* The next authenticated HTTP request refreshes last_seen if the database is temporarily unavailable. */}
}
