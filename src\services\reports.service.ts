import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { isConversationMember } from './conversations.service';
import { HttpError } from '../utils/http-error';
import type { reportReasons } from '../schemas/moderation.schema';

type ReportReason=typeof reportReasons[number];
function mapDuplicate(error:unknown):never{if((error as {code?:string}).code==='ER_DUP_ENTRY')throw new HttpError(409,'DUPLICATE_REPORT','You have already reported this item');throw error;}

export async function createUserReport(reporterId:string,userId:string,reason:ReportReason,description?:string){
  if(reporterId===userId)throw new HttpError(400,'SELF_REPORT_NOT_ALLOWED','You cannot report yourself');
  const[targets]=await pool.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM users WHERE id=? AND is_active=1',[userId]);if(!targets[0])throw new HttpError(404,'USER_NOT_FOUND','User not found');
  try{const id=randomUUID();await pool.execute('INSERT INTO reports (id,reporter_user_id,target_type,reported_user_id,reported_message_id,reason,description) VALUES (?,? ,\'USER\',?,NULL,?,?)',[id,reporterId,userId,reason,description??null]);return {id,targetType:'USER' as const,reportedUserId:userId,reportedMessageId:null,reason,description:description??null,status:'OPEN' as const};}catch(error){mapDuplicate(error);}
}

export async function createMessageReport(reporterId:string,messageId:string,reason:ReportReason,description?:string){
  const[messages]=await pool.execute<(RowDataPacket&{conversation_id:string;sender_id:string})[]>('SELECT conversation_id,sender_id FROM messages WHERE id=?',[messageId]);const message=messages[0];
  if(!message||!(await isConversationMember(reporterId,message.conversation_id)))throw new HttpError(404,'MESSAGE_NOT_FOUND','Message not found');
  if(message.sender_id===reporterId)throw new HttpError(400,'SELF_REPORT_NOT_ALLOWED','You cannot report your own message');
  try{const id=randomUUID();await pool.execute('INSERT INTO reports (id,reporter_user_id,target_type,reported_user_id,reported_message_id,reason,description) VALUES (?,? ,\'MESSAGE\',NULL,?,?,?)',[id,reporterId,messageId,reason,description??null]);return {id,targetType:'MESSAGE' as const,reportedUserId:null,reportedMessageId:messageId,reason,description:description??null,status:'OPEN' as const};}catch(error){mapDuplicate(error);}
}

export async function listOwnReports(reporterId:string,page:number,limit:number){
  const[count]=await pool.execute<(RowDataPacket&{total:number})[]>('SELECT COUNT(*) AS total FROM reports WHERE reporter_user_id=?',[reporterId]);
  const[rows]=await pool.execute<(RowDataPacket&{id:string;target_type:'USER'|'MESSAGE';reported_user_id:string|null;reported_message_id:string|null;reason:ReportReason;description:string|null;status:'OPEN'|'REVIEWED'|'RESOLVED'|'DISMISSED';created_at:Date;updated_at:Date})[]>('SELECT id,target_type,reported_user_id,reported_message_id,reason,description,status,created_at,updated_at FROM reports WHERE reporter_user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',[reporterId,limit,(page-1)*limit]);
  const total=Number(count[0]?.total??0);return {reports:rows.map(row=>({id:row.id,targetType:row.target_type,reportedUserId:row.reported_user_id,reportedMessageId:row.reported_message_id,reason:row.reason,description:row.description,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at})),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
}
