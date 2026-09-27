import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
const userKey=(req:Request)=>`user:${req.user!.id}`;
export const blockActionLimiter=rateLimit({windowMs:60*60*1000,limit:env.BLOCK_ACTIONS_PER_HOUR,standardHeaders:true,legacyHeaders:false,keyGenerator:userKey,message:{success:false,message:'Block action rate limit exceeded',code:'RATE_LIMITED'}});
export const reportCreationLimiter=rateLimit({windowMs:60*60*1000,limit:env.REPORTS_PER_HOUR,standardHeaders:true,legacyHeaders:false,keyGenerator:userKey,message:{success:false,message:'Report creation rate limit exceeded',code:'RATE_LIMITED'}});
export const messageSendLimiter=rateLimit({windowMs:60*1000,limit:env.MESSAGE_SENDS_PER_MINUTE,standardHeaders:true,legacyHeaders:false,keyGenerator:userKey,message:{success:false,message:'Message send rate limit exceeded',code:'RATE_LIMITED'}});
