import { Router } from 'express';
import { loginController, logoutController, refreshController, registerController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema, refreshSchema, registerSchema } from '../schemas/auth.schema';
import { asyncHandler } from '../utils/async-handler';
export const authRouter=Router();
authRouter.post('/register',validate(registerSchema),asyncHandler(registerController));
authRouter.post('/login',validate(loginSchema),asyncHandler(loginController));
authRouter.post('/refresh',validate(refreshSchema),asyncHandler(refreshController));
authRouter.post('/logout',validate(refreshSchema),asyncHandler(logoutController));

