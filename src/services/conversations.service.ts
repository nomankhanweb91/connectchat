import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';
import type { ConversationDto, ConversationSummaryDto, MessageDto } from '../types/messaging.dto';
import { onlineStatusExpression } from './online-status';

type ConversationRow=RowDataPacket&{conversation_id:string;created_at:Date;updated_at:Date;other_id:string;username:string;name:string;profile_image_url:string|null;is_verified:number;last_message_id:string|null;last_sender_id:string|null;last_type:'TEXT'|'IMAGE'|null;last_content:string|null;last_created_at:Date|null;last_updated_at:Date|null;last_status:'SENT'|'DELIVERED'|'READ'|null;last_delivered_at:Date|null;last_read_at:Date|null;last_image_id:string|null;last_image_mime:string|null;last_image_width:number|null;last_image_height:number|null;last_image_size:number|null;unread_count:number};
type ConversationOnlyRow=RowDataPacket&{conversation_id:string;created_at:Date;updated_at:Date;other_id:string;username:string;name:string;profile_image_url:string|null;is_verified:number};
const userDto=(row:{other_id:string;username:string;name:string;profile_image_url:string|null;is_verified:number})=>({id:row.other_id,username:row.username,name:row.name,profileImageUrl:row.profile_image_url,isVerified:Boolean(row.is_verified)});
const toMessage=(row:ConversationRow):MessageDto|null=>row.last_message_id?({id:row.last_message_id,conversationId:row.conversation_id,senderId:row.last_sender_id!,messageType:row.last_type!,content:row.last_content!,...(row.last_image_id?{image:{id:row.last_image_id,url:`/api/uploads/images/${row.last_image_id}`,mimeType:row.last_image_mime!,width:Number(row.last_image_width),height:Number(row.last_image_height),sizeBytes:Number(row.last_image_size)}}:{}),createdAt:row.last_created_at!,updatedAt:row.last_updated_at!,status:row.last_status!,deliveredAt:row.last_delivered_at,readAt:row.last_read_at}):null;

export async function createOrGetConversation(userId:string,targetUserId:string):Promise<ConversationDto>{
 if(userId===targetUserId)throw new HttpError(400,'SELF_CONVERSATION_NOT_ALLOWED','You cannot start a conversation with yourself');
 const [first,second]=userId<targetUserId?[userId,targetUserId]:[targetUserId,userId];
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  const [activeUsers]=await connection.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM users WHERE id IN (?,?) AND is_active=1 FOR UPDATE',[first,second]);
  if(activeUsers.length!==2)throw new HttpError(404,'USER_NOT_FOUND','Active user not found');
  await connection.execute('INSERT INTO conversations (id,participant_one_id,participant_two_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE updated_at=updated_at',[randomUUID(),first,second]);
  const [rows]=await connection.execute<(RowDataPacket&{id:string;created_at:Date;updated_at:Date})[]>('SELECT id,created_at,updated_at FROM conversations WHERE participant_one_id=? AND participant_two_id=? FOR UPDATE',[first,second]);
  const conversation=rows[0];if(!conversation)throw new Error('Conversation could not be loaded');
  await connection.execute('INSERT IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?),(?,?)',[conversation.id,userId,conversation.id,targetUserId]);
  await connection.commit();
  return getConversation(userId,conversation.id);
 }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

export async function isConversationMember(userId:string,conversationId:string):Promise<boolean>{const [rows]=await pool.execute<(RowDataPacket&{present:number})[]>('SELECT 1 AS present FROM conversation_members WHERE conversation_id=? AND user_id=?',[conversationId,userId]);return rows.length>0;}

export async function getConversation(userId:string,conversationId:string):Promise<ConversationDto>{
 const [rows]=await pool.execute<ConversationOnlyRow[]>(`SELECT c.id AS conversation_id,c.created_at,c.updated_at,u.id AS other_id,u.username,u.name,u.profile_image_url,u.is_verified FROM conversations c JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=? JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>? JOIN users u ON u.id=other.user_id AND u.is_active=1 WHERE c.id=?`,[userId,userId,conversationId]);
 const row=rows[0];if(!row)throw new HttpError(404,'CONVERSATION_NOT_FOUND','Conversation not found');return {conversationId:row.conversation_id,otherUser:userDto(row),createdAt:row.created_at,updatedAt:row.updated_at};
}

export async function listConversations(userId:string):Promise<ConversationSummaryDto[]>{
 const [rows]=await pool.execute<ConversationRow[]>(`SELECT c.id AS conversation_id,c.created_at,c.updated_at,u.id AS other_id,u.username,u.name,u.profile_image_url,u.is_verified,m.id AS last_message_id,m.sender_id AS last_sender_id,m.message_type AS last_type,m.content AS last_content,m.created_at AS last_created_at,m.updated_at AS last_updated_at,CASE WHEN receipt.read_at IS NOT NULL THEN 'READ' WHEN receipt.delivered_at IS NOT NULL THEN 'DELIVERED' ELSE 'SENT' END AS last_status,receipt.delivered_at AS last_delivered_at,receipt.read_at AS last_read_at,img.id AS last_image_id,img.mime_type AS last_image_mime,img.width AS last_image_width,img.height AS last_image_height,img.size_bytes AS last_image_size,(SELECT COUNT(*) FROM message_receipts unread_receipt JOIN messages unread_message ON unread_message.id=unread_receipt.message_id WHERE unread_message.conversation_id=c.id AND unread_receipt.user_id=? AND unread_message.sender_id<>? AND unread_receipt.read_at IS NULL) AS unread_count FROM conversation_members mine JOIN conversations c ON c.id=mine.conversation_id JOIN conversation_members other ON other.conversation_id=c.id AND other.user_id<>mine.user_id JOIN users u ON u.id=other.user_id AND u.is_active=1 LEFT JOIN messages m ON m.id=(SELECT newest.id FROM messages newest WHERE newest.conversation_id=c.id ORDER BY newest.created_at DESC,newest.id DESC LIMIT 1) LEFT JOIN uploads img ON img.id=m.image_upload_id LEFT JOIN message_receipts receipt ON receipt.message_id=m.id AND receipt.user_id<>m.sender_id WHERE mine.user_id=? ORDER BY COALESCE(m.created_at,c.updated_at) DESC,c.id ASC`,[userId,userId,userId]);
 return rows.map(row=>({conversationId:row.conversation_id,otherUser:userDto(row),lastMessage:toMessage(row),lastMessageAt:row.last_created_at??null,unreadCount:Number(row.unread_count)}));
}

export async function listConversationMembers(conversationId:string):Promise<Array<{userId:string}>>{const [rows]=await pool.execute<(RowDataPacket&{user_id:string})[]>('SELECT user_id FROM conversation_members WHERE conversation_id=?',[conversationId]);return rows.map(row=>({userId:row.user_id}));}

