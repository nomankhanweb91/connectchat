import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { createServer } from 'node:net';
import { app } from '../src/app';
import { createDiagnosticsRouter } from '../src/routes/diagnostics.routes';

describe('HTTP API boundary',()=>{
  it('returns a structured not found error',async()=>{const r=await request(app).get('/no-such-route');assert.equal(r.status,404);assert.equal(r.body.code,'NOT_FOUND');});
  it('rejects unauthenticated user access',async()=>{const r=await request(app).get('/api/users/me');assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHENTICATED');});
  it('requires authentication for directory listing',async()=>{const r=await request(app).get('/api/users');assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHENTICATED');});
  it('rejects unauthenticated image upload before parsing its body',async()=>{const r=await request(app).post('/api/uploads/images');assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHENTICATED');});
  it('requires authentication for block and report APIs',async()=>{const block=await request(app).post('/api/users/00000000-0000-4000-8000-000000000000/block');const reports=await request(app).get('/api/reports/mine');assert.equal(block.status,401);assert.equal(reports.status,401);});
  it('rejects malformed JSON safely',async()=>{const r=await request(app).post('/api/auth/login').set('Content-Type','application/json').send('{');assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_JSON');});
  it('reports server and database health',async()=>{const r=await request(app).get('/api/health');assert.ok([200,503].includes(r.status));assert.equal(r.body.data.server,'ok');assert.ok(['ok','unavailable'].includes(r.body.data.database));});
  it('registers the TCP diagnostic route and requires its secret',async()=>{const r=await request(app).get('/api/diagnostics/mysql-tcp');assert.equal(r.status,401);assert.deepEqual(r.body,{success:false,message:'Diagnostic secret required or invalid'});});
  it('rejects an invalid TCP diagnostic secret',async()=>{const diagnosticApp=express();diagnosticApp.use('/api/diagnostics',createDiagnosticsRouter({host:'127.0.0.1',port:1,secret:'correct-test-diagnostic-secret-32-chars'}));const r=await request(diagnosticApp).get('/api/diagnostics/mysql-tcp').set('x-diagnostic-secret','incorrect-test-diagnostic-secret');assert.equal(r.status,401);assert.deepEqual(r.body,{success:false,message:'Diagnostic secret required or invalid'});});
  it('returns only the safe TCP result fields after a raw socket connection',async()=>{const tcpServer=createServer(socket=>socket.end());await new Promise<void>(resolve=>tcpServer.listen(0,'127.0.0.1',resolve));const address=tcpServer.address();assert.ok(address&&typeof address!=='string');const diagnosticApp=express();diagnosticApp.use('/api/diagnostics',createDiagnosticsRouter({host:'127.0.0.1',port:address.port,secret:'correct-test-diagnostic-secret-32-chars'}));try{const r=await request(diagnosticApp).get('/api/diagnostics/mysql-tcp').set('x-diagnostic-secret','correct-test-diagnostic-secret-32-chars');assert.equal(r.status,200);assert.deepEqual(Object.keys(r.body).sort(),['elapsedMs','host','port','success']);assert.equal(r.body.host,'127.0.0.1');assert.equal(r.body.port,address.port);assert.equal(r.body.success,true);assert.equal(typeof r.body.elapsedMs,'number');}finally{await new Promise<void>(resolve=>tcpServer.close(()=>resolve()));}});
});
