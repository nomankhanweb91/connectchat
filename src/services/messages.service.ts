import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';
import type { MessageDto, MessageStatus } from '../types/messaging.dto';
import { isConversationMember } from './conversations.service';
import { hasBlockBetween } from './blocks-check.service';

type MessageRow=RowDataPacket&{id:string;conversation_id:string;sender_id:string;message_type:'TEXT'|'IMAGE';content:string;created_at:Date;updated_at:Date;status:MessageStatus;delivered_at:Date|null;read_at:Date|null;image_id?:string|null;mime_type?:string|null;width?:number|null;height?:number|null;size_bytes?:number|null};
function toMessage(row:MessageRow):MessageDto{return {id:row.id,conversationId:row.conversation_id,senderId:row.sender_id,messageType:row.message_type,content:row.content,...(row.image_id?{image:{id:row.image_id,url:`/api/uploads/images/${row.image_id}`,mimeType:row.mime_type!,width:Number(row.width),height:Number(row.height),sizeBytes:Number(row.size_bytes)}}:{}),createdAt:row.created_at,updatedAt:row.updated_at,status:row.status,deliveredAt:row.delivered_at,readAt:row.read_at};}

export async function createMessage(senderId:string,conversationId:string,content:string):Promise<MessageDto>{
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  await connection.execute('SELECT id FROM conversations WHERE id=? FOR UPDATE',[conversationId]);
  const [members]=await connection.execute<(RowDataPacket&{user_id:string})[]>('SELECT user_id FROM conversation_members WHERE conversation_id=? FOR UPDATE',[conversationId]);
  if(!members.some(member=>member.user_id===senderId))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
  const recipients=members.filter(member=>member.user_id!==senderId);
  if(members.length!==2||recipients.length!==1)throw new HttpError(409,'INVALID_CONVERSATION','Conversation must have exactly two members');
  if(await hasBlockBetween(senderId,recipients[0]!.user_id,connection))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
  const id=randomUUID();
  await connection.execute('INSERT INTO messages (id,conversation_id,sender_id,message_type,content) VALUES (?,?,?,\'TEXT\',?)',[id,conversationId,senderId,content]);
  await connection.execute('INSERT INTO message_receipts (message_id,user_id) VALUES (?,?)',[id,recipients[0]!.user_id]);
  await connection.execute('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[conversationId]);
  await connection.commit();
  const [rows]=await pool.execute<MessageRow[]>(`SELECT m.id,m.conversation_id,m.sender_id,m.message_type,m.content,m.created_at,m.updated_at,'SENT' AS status,NULL AS delivered_at,NULL AS read_at FROM messages m WHERE m.id=?`,[id]);
  if(!rows[0])throw new Error('Persisted message could not be loaded');return toMessage(rows[0]);
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

export async function createImageMessage(senderId:string,conversationId:string,imageId:string):Promise<MessageDto>{
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  await connection.execute('SELECT id FROM conversations WHERE id=? FOR UPDATE',[conversationId]);
  const[members]=await connection.execute<(RowDataPacket&{user_id:string})[]>('SELECT user_id FROM conversation_members WHERE conversation_id=? FOR UPDATE',[conversationId]);
  if(!members.some(member=>member.user_id===senderId))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
  const recipient=members.find(member=>member.user_id!==senderId);
  if(members.length!==2||!recipient)throw new HttpError(409,'INVALID_CONVERSATION','Conversation must have exactly two members');
  if(await hasBlockBetween(senderId,recipient.user_id,connection))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
  const[uploads]=await connection.execute<(RowDataPacket&{id:string;storage_key:string;mime_type:string;width:number;height:number;size_bytes:number})[]>('SELECT u.id,u.storage_key,u.mime_type,u.width,u.height,u.size_bytes FROM uploads u WHERE u.id=? AND u.uploaded_by=? AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.image_upload_id=u.id) FOR UPDATE',[imageId,senderId]);
  const upload=uploads[0];if(!upload)throw new HttpError(404,'IMAGE_NOT_FOUND','Uploaded image not found or already used');
  const id=randomUUID();
  await connection.execute('INSERT INTO messages (id,conversation_id,sender_id,message_type,content,image_upload_id) VALUES (?,?,?,\'IMAGE\',\'\',?)',[id,conversationId,senderId,imageId]);
  await connection.execute('INSERT INTO message_receipts (message_id,user_id) VALUES (?,?)',[id,recipient.user_id]);
  await connection.execute('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[conversationId]);
  const[rows]=await connection.execute<MessageRow[]>(`SELECT m.id,m.conversation_id,m.sender_id,m.message_type,m.content,m.created_at,m.updated_at,'SENT' AS status,NULL AS delivered_at,NULL AS read_at,u.id AS image_id,u.mime_type,u.width,u.height,u.size_bytes FROM messages m JOIN uploads u ON u.id=m.image_upload_id WHERE m.id=?`,[id]);
  const row=rows[0];if(!row)throw new Error('Persisted image message could not be loaded');
  await connection.commit();return toMessage(row);
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

export async function listMessages(userId:string,conversationId:string,page:number,limit:number){
 if(!(await isConversationMember(userId,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
 const [count]=await pool.execute<(RowDataPacket&{total:number})[]>('SELECT COUNT(*) AS total FROM messages WHERE conversation_id=?',[conversationId]);
 const [rows]=await pool.execute<MessageRow[]>(`SELECT m.id,m.conversation_id,m.sender_id,m.message_type,m.content,m.created_at,m.updated_at,CASE WHEN r.read_at IS NOT NULL THEN 'READ' WHEN r.delivered_at IS NOT NULL THEN 'DELIVERED' ELSE 'SENT' END AS status,r.delivered_at,r.read_at,u.id AS image_id,u.mime_type,u.width,u.height,u.size_bytes FROM messages m LEFT JOIN message_receipts r ON r.message_id=m.id AND r.user_id<>m.sender_id LEFT JOIN uploads u ON u.id=m.image_upload_id WHERE m.conversation_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`,[conversationId,limit,(page-1)*limit]);
 const total=Number(count[0]?.total??0);return {messages:rows.reverse().map(toMessage),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
}

export async function markMessageDelivered(recipientId:string,messageId:string){
 const[conversationRows]=await pool.execute<(RowDataPacket&{conversation_id:string})[]>('SELECT m.conversation_id FROM message_receipts r JOIN messages m ON m.id=r.message_id WHERE r.message_id=? AND r.user_id=?',[messageId,recipientId]);const conversationId=conversationRows[0]?.conversation_id;if(!conversationId)throw new HttpError(403,'MESSAGE_RECEIPT_FORBIDDEN','Only the recipient can acknowledge delivery');if(!(await isConversationMember(recipientId,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
 const [result]=await pool.execute('UPDATE message_receipts r JOIN messages m ON m.id=r.message_id SET r.delivered_at=COALESCE(r.delivered_at,CURRENT_TIMESTAMP(3)) WHERE r.message_id=? AND r.user_id=? AND m.sender_id<>r.user_id',[messageId,recipientId]);
 if(!('affectedRows'in result)||result.affectedRows===0){const [rows]=await pool.execute<(RowDataPacket&{conversation_id:string;delivered_at:Date|null;read_at:Date|null})[]>('SELECT m.conversation_id,r.delivered_at,r.read_at FROM message_receipts r JOIN messages m ON m.id=r.message_id WHERE r.message_id=? AND r.user_id=?',[messageId,recipientId]);const row=rows[0];if(!row)throw new HttpError(403,'MESSAGE_RECEIPT_FORBIDDEN','Only the recipient can acknowledge delivery');return {conversationId:row.conversation_id,messageId,status:row.read_at?'READ' as const:'DELIVERED' as const,deliveredAt:row.delivered_at,readAt:row.read_at};}
 const [rows]=await pool.execute<(RowDataPacket&{conversation_id:string;delivered_at:Date|null;read_at:Date|null})[]>('SELECT m.conversation_id,r.delivered_at,r.read_at FROM message_receipts r JOIN messages m ON m.id=r.message_id WHERE r.message_id=? AND r.user_id=?',[messageId,recipientId]);const row=rows[0];if(!row)throw new HttpError(404,'MESSAGE_NOT_FOUND','Message not found');return {conversationId:row.conversation_id,messageId,status:row.read_at?'READ' as const:'DELIVERED' as const,deliveredAt:row.delivered_at,readAt:row.read_at};
}

export function markMessageRead(userId:string,conversationId:string,messageId:string):Promise<{conversationId:string;messageId:string;status:'READ';deliveredAt:Date|null;readAt:Date|null;deliveryWasNew:boolean}>;
export function markMessageRead(userId:string,messageId:string):Promise<{conversationId:string;messageId:string;status:'READ';deliveredAt:Date|null;readAt:Date|null;deliveryWasNew:boolean}>;
export async function markMessageRead(userId:string,conversationIdOrMessageId:string,optionalMessageId?:string){
 const messageId=optionalMessageId??conversationIdOrMessageId;
 let conversationId=optionalMessageId?conversationIdOrMessageId:undefined;
 if(!conversationId){const [rows]=await pool.execute<(RowDataPacket&{conversation_id:string})[]>('SELECT m.conversation_id FROM messages m JOIN message_receipts r ON r.message_id=m.id WHERE r.message_id=? AND r.user_id=?',[messageId,userId]);conversationId=rows[0]?.conversation_id;if(!conversationId)throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');}
 if(!(await isConversationMember(userId,conversationId)))throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');
 const [messages]=await pool.execute<(RowDataPacket&{sender_id:string})[]>('SELECT sender_id FROM messages WHERE id=? AND conversation_id=?',[messageId,conversationId]);const message=messages[0];
 if(!message)throw new HttpError(404,'MESSAGE_NOT_FOUND','Message not found');
 if(message.sender_id===userId)throw new HttpError(403,'MESSAGE_READ_FORBIDDEN','You cannot mark your own message as read');
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  const [receipts]=await connection.execute<(RowDataPacket&{delivered_at:Date|null})[]>('SELECT delivered_at FROM message_receipts WHERE message_id=? AND user_id=? FOR UPDATE',[messageId,userId]);
  const receipt=receipts[0];
  if(!receipt)throw new HttpError(403,'MESSAGE_READ_FORBIDDEN','Only the recipient can mark this message as read');
  const deliveryWasNew=receipt.delivered_at===null;
  await connection.execute('UPDATE message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP(3)),read_at=COALESCE(read_at,CURRENT_TIMESTAMP(3)) WHERE message_id=? AND user_id=?',[messageId,userId]);
  const [rows]=await connection.execute<(RowDataPacket&{delivered_at:Date|null;read_at:Date|null})[]>('SELECT delivered_at,read_at FROM message_receipts WHERE message_id=? AND user_id=?',[messageId,userId]);
  const updated=rows[0];
  if(!updated)throw new HttpError(403,'MESSAGE_READ_FORBIDDEN','Only the recipient can mark this message as read');
  await connection.commit();
  return {conversationId,messageId,status:'READ' as const,deliveredAt:updated.delivered_at,readAt:updated.read_at,deliveryWasNew};
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
