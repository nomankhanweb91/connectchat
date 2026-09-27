import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app';

describe('HTTP API boundary',()=>{
  it('returns a structured not found error',async()=>{const r=await request(app).get('/no-such-route');assert.equal(r.status,404);assert.equal(r.body.code,'NOT_FOUND');});
  it('rejects unauthenticated user access',async()=>{const r=await request(app).get('/api/users/me');assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHENTICATED');});
  it('requires authentication for directory listing',async()=>{const r=await request(app).get('/api/users');assert.equal(r.status,401);assert.equal(r.body.code,'UNAUTHENTICATED');});
  it('rejects malformed JSON safely',async()=>{const r=await request(app).post('/api/auth/login').set('Content-Type','application/json').send('{');assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_JSON');});
  it('reports server and database health',async()=>{const r=await request(app).get('/api/health');assert.ok([200,503].includes(r.status));assert.equal(r.body.data.server,'ok');assert.ok(['ok','unavailable'].includes(r.body.data.database));});
});

