import type { Request, Response } from 'express';
import { login, register, revokeRefresh, rotateRefresh } from '../services/auth.service';
import { success } from '../utils/response';
import { env } from '../config/env';
const cookieOptions=()=>({httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'strict' as const,path:'/api/auth',maxAge:30*24*60*60*1000});
const client=(req:Request)=>({ip:req.ip||null,ua:req.get('user-agent')??null});
export async function registerController(req:Request,res:Response){const result=await register(req.body,client(req).ip,client(req).ua);res.cookie('refreshToken',result.refreshToken,cookieOptions());success(res,{user:result.user,accessToken:result.accessToken},'Account created',201);}
export async function loginController(req:Request,res:Response){const result=await login(req.body.username,req.body.password,client(req).ip,client(req).ua);res.cookie('refreshToken',result.refreshToken,cookieOptions());success(res,{user:result.user,accessToken:result.accessToken},'Login successful');}
export async function refreshController(req:Request,res:Response){const token=req.cookies?.refreshToken??req.body.refreshToken;if(!token){res.clearCookie('refreshToken',{...cookieOptions(),maxAge:undefined});res.status(401).json({success:false,message:'Refresh token required',code:'INVALID_REFRESH_TOKEN'});return;}const result=await rotateRefresh(token,client(req).ip,client(req).ua);res.cookie('refreshToken',result.refreshToken,cookieOptions());success(res,{accessToken:result.accessToken},'Token refreshed');}
export async function logoutController(req:Request,res:Response){await revokeRefresh(req.cookies?.refreshToken??req.body.refreshToken);res.clearCookie('refreshToken',{...cookieOptions(),maxAge:undefined});success(res,{},'Logged out');}

