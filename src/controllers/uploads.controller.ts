import type { Request,Response } from 'express';
import { getAuthorizedImage, removeUnattachedUpload, storeImage } from '../services/uploads.service';
import { createImageMessage } from '../services/messages.service';
import { isConversationMember } from '../services/conversations.service';
import { storageService } from '../storage/storage-service';
import { HttpError } from '../utils/http-error';
import { success } from '../utils/response';
import { emitMessageNew } from '../realtime/socket-server';
import { imageIdSchema } from '../schemas/uploads.schema';

const requireFile=(req:Request)=>{if(!req.file)throw new HttpError(400,'IMAGE_REQUIRED','Upload one image in the "image" field');return req.file;};
async function cleanStagedImage(userId:string,imageId:string):Promise<void>{try{await removeUnattachedUpload(userId,imageId);}catch(error){console.error('Unable to clean up unattached image upload',imageId,error instanceof Error?error.message:'Unknown error');}}
export async function uploadImageController(req:Request,res:Response){const{ id,url,mimeType,width,height,sizeBytes }=await storeImage(req.user!.id,requireFile(req));success(res,{id,url,mimeType,width,height,sizeBytes},'Image uploaded',201);}
export async function sendImageMessageController(req:Request,res:Response){
 const{conversationId}=res.locals.validatedParams as {conversationId:string};
 if(!(await isConversationMember(req.user!.id,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
 const uploadedFile=req.file?await storeImage(req.user!.id,req.file):undefined;
 const parsed=imageIdSchema.safeParse({imageId:uploadedFile?.id??(req.body as {imageId?:unknown}|undefined)?.imageId});
 if(!parsed.success){if(uploadedFile)await cleanStagedImage(req.user!.id,uploadedFile.id);throw new HttpError(400,'IMAGE_REQUIRED','Upload one image or provide an imageId');}
 try{const message=await createImageMessage(req.user!.id,conversationId,parsed.data.imageId);emitMessageNew(message);success(res,message,'Image message sent',201);}
 catch(error){await cleanStagedImage(req.user!.id,parsed.data.imageId);throw error;}
}
export async function imageAccessController(req:Request,res:Response){
 const{id}=res.locals.validatedParams as {id:string};const image=await getAuthorizedImage(req.user!.id,id);
 res.setHeader('Content-Type',image.mimeType);res.setHeader('Content-Length',image.sizeBytes);res.setHeader('Content-Disposition',`inline; filename="image.${image.mimeType==='image/jpeg'?'jpg':image.mimeType.split('/')[1]}"`);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const stream=storageService.openReadStream(image.storageKey);stream.on('error',error=>{if(!res.headersSent)res.status(404).json({success:false,message:'Image not found',code:'IMAGE_NOT_FOUND'});else res.destroy(error);});stream.pipe(res);
}

