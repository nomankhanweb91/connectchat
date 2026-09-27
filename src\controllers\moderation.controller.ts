import type { Request,Response } from 'express';
import { blockUser,unblockUser,listBlockedUsers } from '../services/blocks.service';
import { createMessageReport,createUserReport,listOwnReports } from '../services/reports.service';
import { evictConversationRoom } from '../realtime/socket-server';
import { success } from '../utils/response';
import type { reportReasons } from '../schemas/moderation.schema';
type Reason=typeof reportReasons[number];
export async function blockUserController(req:Request,res:Response){const{userId}=res.locals.validatedParams as {userId:string};const{conversationId,...data}=await blockUser(req.user!.id,userId);if(conversationId)evictConversationRoom(conversationId);success(res,data,data.created?'User blocked':'User was already blocked');}
export async function unblockUserController(req:Request,res:Response){const{userId}=res.locals.validatedParams as {userId:string};success(res,await unblockUser(req.user!.id,userId),'User unblocked');}
export async function listBlockedUsersController(req:Request,res:Response){const{page,limit}=res.locals.validatedQuery as {page:number;limit:number};success(res,await listBlockedUsers(req.user!.id,page,limit),'Blocked users fetched');}
export async function reportUserController(req:Request,res:Response){const{userId,reason,description}=req.body as {userId:string;reason:Reason;description?:string};success(res,await createUserReport(req.user!.id,userId,reason,description),'User report submitted',201);}
export async function reportMessageController(req:Request,res:Response){const{messageId,reason,description}=req.body as {messageId:string;reason:Reason;description?:string};success(res,await createMessageReport(req.user!.id,messageId,reason,description),'Message report submitted',201);}
export async function listOwnReportsController(req:Request,res:Response){const{page,limit}=res.locals.validatedQuery as {page:number;limit:number};success(res,await listOwnReports(req.user!.id,page,limit),'Your reports fetched');}
