import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export interface AccessClaims { sub:string; username:string; role:'USER'|'ADMIN'; typ:'access'; }
export function verifyAccessToken(token:string):AccessClaims {
  try { const claims=jwt.verify(token,env.JWT_SECRET) as AccessClaims;if(claims.typ!=='access'||!claims.sub||!claims.username||!['USER','ADMIN'].includes(claims.role))throw new Error('Invalid access token claims');return claims; }
  catch { throw new HttpError(401,'INVALID_TOKEN','Access token is invalid or expired'); }
}
