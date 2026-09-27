import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { app } from '../src/app';
import { pool } from '../src/config/database';
import { attachSocketServer } from '../src/realtime/socket-server';
import type { Ack, ClientToServerEvents, MessageDto, ServerToClientEvents } from '../src/types/messaging.dto';
import type { Server as SocketServer } from 'socket.io';

const enabled=process.env.RUN_MYSQL_INTEGRATION==='true';
const suffix=randomUUID().replaceAll('-','').slice(0,12);
const users=[
 {username:`chat_${suffix}_a`,name:'Chat Alice'},
 {username:`chat_${suffix}_b`,name:'Chat Bob'},
 {username:`chat_${suffix}_c`,name:'Chat Eve'}
].map(user=>({...user,password:'safe-test-password-123',confirmPassword:'safe-test-password-123',country:'Test',city:'Test',gender:'Other'}));
type TestSocket=ClientSocket<ServerToClientEvents,ClientToServerEvents>;
let ids:string[]=[];
let tokens:string[]=[];
let conversationId='';
let firstMessageId='';
let socketMessageId='';
let httpServer:HttpServer|undefined;
let ioServer:SocketServer<ClientToServerEvents,ServerToClientEvents>|undefined;
let sockets:TestSocket[]=[];
let baseUrl='';
function emitAck<T>(socket:TestSocket,event:string,payload:unknown):Promise<Ack<T>>{return new Promise(resolve=>{const emit=socket.emit as unknown as (event:string,payload:unknown,callback:(result:Ack<T>)=>void)=>void;emit.call(socket,event,payload,resolve);});}
async function connectSocket(token?:string):Promise<TestSocket>{return new Promise((resolve,reject)=>{const socket=clientIo(baseUrl,{auth:token?{token}:undefined,transports:['websocket'],reconnection:false,timeout:3000}) as TestSocket;socket.once('connect',()=>{sockets.push(socket);resolve(socket);});socket.once('connect_error',error=>{socket.close();reject(error);});});}
function waitForMessage(socket:TestSocket):Promise<MessageDto>{return new Promise(resolve=>socket.once('message:new',resolve));}

