import { randomBytes, createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

type UserRow = RowDataPacket & { id:string; username:string; name:string; password_hash:string; role:'USER'|'ADMIN'; is_active:number; country:string; city:string; gender:string; profile_image_url:string|null; is_verified:number; last_seen:Date|null; created_at:Date };
const digest=(token:string)=>createHmac('sha256',env.REFRESH_TOKEN_SECRET).update(token).digest('hex');
const ttlMs=(value:string)=>{const m=value.match(/^(\d+)([smhd])$/);if(!m)throw new Error('Token duration must use s, m, h, or d');return Number(m[1])*({s:1000,m:60_000,h:3_600_000,d:86_400_000}[m[2] as 's'|'m'|'h'|'d']);};
const publicUser=(u:UserRow)=>({id:u.id,username:u.username,name:u.name,country:u.country,city:u.city,gender:u.gender,profileImageUrl:u.profile_image_url,role:u.role,isActive:Boolean(u.is_active),isVerified:Boolean(u.is_verified),lastSeen:u.last_seen,createdAt:u.created_at});
export const toPublicUser=publicUser;
function accessToken(u:Pick<UserRow,'id'|'username'|'role'>){return jwt.sign({username:u.username,role:u.role,typ:'access'},env.JWT_SECRET,{subject:u.id,expiresIn:env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']});}
async function createSession(userId:string, ip:string|null, userAgent:string|null){
  const conn=await pool.getConnection();const sessionId=randomUUID();const raw=randomBytes(48).toString('base64url');
  try{await conn.beginTransaction();await conn.execute('INSERT INTO sessions (id,user_id,ip_address,user_agent) VALUES (?,?,?,?)',[sessionId,userId,ip,userAgent]);await conn.execute('INSERT INTO refresh_tokens (id,session_id,token_hash,expires_at) VALUES (?,?,?,?)',[randomUUID(),sessionId,digest(raw),new Date(Date.now()+ttlMs(env.REFRESH_TOKEN_EXPIRES_IN))]);await conn.commit();return raw;}catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function register(input:{name:string;username:string;password:string;country:string;city:string;gender:string;profileImageUrl?:string},ip:string|null,ua:string|null){
 const hash=await bcrypt.hash(input.password,env.BCRYPT_ROUNDS);const id=randomUUID();
 try{await pool.execute('INSERT INTO users (id,username,name,password_hash,country,city,gender,profile_image_url) VALUES (?,?,?,?,?,?,?,?)',[id,input.username,input.name,hash,input.country,input.city,input.gender,input.profileImageUrl??null]);}catch(e){if((e as {code?:string}).code==='ER_DUP_ENTRY')throw new HttpError(409,'DUPLICATE_USERNAME','Username is already taken');throw e;}
 const [rows]=await pool.execute<UserRow[]>('SELECT * FROM users WHERE id=?',[id]);const user=rows[0];if(!user)throw new Error('Created user could not be loaded');return {user:publicUser(user),accessToken:accessToken(user),refreshToken:await createSession(id,ip,ua)};
}
export async function login(username:string,password:string,ip:string|null,ua:string|null){
 const [rows]=await pool.execute<UserRow[]>('SELECT * FROM users WHERE username=? AND is_active=1',[username]);const user=rows[0];if(!user||!(await bcrypt.compare(password,user.password_hash)))throw new HttpError(401,'INVALID_CREDENTIALS','Username or password is incorrect');
 await pool.execute('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=?',[user.id]);return {user:publicUser(user),accessToken:accessToken(user),refreshToken:await createSession(user.id,ip,ua)};
}
export async function rotateRefresh(raw:string,ip:string|null,ua:string|null){
 const conn=await pool.getConnection();try{await conn.beginTransaction();const [rows]=await conn.execute<(RowDataPacket & {id:string;session_id:string;user_id:string;token_expires:Date;is_active:number})[]>('SELECT rt.id,rt.session_id,s.user_id,rt.expires_at AS token_expires,u.is_active FROM refresh_tokens rt JOIN sessions s ON s.id=rt.session_id JOIN users u ON u.id=s.user_id WHERE rt.token_hash=? AND rt.revoked_at IS NULL AND s.revoked_at IS NULL FOR UPDATE',[digest(raw)]);const row=rows[0];if(!row||row.token_expires<=new Date()||!row.is_active)throw new HttpError(401,'INVALID_REFRESH_TOKEN','Refresh token is invalid or expired');
 const [ur]=await conn.execute<UserRow[]>('SELECT * FROM users WHERE id=?',[row.user_id]);const user=ur[0];if(!user)throw new HttpError(401,'INVALID_REFRESH_TOKEN','Refresh token is invalid or expired');
 await conn.execute('UPDATE refresh_tokens SET revoked_at=CURRENT_TIMESTAMP(3) WHERE id=?',[row.id]);const next=randomBytes(48).toString('base64url');await conn.execute('INSERT INTO refresh_tokens (id,session_id,token_hash,expires_at) VALUES (?,?,?,?)',[randomUUID(),row.session_id,digest(next),new Date(Date.now()+ttlMs(env.REFRESH_TOKEN_EXPIRES_IN))]);await conn.execute('UPDATE sessions SET ip_address=?,user_agent=?,last_used_at=CURRENT_TIMESTAMP(3) WHERE id=?',[ip,ua,row.session_id]);await conn.commit();return {accessToken:accessToken(user),refreshToken:next};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function revokeRefresh(raw?:string){if(!raw)return;await pool.execute('UPDATE refresh_tokens SET revoked_at=CURRENT_TIMESTAMP(3) WHERE token_hash=? AND revoked_at IS NULL',[digest(raw)]);}
