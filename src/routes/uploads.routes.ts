import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { imageMultipart,mapUploadError } from '../middleware/image-upload';
import { imageAccessController,uploadImageController } from '../controllers/uploads.controller';
import { asyncHandler } from '../utils/async-handler';
import { imageUploadLimiter } from '../middleware/image-rate-limit';
import { validate } from '../middleware/validate';
import { uploadIdParamsSchema } from '../schemas/uploads.schema';

export const uploadsRouter=Router();
uploadsRouter.use(authenticate);
uploadsRouter.post('/images',imageUploadLimiter,(req,res,next)=>imageMultipart.single('image')(req,res,error=>{if(error){try{mapUploadError(error);}catch(mapped){next(mapped);}return;}next();}),asyncHandler(uploadImageController));
uploadsRouter.get('/images/:id',validate(uploadIdParamsSchema,'params'),asyncHandler(imageAccessController));

