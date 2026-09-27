import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { reportCreationLimiter } from '../middleware/abuse-rate-limits';
import { validate } from '../middleware/validate';
import { reportListQuerySchema,reportMessageSchema,reportUserSchema } from '../schemas/moderation.schema';
import { asyncHandler } from '../utils/async-handler';
import { listOwnReportsController,reportMessageController,reportUserController } from '../controllers/moderation.controller';

export const reportsRouter=Router();
reportsRouter.use(authenticate);
reportsRouter.post('/user',reportCreationLimiter,validate(reportUserSchema),asyncHandler(reportUserController));
reportsRouter.post('/message',reportCreationLimiter,validate(reportMessageSchema),asyncHandler(reportMessageController));
reportsRouter.get('/mine',validate(reportListQuerySchema,'query'),asyncHandler(listOwnReportsController));
