import { z } from 'zod';
const uuid=z.string().uuid().transform(value=>value.toLowerCase());
export const imageIdSchema=z.object({imageId:uuid}).strict();
export const uploadIdParamsSchema=z.object({id:uuid});

export const imageFormats={
  jpeg:{mimeType:'image/jpeg',extension:'jpg'},
  png:{mimeType:'image/png',extension:'png'},
  webp:{mimeType:'image/webp',extension:'webp'},
} as const;
export type ImageFormat=keyof typeof imageFormats;

export function validateImageFilename(filename:string):string {
  if(filename.length<1||filename.length>255||/[\\/\u0000-\u001f\u007f]/.test(filename)||filename==='.'||filename==='..') throw new Error('Invalid image filename');
  const ext=filename.toLowerCase().split('.').pop();
  if(!ext||!['jpg','jpeg','png','webp'].includes(ext)) throw new Error('Unsupported image filename extension');
  return ext;
}

