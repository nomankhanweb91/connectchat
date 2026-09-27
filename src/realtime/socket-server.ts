import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { ClientToServerEvents, InterServerEvents, MessageDto, ServerToClientEvents, SocketData, Ack } from '../types/messaging.dto';
import { env } from '../config/env';
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
function socketError(error:unknown){return error instanceof HttpError?{code:error.code,message:error.message}:genericError;}
function acknowledge<T>(ack:((result:Ack<T>)=>void)|undefined,result:Ack<T>){if(typeof ack==='function')ack(result);}
function success<T>(ack:((result:Ack<T>)=>void)|undefined,data:T){acknowledge(ack,{success:true,data});}
function failure<T>(ack:((result:Ack<T>)=>void)|undefined,error:unknown){acknowledge(ack,{success:false,error:socketError(error)});}
function validPayload<T>(schema:z.ZodType<T>,payload:unknown):T{const result=schema.safeParse(payload);if(!result.success)throw new HttpError(400,'VALIDATION_ERROR',result.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));return result.data;}
function allowMessage(userId:string):boolean{const now=Date.now();const recent=(messageWindows.get(userId)??[]).filter(time=>time>now-60_000);if(recent.length>=30){messageWindows.set(userId,recent);return false;}recent.push(now);messageWindows.set(userId,recent);return true;}

export function emitMessageNew(message:MessageDto):void{ioInstance?.to(roomName(message.conversationId)).emit('message:new',message);}
export function emitMessageRead(receipt:{conversationId:string;messageId:string;status:'READ';readAt:Date|null},readerId:string):void{ioInstance?.to(roomName(receipt.conversationId)).emit('message:read',{...receipt,readerId});}

async function authorizeConversation(socket:AppSocket,conversationId:string):Promise<void>{if(!(await isConversationMember(socket.data.user.id,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');}

function registerHandlers(socket:AppSocket,io:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>):void{
 socket.on('conversation:join',(payload,ack)=>{void (async()=>{try{const{conversationId}=validPayload(conversationEventSchema,payload);await authorizeConversation(socket,conversationId);await socket.join(roomName(conversationId));success(ack,{conversationId});}catch(error){failure(ack,error);}})();});
 socket.on('conversation:leave',(payload,ack)=>{void (async()=>{try{const{conversationId}=validPayload(conversationEventSchema,payload);await authorizeConversation(socket,conversationId);await socket.leave(roomName(conversationId));success(ack,{conversationId});}catch(error){failure(ack,error);}})();});
 socket.on('message:send',(payload,ack)=>{void (async()=>{try{const{conversationId,content}=validPayload(socketMessageSchema,payload);if(!allowMessage(socket.data.user.id))throw new HttpError(429,'RATE_LIMITED','Message rate limit exceeded');await authorizeConversation(socket,conversationId);const message=await createMessage(socket.data.user.id,conversationId,content);io.to(roomName(conversationId)).emit('message:new',message);success(ack,message);}catch(error){failure(ack,error);}})();});
 socket.on('message:delivered',(payload,ack)=>{void (async()=>{try{const{messageId}=validPayload(deliveredEventSchema,payload);const receipt=await markMessageDelivered(socket.data.user.id,messageId);if(receipt.status==='DELIVERED')io.to(roomName(receipt.conversationId)).emit('message:delivered',{conversationId:receipt.conversationId,messageId,status:'DELIVERED',deliveredAt:receipt.deliveredAt,recipientId:socket.data.user.id});success(ack,{messageId,status:receipt.status,deliveredAt:receipt.deliveredAt,readAt:receipt.readAt});}catch(error){failure(ack,error);}})();});
 socket.on('message:read',(payload,ack)=>{void (async()=>{try{const{conversationId,messageId}=validPayload(readEventSchema,payload);const receipt=await markMessageRead(socket.data.user.id,conversationId,messageId);io.to(roomName(conversationId)).emit('message:read',{...receipt,readerId:socket.data.user.id});success(ack,receipt);}catch(error){failure(ack,error);}})();});
 const typing=(event:'typing:start'|'typing:stop')=>(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>{void (async()=>{try{const{conversationId}=validPayload(conversationEventSchema,payload);await authorizeConversation(socket,conversationId);socket.to(roomName(conversationId)).emit(event,{conversationId,userId:socket.data.user.id});success(ack,{conversationId});}catch(error){failure(ack,error);}})();};
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
 try{const[rows]=await pool.execute<(import('mysql2').RowDataPacket&{conversation_id:string})[]>('SELECT conversation_id FROM conversation_members WHERE user_id=?',[socket.data.user.id]);if(!socket.connected)return;const roomIds=rows.map(row=>row.conversation_id);await socket.join(roomIds.map(roomName));if(!socket.connected)return;let sockets=activeSockets.get(socket.data.user.id);const becameOnline=!sockets||sockets.size===0;if(!sockets){sockets=new Set<string>();activeSockets.set(socket.data.user.id,sockets);}sockets.add(socket.id);await pool.execute('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=? AND is_active=1',[socket.data.user.id]);const[lastSeen]=await pool.execute<(import('mysql2').RowDataPacket&{last_seen:Date|null})[]>('SELECT last_seen FROM users WHERE id=?',[socket.data.user.id]);if(becameOnline)for(const id of roomIds)io.to(roomName(id)).emit('presence:update',{userId:socket.data.user.id,isOnline:true,lastSeen:lastSeen[0]?.last_seen??new Date()});}catch{socket.disconnect(true);}
}

async function onDisconnect(socket:AppSocket,io:Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>):Promise<void>{
 const sockets=activeSockets.get(socket.data.user.id);if(!sockets)return;sockets.delete(socket.id);if(sockets.size>0)return;activeSockets.delete(socket.data.user.id);messageWindows.delete(socket.data.user.id);
 try{await pool.execute('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=?',[socket.data.user.id]);const[rows]=await pool.execute<(import('mysql2').RowDataPacket&{conversation_id:string;last_seen:Date|null})[]>('SELECT cm.conversation_id,u.last_seen FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.user_id=?',[socket.data.user.id]);const lastSeen=rows[0]?.last_seen??new Date();for(const row of rows)io.to(roomName(row.conversation_id)).emit('presence:update',{userId:socket.data.user.id,isOnline:false,lastSeen});}catch{/* The next authenticated HTTP request refreshes last_seen if the database is temporarily unavailable. */}
}

