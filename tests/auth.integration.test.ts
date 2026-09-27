import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/config/database';

const enabled=process.env.RUN_MYSQL_INTEGRATION==='true';
const username=`it_${randomUUID().replaceAll('-','').slice(0,12)}`;
const credentials={name:'Integration User',username,password:'safe-test-password-123',confirmPassword:'safe-test-password-123',country:'India',city:'Delhi',gender:'Other'};
let accessToken='';
const client=request.agent(app);

describe('MySQL-backed authentication and user API',{skip:!enabled},()=>{
 after(async()=>{await pool.execute('DELETE FROM users WHERE username=?',[username]);await pool.end();});
 it('registers a new account and returns a safe profile and access token',async()=>{const r=await client.post('/api/auth/register').send(credentials);assert.equal(r.status,201);assert.ok(r.body.data.accessToken);assert.equal(r.body.data.user.username,username);assert.equal('password_hash' in r.body.data.user,false);accessToken=r.body.data.accessToken;});
 it('rejects a duplicate username',async()=>{const r=await request(app).post('/api/auth/register').send(credentials);assert.equal(r.status,409);assert.equal(r.body.code,'DUPLICATE_USERNAME');});
 it('rejects invalid registration input',async()=>{const r=await request(app).post('/api/auth/register').send({...credentials,username:'bad'});assert.equal(r.status,400);assert.equal(r.body.code,'VALIDATION_ERROR');});
 it('logs in and issues a new access token',async()=>{const r=await client.post('/api/auth/login').send({username,password:credentials.password});assert.equal(r.status,200);assert.ok(r.body.data.accessToken);accessToken=r.body.data.accessToken;});
 it('rejects an incorrect password',async()=>{const r=await request(app).post('/api/auth/login').send({username,password:'wrong-password'});assert.equal(r.status,401);assert.equal(r.body.code,'INVALID_CREDENTIALS');});
 it('returns the authenticated current user',async()=>{const r=await request(app).get('/api/users/me').set('Authorization',`Bearer ${accessToken}`);assert.equal(r.status,200);assert.equal(r.body.data.username,username);assert.equal('password_hash' in r.body.data,false);});
 it('updates only allowed profile fields',async()=>{const r=await request(app).put('/api/users/me').set('Authorization',`Bearer ${accessToken}`).send({city:'Mumbai'});assert.equal(r.status,200);assert.equal(r.body.data.city,'Mumbai');});
 it('lists users with a bounded paginated result',async()=>{const r=await request(app).get('/api/users?page=1&limit=10').set('Authorization',`Bearer ${accessToken}`);assert.equal(r.status,200);assert.ok(r.body.data.users.length<=10);assert.ok(r.body.data.pagination.total>=1);});
 it('filters the directory by country and city',async()=>{const r=await request(app).get('/api/users?country=India&city=Mumbai&page=1&limit=10').set('Authorization',`Bearer ${accessToken}`);assert.equal(r.status,200);assert.ok(r.body.data.users.some((u:{username:string})=>u.username===username));});
 it('revokes the refresh cookie on logout',async()=>{const r=await client.post('/api/auth/logout').send({});assert.equal(r.status,200);assert.equal(r.body.success,true);});
 it('deactivates only the authenticated account',async()=>{const r=await request(app).delete('/api/users/me').set('Authorization',`Bearer ${accessToken}`);assert.equal(r.status,200);const me=await request(app).get('/api/users/me').set('Authorization',`Bearer ${accessToken}`);assert.equal(me.status,401);});
});

