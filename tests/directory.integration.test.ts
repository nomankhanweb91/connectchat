import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/config/database';

const enabled=process.env.RUN_MYSQL_INTEGRATION==='true';
const suffix=randomUUID().replaceAll('-','').slice(0,12);
const country=`TestCountry_${suffix}`;
const userData=[
 {name:'Directory Owner',city:'OwnerCity',gender:'Other'},
 {name:'Jane Directory',city:'NorthCity',gender:'Female'},
 {name:'Offline Directory',city:'SouthCity',gender:'Male'}
].map((user,index)=>({...user,username:`ph2_${suffix}_${index}`,password:'safe-test-password-123',confirmPassword:'safe-test-password-123',country}));
const ids:string[]=[];
let ownerToken='';
let peerToken='';
let peerId='';
let peerUsername='';

describe('MySQL-backed user directory and public profiles',{skip:!enabled},()=>{
 before(async()=>{
  for(const [index,data] of userData.entries()){
   const result=await request(app).post('/api/auth/register').send(data);
   assert.equal(result.status,201);
   ids.push(result.body.data.user.id);
   if(index===0)ownerToken=result.body.data.accessToken;
   if(index===1){peerId=result.body.data.user.id;peerUsername=data.username;peerToken=result.body.data.accessToken;}
  }
  await request(app).get('/api/users/me').set('Authorization',`Bearer ${ownerToken}`);
  await request(app).get('/api/users/me').set('Authorization',`Bearer ${peerToken}`);
  await pool.execute('UPDATE users SET last_seen=DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) WHERE id=?',[ids[2]!]);
 });
 after(async()=>{for(const id of ids)await pool.execute('DELETE FROM users WHERE id=?',[id]);await pool.end();});

 it('requires authentication for directory results',async()=>{const r=await request(app).get('/api/users');assert.equal(r.status,401);});
 it('returns an empty directory for an unmatched filter',async()=>{const r=await request(app).get(`/api/users?country=${country}_none`).set('Authorization',`Bearer ${ownerToken}`);assert.equal(r.status,200);assert.deepEqual(r.body.data.users,[]);assert.equal(r.body.data.pagination.total,0);});
 it('returns multiple matching users with pagination metadata',async()=>{const r=await request(app).get(`/api/users?country=${country}`).set('Authorization',`Bearer ${ownerToken}`);assert.equal(r.status,200);assert.equal(r.body.data.users.length,2);assert.equal(r.body.data.pagination.total,2);assert.equal(r.body.data.pagination.totalPages,1);});
 it('excludes the authenticated user from directory results',async()=>{const r=await request(app).get(`/api/users?country=${country}`).set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.every((u:{id:string})=>u.id!==ids[0]));});
 it('searches by username',async()=>{const r=await request(app).get(`/api/users?search=${peerUsername}`).set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.some((u:{id:string})=>u.id===peerId));});
 it('searches by display name',async()=>{const r=await request(app).get('/api/users?search=Jane%20Directory').set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.some((u:{id:string})=>u.id===peerId));});
 it('filters by country',async()=>{const r=await request(app).get(`/api/users?country=${country}`).set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.length>0);assert.ok(r.body.data.users.every((u:{country:string})=>u.country===country));});
 it('filters by city',async()=>{const r=await request(app).get('/api/users?city=NorthCity').set('Authorization',`Bearer ${ownerToken}`);assert.deepEqual(r.body.data.users.map((u:{id:string})=>u.id),[peerId]);});
 it('filters by gender',async()=>{const r=await request(app).get('/api/users?gender=Female').set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.every((u:{gender:string})=>u.gender==='Female'));});
 it('filters online users using recent last_seen activity',async()=>{const r=await request(app).get('/api/users?online=true').set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.some((u:{id:string;isOnline:boolean})=>u.id===peerId&&u.isOnline));assert.ok(r.body.data.users.every((u:{isOnline:boolean})=>u.isOnline));});
 it('filters offline users using the configured threshold',async()=>{const r=await request(app).get('/api/users?online=false').set('Authorization',`Bearer ${ownerToken}`);assert.ok(r.body.data.users.some((u:{id:string;isOnline:boolean})=>u.id===ids[2]&&!u.isOnline));});
 it('combines country, city, gender, and online filters',async()=>{const r=await request(app).get(`/api/users?country=${country}&city=NorthCity&gender=Female&online=true`).set('Authorization',`Bearer ${ownerToken}`);assert.deepEqual(r.body.data.users.map((u:{id:string})=>u.id),[peerId]);});
 it('paginates with a deterministic page size',async()=>{const first=await request(app).get(`/api/users?country=${country}&page=1&limit=1`).set('Authorization',`Bearer ${ownerToken}`);const second=await request(app).get(`/api/users?country=${country}&page=2&limit=1`).set('Authorization',`Bearer ${ownerToken}`);assert.equal(first.body.data.users.length,1);assert.equal(second.body.data.users.length,1);assert.equal(first.body.data.pagination.totalPages,2);assert.notEqual(first.body.data.users[0].id,second.body.data.users[0].id);});
 it('rejects page sizes above the server maximum',async()=>{const r=await request(app).get('/api/users?limit=101').set('Authorization',`Bearer ${ownerToken}`);assert.equal(r.status,400);assert.equal(r.body.code,'VALIDATION_ERROR');});
 it('returns only the public directory DTO fields',async()=>{const r=await request(app).get(`/api/users?country=${country}`).set('Authorization',`Bearer ${ownerToken}`);const user=r.body.data.users[0];assert.deepEqual(Object.keys(user).sort(),['city','country','gender','id','isOnline','isVerified','lastSeen','name','profileImageUrl','username'].sort());});
 it('serves a public profile without authentication and omits private fields',async()=>{const r=await request(app).get(`/api/users/${peerId}`);assert.equal(r.status,200);assert.equal(r.body.data.id,peerId);assert.deepEqual(Object.keys(r.body.data).sort(),['city','country','gender','id','isOnline','isVerified','lastSeen','name','profileImageUrl','username'].sort());});
 it('rejects malformed query values and overlong search terms',async()=>{for(const query of ['online=maybe','page=0','limit=101',`search=${'x'.repeat(101)}`]){const r=await request(app).get(`/api/users?${query}`).set('Authorization',`Bearer ${ownerToken}`);assert.equal(r.status,400,query);}});
});