describe('MySQL and Socket.IO messaging flows',{skip:!enabled},()=>{
 before(async()=>{
  for(const user of users){const result=await request(app).post('/api/auth/register').send(user);assert.equal(result.status,201);ids.push(result.body.data.user.id);tokens.push(result.body.data.accessToken);}
  httpServer=createServer(app);ioServer=attachSocketServer(httpServer);
  await new Promise<void>(resolve=>httpServer!.listen(0,'127.0.0.1',resolve));
  const address=httpServer.address();if(!address||typeof address==='string')throw new Error('Test server address unavailable');baseUrl=`http://127.0.0.1:${address.port}`;
  sockets.push(await connectSocket(tokens[0]));sockets.push(await connectSocket(tokens[1]));sockets.push(await connectSocket(tokens[2]));
 });
 after(async()=>{
  for(const socket of sockets)socket.close();
  if(ioServer)await new Promise<void>(resolve=>ioServer!.close(()=>resolve()));
  for(const id of ids)await pool.execute('DELETE FROM users WHERE id=?',[id]);
  await pool.end();
 });

 it('creates a one-to-one conversation',async()=>{const result=await request(app).post('/api/conversations').set('Authorization',`Bearer ${tokens[0]}`).send({userId:ids[1]});assert.equal(result.status,201);conversationId=result.body.data.conversationId;assert.ok(conversationId);const owner=await emitAck<{conversationId:string}>(sockets[0]!,'conversation:join',{conversationId});const peer=await emitAck<{conversationId:string}>(sockets[1]!,'conversation:join',{conversationId});assert.equal(owner.success,true);assert.equal(peer.success,true);});
 it('returns the existing canonical conversation instead of duplicating it',async()=>{const result=await request(app).post('/api/conversations').set('Authorization',`Bearer ${tokens[1]}`).send({userId:ids[0]});assert.equal(result.status,201);assert.equal(result.body.data.conversationId,conversationId);const[count]=await pool.execute<(import('mysql2').RowDataPacket&{total:number})[]>('SELECT COUNT(*) AS total FROM conversations WHERE id=?',[conversationId]);assert.equal(Number(count[0]?.total),1);});
 it('rejects self-conversations',async()=>{const result=await request(app).post('/api/conversations').set('Authorization',`Bearer ${tokens[0]}`).send({userId:ids[0]});assert.equal(result.status,400);});
 it('lists only the authenticated user conversations',async()=>{const result=await request(app).get('/api/conversations').set('Authorization',`Bearer ${tokens[0]}`);assert.equal(result.status,200);assert.ok(result.body.data.some((item:{conversationId:string})=>item.conversationId===conversationId));});
 it('authorizes conversation details and hides non-member conversations',async()=>{const member=await request(app).get(`/api/conversations/${conversationId}`).set('Authorization',`Bearer ${tokens[1]}`);const outsider=await request(app).get(`/api/conversations/${conversationId}`).set('Authorization',`Bearer ${tokens[2]}`);assert.equal(member.status,200);assert.equal(outsider.status,404);});
 it('persists a valid text message before making it available',async()=>{const delivered=waitForMessage(sockets[1]!);const result=await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[0]}`).send({content:'hello from REST'});assert.equal(result.status,201);assert.equal(result.body.data.status,'SENT');firstMessageId=result.body.data.id;const event=await delivered;assert.equal(event.id,firstMessageId);});
 it('rejects empty and overlong message content',async()=>{const empty=await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[0]}`).send({content:'   '});const long=await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[0]}`).send({content:'x'.repeat(4001)});assert.equal(empty.status,400);assert.equal(long.status,400);});
 it('paginates message history only for members',async()=>{const history=await request(app).get(`/api/conversations/${conversationId}/messages?page=1&limit=1`).set('Authorization',`Bearer ${tokens[1]}`);const denied=await request(app).get(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[2]}`);assert.equal(history.status,200);assert.equal(history.body.data.messages.length,1);assert.equal(history.body.data.pagination.total,1);assert.equal(history.body.data.messages[0].id,firstMessageId);assert.equal(denied.status,404);});
 it('rejects unauthorized REST message sends',async()=>{const result=await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[2]}`).send({content:'intrusion'});assert.equal(result.status,404);});
 it('reports unread counts only to the recipient',async()=>{const recipient=await request(app).get('/api/conversations').set('Authorization',`Bearer ${tokens[1]}`);const item=recipient.body.data.find((value:{conversationId:string})=>value.conversationId===conversationId);assert.equal(item.unreadCount,1);});
 it('rejects marking a sender message as read by its sender',async()=>{const result=await request(app).post(`/api/conversations/${conversationId}/messages/${firstMessageId}/read`).set('Authorization',`Bearer ${tokens[0]}`);assert.equal(result.status,403);});
 it('accepts a recipient delivery acknowledgement and updates status',async()=>{const event=new Promise<{messageId:string;status:string}>(resolve=>sockets[0]!.once('message:delivered',resolve));const ack=await emitAck<{messageId:string;status:'DELIVERED'|'READ'}>(sockets[1]!,'message:delivered',{messageId:firstMessageId});assert.equal(ack.success,true);assert.equal((await event).status,'DELIVERED');const history=await request(app).get(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${tokens[0]}`);assert.equal(history.body.data.messages[0].status,'DELIVERED');});
 it('marks a recipient message read and rejects a non-member read',async()=>{const event=new Promise<{messageId:string;status:string}>(resolve=>sockets[0]!.once('message:read',resolve));const ack=await emitAck<{status:'READ'}>(sockets[1]!,'message:read',{conversationId,messageId:firstMessageId});assert.equal(ack.success,true);assert.equal((await event).status,'READ');const denied=await request(app).post(`/api/conversations/${conversationId}/messages/${firstMessageId}/read`).set('Authorization',`Bearer ${tokens[2]}`);assert.equal(denied.status,404);});
 it('rejects missing and invalid Socket.IO credentials',async()=>{await assert.rejects(connectSocket(),/Socket authentication required/);await assert.rejects(connectSocket('not-a-valid-jwt'),/Access token is invalid or expired/);});
 it('authorizes conversation rooms and rejects an outsider join',async()=>{const accepted=await emitAck<{conversationId:string}>(sockets[0]!,'conversation:join',{conversationId});const denied=await emitAck<{conversationId:string}>(sockets[2]!,'conversation:join',{conversationId});assert.equal(accepted.success,true);assert.equal(denied.success,false);});
 it('sends socket messages only after persistence and enforces sender membership',async()=>{const incoming=waitForMessage(sockets[1]!);const sent=await emitAck<MessageDto>(sockets[0]!,'message:send',{conversationId,content:'hello over socket'});assert.equal(sent.success,true);if(!sent.success)throw new Error('Socket message send failed');socketMessageId=sent.data.id;assert.equal((await incoming).id,socketMessageId);const denied=await emitAck<MessageDto>(sockets[2]!,'message:send',{conversationId,content:'unauthorized'});assert.equal(denied.success,false);const[rows]=await pool.execute<(import('mysql2').RowDataPacket&{total:number})[]>('SELECT COUNT(*) AS total FROM messages WHERE id=?',[socketMessageId]);assert.equal(Number(rows[0]?.total),1);});
});
