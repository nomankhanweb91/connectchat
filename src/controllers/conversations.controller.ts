import type { Request, Response } from 'express';
import { createOrGetConversation, getConversation, listConversations } from '../services/conversations.service';
import { createMessage, listMessages, markMessageRead } from '../services/messages.service';
import { emitMessageNew, emitMessageRead } from '../realtime/socket-server';
import { success } from '../utils/response';

type ConversationParams={conversationId:string};
type MessageParams=ConversationParams&{messageId:string};
export async function createConversationController(req:Request,res:Response){success(res,await createOrGetConversation(req.user!.id,req.body.userId),'Conversation ready',201);}
export async function listConversationsController(req:Request,res:Response){success(res,await listConversations(req.user!.id),'Conversations fetched successfully');}
export async function getConversationController(req:Request,res:Response){const {conversationId}=res.locals.validatedParams as ConversationParams;success(res,await getConversation(req.user!.id,conversationId));}
export async function listMessagesController(req:Request,res:Response){const {conversationId}=res.locals.validatedParams as ConversationParams;const {page,limit}=res.locals.validatedQuery as {page:number;limit:number};success(res,await listMessages(req.user!.id,conversationId,page,limit),'Messages fetched successfully');}
export async function createMessageController(req:Request,res:Response){const {conversationId}=res.locals.validatedParams as ConversationParams;const message=await createMessage(req.user!.id,conversationId,req.body.content);emitMessageNew(message);success(res,message,'Message sent',201);}
export async function markMessageReadController(req:Request,res:Response){const {conversationId,messageId}=res.locals.validatedParams as MessageParams;const receipt=await markMessageRead(req.user!.id,conversationId,messageId);emitMessageRead(receipt,req.user!.id);success(res,receipt,'Message marked as read');}

