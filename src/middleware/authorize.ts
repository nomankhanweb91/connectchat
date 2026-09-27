import type { RequestHandler } from 'express';
import { HttpError } from '../utils/http-error';
export const authorize=(...roles:Array<'USER'|'ADMIN'>):RequestHandler=>(req,_res,next)=>{if(!req.user||!roles.includes(req.user.role))return next(new HttpError(403,'FORBIDDEN','You do not have permission'));next();};

