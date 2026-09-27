import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

/** Per-user quota for both staged uploads and direct image-message sends. */
export const imageUploadLimiter=rateLimit({windowMs:15*60*1000,limit:env.IMAGE_UPLOADS_PER_15_MINUTES,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`user:${req.user!.id}`,message:{success:false,message:'Image upload rate limit exceeded',code:'RATE_LIMITED'}});

