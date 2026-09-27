import multer from 'multer';
import os from 'node:os';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

export const imageMultipart=multer({
  dest:os.tmpdir(),
  limits:{fileSize:env.MAX_IMAGE_SIZE_MB*1024*1024,files:1,fields:0,parts:1},
});

export function mapUploadError(error:unknown):never {
  if(error instanceof multer.MulterError){
    if(error.code==='LIMIT_FILE_SIZE')throw new HttpError(413,'IMAGE_TOO_LARGE',`Image exceeds ${env.MAX_IMAGE_SIZE_MB} MB`);
    throw new HttpError(400,'INVALID_UPLOAD',error.code==='LIMIT_FILE_COUNT'?'Only one image may be uploaded':'Upload must contain one image field');
  }
  throw error;
}

