import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/async-handler';
import { createConversationController, createMessageController, getConversationController, listConversationsController, listMessagesController, markMessageReadController } from '../controllers/conversations.controller';
import { conversationParamsSchema, createConversationSchema, messagePageSchema, messageParamsSchema, sendMessageSchema } from '../schemas/messaging.schema';

export const conversationsRouter=Router();
conversationsRouter.use(authenticate);
conversationsRouter.post('/',validate(createConversationSchema),asyncHandler(createConversationController));
conversationsRouter.get('/',asyncHandler(listConversationsController));
conversationsRouter.post('/:conversationId/messages/:messageId/read',validate(messageParamsSchema,'params'),asyncHandler(markMessageReadController));
conversationsRouter.get('/:conversationId/messages',validate(conversationParamsSchema,'params'),validate(messagePageSchema,'query'),asyncHandler(listMessagesController));
conversationsRouter.post('/:conversationId/messages',validate(conversationParamsSchema,'params'),validate(sendMessageSchema),asyncHandler(createMessageController));
conversationsRouter.get('/:conversationId',validate(conversationParamsSchema,'params'),asyncHandler(getConversationController));
