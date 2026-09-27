import { Router } from 'express';
import { deleteMeController, listUsersController, meController, publicProfileController, updateMeController } from '../controllers/users.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { listingSchema, profileSchema } from '../schemas/auth.schema';
import { asyncHandler } from '../utils/async-handler';
export const usersRouter=Router();
usersRouter.get('/me',authenticate,asyncHandler(meController));
usersRouter.put('/me',authenticate,validate(profileSchema),asyncHandler(updateMeController));
usersRouter.delete('/me',authenticate,asyncHandler(deleteMeController));
usersRouter.get('/:id',asyncHandler(publicProfileController));
usersRouter.get('/',authenticate,validate(listingSchema,'query'),asyncHandler(listUsersController));

