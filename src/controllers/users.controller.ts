import type { Request, Response } from 'express';
import { deactivateMe, getMe, getPublicProfile, listUsers, updateMe } from '../services/users.service';
import { success } from '../utils/response';
export async function meController(req:Request,res:Response){success(res,await getMe(req.user!.id));}
export async function updateMeController(req:Request,res:Response){success(res,await updateMe(req.user!.id,req.body),'Profile updated');}
export async function deleteMeController(req:Request,res:Response){await deactivateMe(req.user!.id);res.clearCookie('refreshToken',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/auth'});success(res,{},'Account deactivated');}
export async function listUsersController(req:Request,res:Response){success(res,await listUsers(req.user!.id,res.locals.validatedQuery as {search?:string;country?:string;city?:string;gender?:string;online?:boolean;page:number;limit:number}),'Users fetched successfully');}
export async function publicProfileController(req:Request,res:Response){success(res,await getPublicProfile(req.params.id!),'User profile fetched successfully');}
