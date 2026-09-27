import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import { createConversationController, createMessageController, getConversationController, listConversationsController, listMessagesController, markMessageReadController } from '../controllers/conversations.controller';
import { conversationParamsSchema, createConversationSchema, messagePageSchema, messageParamsSchema, sendMessageSchema } from '../schemas/messaging.schema';
import { imageMultipart,mapUploadError } from '../middleware/image-upload';
import { sendImageMessageController } from '../controllers/uploads.controller';
import { isConversationMember } from '../services/conversations.service';
import { HttpError } from '../utils/http-error';
import { imageUploadLimiter } from '../middleware/image-rate-limit';

export const conversationsRouter=Router();
conversationsRouter.use(authenticate);
conversationsRouter.post('/',validate(createConversationSchema),asyncHandler(createConversationController));
conversationsRouter.get('/',asyncHandler(listConversationsController));
conversationsRouter.post('/:conversationId/messages/:messageId/read',validate(messageParamsSchema,'params'),asyncHandler(markMessageReadController));
conversationsRouter.get('/:conversationId/messages',validate(conversationParamsSchema,'params'),validate(messagePageSchema,'query'),asyncHandler(listMessagesController));
conversationsRouter.post('/:conversationId/messages',validate(conversationParamsSchema,'params'),validate(sendMessageSchema),asyncHandler(createMessageController));
conversationsRouter.post('/:conversationId/messages/image',imageUploadLimiter,validate(conversationParamsSchema,'params'),(req,res,next)=>{void (async()=>{const {conversationId}=res.locals.validatedParams as {conversationId:string};if(!(await isConversationMember(req.user!.id,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');if(!req.is('multipart/form-data')){next();return;}imageMultipart.single('image')(req,res,error=>{if(error){try{mapUploadError(error);}catch(mapped){next(mapped);}return;}next();});})().catch(next);},asyncHandler(sendImageMessageController));
conversationsRouter.get('/:conversationId',validate(conversationParamsSchema,'params'),asyncHandler(getConversationController));

