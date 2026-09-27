import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { env } from '../config/env';
import { imageFormats, validateImageFilename, type ImageFormat } from '../schemas/uploads.schema';
import { storageService } from '../storage/storage-service';
import { HttpError } from '../utils/http-error';

export interface ImageDto { id:string; url:string; mimeType:string; width:number; height:number; sizeBytes:number; }
export interface StoredUpload extends ImageDto { storageKey:string; originalFilename:string; uploadedBy:string; }
export async function storeImage(userId:string,file:Express.Multer.File):Promise<StoredUpload>{
  let storedKey:string|undefined;
  try {
    if(file.size>env.MAX_IMAGE_SIZE_MB*1024*1024) throw new HttpError(413,'IMAGE_TOO_LARGE',`Image exceeds ${env.MAX_IMAGE_SIZE_MB} MB`);
    let ext:string;
    try { ext=validateImageFilename(file.originalname); } catch { throw new HttpError(400,'INVALID_IMAGE_FILENAME','Image filename is invalid or unsupported'); }
    let metadata:{format?:string;width?:number;height?:number};
    try { metadata=await sharp(file.path,{limitInputPixels:40_000_000}).metadata(); await sharp(file.path,{limitInputPixels:40_000_000}).stats(); } catch { throw new HttpError(400,'INVALID_IMAGE_CONTENT','File is not a valid supported image'); }
    const format=metadata.format as ImageFormat;
    if(!format||!(format in imageFormats))throw new HttpError(415,'UNSUPPORTED_IMAGE_TYPE','Only JPEG, PNG, and WebP images are supported');
    const expected=imageFormats[format];
    if(file.mimetype!==expected.mimeType||!(format==='jpeg'?(ext==='jpg'||ext==='jpeg'):ext===expected.extension))throw new HttpError(415,'IMAGE_TYPE_MISMATCH','Image content, MIME type, and filename extension must match');
    const width=metadata.width??0,height=metadata.height??0;
    if(width<1||height<1||width>12000||height>12000||width*height>40_000_000)throw new HttpError(400,'INVALID_IMAGE_DIMENSIONS','Image dimensions are not supported');
    const id=randomUUID(),storageKey=`${id}.${expected.extension}`;
    await storageService.put(file.path,storageKey);storedKey=storageKey;
    await pool.execute('INSERT INTO uploads (id,storage_key,original_filename,mime_type,size_bytes,width,height,uploaded_by) VALUES (?,?,?,?,?,?,?,?)',[id,storageKey,path.basename(file.originalname),expected.mimeType,file.size,width,height,userId]);
    return {id,url:`/api/uploads/images/${id}`,mimeType:expected.mimeType,width,height,sizeBytes:file.size,storageKey,originalFilename:path.basename(file.originalname),uploadedBy:userId};
  } catch(error) {
    if(storedKey)await storageService.delete(storedKey).catch(cleanupError=>console.error('Unable to clean up stored image after failed database write',storedKey,cleanupError instanceof Error?cleanupError.message:'Unknown error'));
    throw error;
  } finally { await unlink(file.path).catch(()=>undefined); }
}

export async function removeUnattachedUpload(userId:string,id:string):Promise<void>{
  const connection=await pool.getConnection();
  try{await connection.beginTransaction();const[rows]=await connection.execute<(RowDataPacket&{storage_key:string})[]>('SELECT u.storage_key FROM uploads u WHERE u.id=? AND u.uploaded_by=? AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.image_upload_id=u.id) FOR UPDATE',[id,userId]);const row=rows[0];if(row){await storageService.delete(row.storage_key);await connection.execute('DELETE FROM uploads WHERE id=?',[id]);await connection.commit();return;}await connection.rollback();}
  catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

export async function getAuthorizedImage(userId:string,id:string){
  const[rows]=await pool.execute<(RowDataPacket&{storage_key:string;mime_type:string;size_bytes:number;conversation_id:string|null;uploaded_by:string})[]>('SELECT u.storage_key,u.mime_type,u.size_bytes,u.uploaded_by,m.conversation_id FROM uploads u LEFT JOIN messages m ON m.image_upload_id=u.id WHERE u.id=?',[id]);
  const image=rows[0];if(!image)throw new HttpError(404,'IMAGE_NOT_FOUND','Image not found');
  if(image.conversation_id){const[members]=await pool.execute<(RowDataPacket&{present:number})[]>('SELECT 1 AS present FROM conversation_members WHERE conversation_id=? AND user_id=?',[image.conversation_id,userId]);if(!members.length)throw new HttpError(404,'IMAGE_NOT_FOUND','Image not found');}
  else if(image.uploaded_by!==userId)throw new HttpError(404,'IMAGE_NOT_FOUND','Image not found');
  return {storageKey:image.storage_key,mimeType:image.mime_type,sizeBytes:Number(image.size_bytes)};
}

