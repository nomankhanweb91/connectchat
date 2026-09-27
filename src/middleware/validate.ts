import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from '../utils/http-error';
export const validate = (schema: ZodType, source: 'body'|'query'|'params'='body'): RequestHandler => (req,res,next) => { const parsed=schema.safeParse(req[source]); if(!parsed.success) return next(new HttpError(400,'VALIDATION_ERROR',parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '))); if(source==='query')res.locals.validatedQuery=parsed.data;else if(source==='params')res.locals.validatedParams=parsed.data;else req.body=parsed.data; next(); };
