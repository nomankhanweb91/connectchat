import type { RequestHandler } from 'express';
import { authenticate } from './authenticate';

/** Preserve anonymous public profiles while applying viewer-specific privacy when a bearer token is supplied. */
export const optionalAuthenticate:RequestHandler=(req,res,next)=>{
  if(!req.headers.authorization)return next();
  return authenticate(req,res,next);
};
