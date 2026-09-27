import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';
type Claims={sub:string;username:string;role:'USER'|'ADMIN';typ:'access'};
export const authenticate:RequestHandler=(req,_res,next)=>{const token=req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return next(new HttpError(401,'UNAUTHENTICATED','Authentication required'));try{const c=jwt.verify(token,env.JWT_SECRET) as Claims;if(c.typ!=='access'||!c.sub)throw new Error('wrong token type');req.user={id:c.sub,username:c.username,role:c.role};next();}catch{next(new HttpError(401,'INVALID_TOKEN','Access token is invalid or expired'));}};
