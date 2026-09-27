import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { env } from '../config/env';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';
type Claims={sub:string;username:string;role:'USER'|'ADMIN';typ:'access'};
export const authenticate:RequestHandler=(req,_res,next)=>{const token=req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return next(new HttpError(401,'UNAUTHENTICATED','Authentication required'));try{const c=jwt.verify(token,env.JWT_SECRET) as Claims;if(c.typ!=='access'||!c.sub)throw new Error('wrong token type');req.user={id:c.sub,username:c.username,role:c.role};void pool.execute<ResultSetHeader>('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=? AND is_active=1',[c.sub]).then(async([result])=>{if(result.affectedRows===0){const [active]=await pool.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM users WHERE id=? AND is_active=1',[c.sub]);if(active.length===0)return next(new HttpError(401,'ACCOUNT_INACTIVE','Account is inactive'));}next();}).catch(next);}catch{next(new HttpError(401,'INVALID_TOKEN','Access token is invalid or expired'));}};
