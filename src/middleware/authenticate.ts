import type { RequestHandler } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';
import { verifyAccessToken } from '../services/access-token';
export const authenticate:RequestHandler=(req,_res,next)=>{const token=req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return next(new HttpError(401,'UNAUTHENTICATED','Authentication required'));try{const c=verifyAccessToken(token);req.user={id:c.sub,username:c.username,role:c.role};void pool.execute<ResultSetHeader>('UPDATE users SET last_seen=CURRENT_TIMESTAMP(3) WHERE id=? AND is_active=1',[c.sub]).then(async([result])=>{if(result.affectedRows===0){const [active]=await pool.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM users WHERE id=? AND is_active=1',[c.sub]);if(active.length===0)return next(new HttpError(401,'ACCOUNT_INACTIVE','Account is inactive'));}next();}).catch(next);}catch(error){next(error instanceof HttpError?error:new HttpError(401,'INVALID_TOKEN','Access token is invalid or expired'));}};
