import { z } from 'zod';
const username = z.string().trim().min(4).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username may contain letters, numbers and underscores');
const password = z.string().min(8).max(128);
export const registerSchema = z.object({ name:z.string().trim().min(1).max(100), username, password, confirmPassword:z.string(), country:z.string().trim().min(1).max(100), city:z.string().trim().min(1).max(100), gender:z.string().trim().min(1).max(40), profileImageUrl:z.string().url().max(2048).optional() }).refine(v=>v.password===v.confirmPassword,{path:['confirmPassword'],message:'Passwords do not match'});
export const loginSchema = z.object({username,password});
export const refreshSchema = z.object({refreshToken:z.string().min(20).optional()});
export const profileSchema = z.object({name:z.string().trim().min(1).max(100).optional(),country:z.string().trim().min(1).max(100).optional(),city:z.string().trim().min(1).max(100).optional(),gender:z.string().trim().min(1).max(40).optional()}).strict().refine(v=>Object.keys(v).length>0,'Provide at least one field to update');
export const listingSchema = z.object({search:z.string().trim().min(1).max(100).optional(),country:z.string().trim().min(1).max(100).optional(),city:z.string().trim().min(1).max(100).optional(),gender:z.string().trim().min(1).max(40).optional(),online:z.enum(['true','false']).transform(v=>v==='true').optional(),page:z.coerce.number().int().min(1).max(10_000).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)});
