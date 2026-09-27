import { after,before,describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer,type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { io as clientIo,type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import { app } from '../src/app';
import { pool } from '../src/config/database';
import { attachSocketServer } from '../src/realtime/socket-server';
import { storageService } from '../src/storage/storage-service';
import type { Ack,ClientToServerEvents,MessageDto,ServerToClientEvents } from '../src/types/messaging.dto';
import { env } from '../src/config/env';

const enabled=process.env.RUN_MYSQL_INTEGRATION==='true';
const suffix=randomUUID().replaceAll('-','').slice(0,12);
const accountData=['alpha','bravo','charlie'].map((name,index)=>({name:`Phase5 ${name}`,username:`p5_${suffix}_${index}`,password:'safe-test-password-123',confirmPassword:'safe-test-password-123',country:'Test',city:'Test',gender:'Other'}));
type TestSocket=ClientSocket<ServerToClientEvents,ClientToServerEvents>;
const userIds:string[]=[];const accessTokens:string[]=[];
let conversationId='';let messageId='';let imageId='';let server:HttpServer|undefined;let ioServer:SocketServer<ClientToServerEvents,ServerToClientEvents>|undefined;let baseUrl='';let sockets:TestSocket[]=[];
function emitAck<T>(socket:TestSocket,event:string,payload:unknown):Promise<Ack<T>>{return new Promise(resolve=>{const emit=socket.emit as unknown as(event:string,payload:unknown,callback:(result:Ack<T>)=>void)=>void;emit.call(socket,event,payload,resolve);});}
async function connectSocket(token:string):Promise<TestSocket>{return new Promise((resolve,reject)=>{const socket=clientIo(baseUrl,{auth:{token},transports:['websocket'],reconnection:false,timeout:3000}) as TestSocket;socket.once('connect',()=>{sockets.push(socket);resolve(socket);});socket.once('connect_error',error=>{socket.close();reject(error);});});}

describe('Phase 5 block and report enforcement',{skip:!enabled},()=>{
 before(async()=>{
  for(const account of accountData){const result=await request(app).post('/api/auth/register').send(account);assert.equal(result.status,201);userIds.push(result.body.data.user.id);accessTokens.push(result.body.data.accessToken);}
  const conversation=await request(app).post('/api/conversations').set('Authorization',`Bearer ${accessTokens[0]}`).send({userId:userIds[1]});assert.equal(conversation.status,201);conversationId=conversation.body.data.conversationId;
  const message=await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',`Bearer ${accessTokens[1]}`).send({content:'Reported message'});assert.equal(message.status,201);messageId=message.body.data.id;
  const png=await sharp({create:{width:1,height:1,channels:3,background:'#f00'}}).png().toBuffer();const image=await request(app).post(`/api/conversations/${conversationId}/messages/image`).set('Authorization',`Bearer ${accessTokens[1]}`).attach('image',png,{filename:'before-block.png',contentType:'image/png'});assert.equal(image.status,201);imageId=image.body.data.image.id;
  server=createServer(app);ioServer=attachSocketServer(server);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Test socket server unavailable');baseUrl=`http://127.0.0.1:${address.port}`;
  sockets.push(await connectSocket(accessTokens[0]!),await connectSocket(accessTokens[1]!),await connectSocket(accessTokens[2]!));
  for(const socket of sockets.slice(0,2)){const ack=await emitAck<{conversationId:string}>(socket,'conversation:join',{conversationId});assert.equal(ack.success,true);}
 });
 after(async()=>{
  for(const socket of sockets)socket.close();if(ioServer)await new Promise<void>(resolve=>ioServer!.close(()=>resolve()));
  if(userIds.length){const placeholders=userIds.map(()=>'?').join(',');const[uploads]=await pool.execute<(import('mysql2').RowDataPacket&{storage_key:string})[]>(`SELECT storage_key FROM uploads WHERE uploaded_by IN (${placeholders})`,userIds);await Promise.all(uploads.map(upload=>storageService.delete(upload.storage_key).catch(()=>undefined)));}
  for(const userId of userIds)await pool.execute('DELETE FROM users WHERE id=?',[userId]);await pool.end();
 });

 it('reports users and messages with controlled reasons and private ownership',async()=>{
  const owner=`Bearer ${accessTokens[0]}`,outsider=`Bearer ${accessTokens[2]}`;
  const userReport=await request(app).post('/api/reports/user').set('Authorization',owner).send({userId:userIds[2],reason:'SPAM',description:'Repeated spam'});assert.equal(userReport.status,201);assert.equal(userReport.body.data.status,'OPEN');
  const duplicateUser=await request(app).post('/api/reports/user').set('Authorization',owner).send({userId:userIds[2],reason:'HARASSMENT'});assert.equal(duplicateUser.status,409);
  const badReason=await request(app).post('/api/reports/user').set('Authorization',owner).send({userId:userIds[2],reason:'NOT_A_REASON'});assert.equal(badReason.status,400);
  const messageReport=await request(app).post('/api/reports/message').set('Authorization',owner).send({messageId,reason:'ABUSIVE_CONTENT'});assert.equal(messageReport.status,201);
  const duplicateMessage=await request(app).post('/api/reports/message').set('Authorization',owner).send({messageId,reason:'SCAM'});assert.equal(duplicateMessage.status,409);
  const denied=await request(app).post('/api/reports/message').set('Authorization',outsider).send({messageId,reason:'SPAM'});assert.equal(denied.status,404);
  const ownerReports=await request(app).get('/api/reports/mine').set('Authorization',owner);const otherReports=await request(app).get('/api/reports/mine').set('Authorization',`Bearer ${accessTokens[1]}`);assert.equal(ownerReports.status,200);assert.equal(ownerReports.body.data.reports.length,2);assert.equal(otherReports.body.data.reports.length,0);
 });

 it('rejects self-block and safely handles duplicate block and block-list isolation',async()=>{
  const owner=`Bearer ${accessTokens[0]}`;const self=await request(app).post(`/api/users/${userIds[0]}/block`).set('Authorization',owner);assert.equal(self.status,400);
  const first=await request(app).post(`/api/users/${userIds[1]}/block`).set('Authorization',owner);assert.equal(first.status,200);assert.equal(first.body.data.created,true);
  const duplicate=await request(app).post(`/api/users/${userIds[1]}/block`).set('Authorization',owner);assert.equal(duplicate.status,200);assert.equal(duplicate.body.data.created,false);
  const mine=await request(app).get('/api/users/blocked').set('Authorization',owner);const other=await request(app).get('/api/users/blocked').set('Authorization',`Bearer ${accessTokens[1]}`);assert.ok(mine.body.data.users.some((user:{id:string})=>user.id===userIds[1]));assert.deepEqual(other.body.data.users,[]);
 });

 it('hides blocked profiles and directory entries and revokes old conversation access',async()=>{
  const owner=`Bearer ${accessTokens[0]}`,peer=`Bearer ${accessTokens[1]}`;
  const directory=await request(app).get(`/api/users?search=${accountData[1]!.username}`).set('Authorization',owner);assert.equal(directory.body.data.users.some((user:{id:string})=>user.id===userIds[1]),false);
  assert.equal((await request(app).get(`/api/users/${userIds[1]}`).set('Authorization',owner)).status,404);assert.equal((await request(app).get(`/api/users/${userIds[0]}`).set('Authorization',peer)).status,404);
  assert.equal((await request(app).get(`/api/users/${userIds[1]}`)).status,200); // anonymous callers have no viewer-specific block context
  assert.equal((await request(app).get(`/api/conversations/${conversationId}`).set('Authorization',owner)).status,404);
  assert.equal((await request(app).get(`/api/conversations/${conversationId}/messages`).set('Authorization',peer)).status,404);
  assert.equal((await request(app).get('/api/conversations').set('Authorization',owner)).body.data.some((row:{conversationId:string})=>row.conversationId===conversationId),false);
  assert.equal((await request(app).post('/api/conversations').set('Authorization',owner).send({userId:userIds[1]})).status,404);
  assert.equal((await request(app).post('/api/conversations').set('Authorization',peer).send({userId:userIds[0]})).status,404);
  assert.equal((await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',owner).send({content:'blocked'})).status,404);
  assert.equal((await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization',peer).send({content:'blocked in reverse'})).status,404);
  assert.equal((await request(app).post('/api/reports/message').set('Authorization',owner).send({messageId,reason:'SPAM'})).status,404);
  assert.equal((await emitAck<MessageDto>(sockets[0]!,'message:send',{conversationId,content:'blocked socket'})).success,false);
  assert.equal((await emitAck<MessageDto>(sockets[1]!,'message:send',{conversationId,content:'blocked socket in reverse'})).success,false);
  assert.equal((await emitAck<{conversationId:string}>(sockets[1]!,'conversation:join',{conversationId})).success,false);
  // An image sent before blocking is denied to both conversation participants until unblocked.
  assert.equal((await request(app).get(`/api/uploads/images/${imageId}`).set('Authorization',owner)).status,404);
  assert.equal((await request(app).get(`/api/uploads/images/${imageId}`).set('Authorization',peer)).status,404);
 });

 it('unblocks idempotently and restores existing conversation access',async()=>{
  const owner=`Bearer ${accessTokens[0]}`;const result=await request(app).delete(`/api/users/${userIds[1]}/block`).set('Authorization',owner);assert.equal(result.status,200);assert.equal(result.body.data.removed,true);
  const repeat=await request(app).delete(`/api/users/${userIds[1]}/block`).set('Authorization',owner);assert.equal(repeat.status,200);assert.equal(repeat.body.data.removed,false);
  assert.equal((await request(app).get(`/api/conversations/${conversationId}`).set('Authorization',owner)).status,200);
  assert.equal((await emitAck<{conversationId:string}>(sockets[0]!,'conversation:join',{conversationId})).success,true);
 });

 it('applies reverse-direction blocks and rate-limits report creation',async()=>{
  const peer=`Bearer ${accessTokens[1]}`;const block=await request(app).post(`/api/users/${userIds[0]}/block`).set('Authorization',peer);assert.equal(block.status,200);
  assert.equal((await request(app).post('/api/conversations').set('Authorization',`Bearer ${accessTokens[0]}`).send({userId:userIds[1]})).status,404);
  await request(app).delete(`/api/users/${userIds[0]}/block`).set('Authorization',peer);
  const owner=`Bearer ${accessTokens[0]}`;let rateLimited=false;for(let i=0;i<env.REPORTS_PER_HOUR+2;i++){const response=await request(app).post('/api/reports/user').set('Authorization',owner).send({userId:userIds[2],reason:'SPAM'});if(response.status===429){rateLimited=true;break;}}
  assert.equal(rateLimited,true);
 });
});
