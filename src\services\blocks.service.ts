import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';

function orderedPair(first:string,second:string):[string,string]{return first<second?[first,second]:[second,first];}
function rejectSelf(blockerId:string,targetId:string):void{if(blockerId===targetId)throw new HttpError(400,'SELF_BLOCK_NOT_ALLOWED','You cannot block yourself');}

export async function blockUser(blockerId:string,blockedId:string){
  rejectSelf(blockerId,blockedId);
  const [first,second]=orderedPair(blockerId,blockedId);const connection=await pool.getConnection();let conversationId:string|undefined;let created=false;
  try{
    await connection.beginTransaction();
    const[users]=await connection.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM users WHERE id IN (?,?) AND is_active=1 ORDER BY id FOR UPDATE',[first,second]);
    if(users.length!==2)throw new HttpError(404,'USER_NOT_FOUND','User not found');
    const[conversations]=await connection.execute<(RowDataPacket&{id:string})[]>('SELECT id FROM conversations WHERE participant_one_id=? AND participant_two_id=? FOR UPDATE',[first,second]);conversationId=conversations[0]?.id;
    const[id]=await connection.execute('INSERT IGNORE INTO blocks (id,blocker_user_id,blocked_user_id) VALUES (?,?,?)',[randomUUID(),blockerId,blockedId]);created='affectedRows'in id&&id.affectedRows===1;
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  return {userId:blockedId,blocked:true,created,conversationId};
}

export async function unblockUser(blockerId:string,blockedId:string){
  rejectSelf(blockerId,blockedId);
  const[result]=await pool.execute('DELETE FROM blocks WHERE blocker_user_id=? AND blocked_user_id=?',[blockerId,blockedId]);
  return {userId:blockedId,blocked:false,removed:'affectedRows'in result&&result.affectedRows>0};
}

export async function listBlockedUsers(blockerId:string,page:number,limit:number){
  const where='b.blocker_user_id=?';
  const[count]=await pool.execute<(RowDataPacket&{total:number})[]>(`SELECT COUNT(*) AS total FROM blocks b WHERE ${where}`,[blockerId]);
  const[rows]=await pool.execute<(RowDataPacket&{id:string;username:string;name:string;profile_image_url:string|null;created_at:Date})[]>(`SELECT u.id,u.username,u.name,u.profile_image_url,b.created_at FROM blocks b JOIN users u ON u.id=b.blocked_user_id WHERE ${where} ORDER BY b.created_at DESC,b.blocked_user_id LIMIT ? OFFSET ?`,[blockerId,limit,(page-1)*limit]);
  const total=Number(count[0]?.total??0);
  return {users:rows.map(row=>({id:row.id,username:row.username,name:row.name,profileImageUrl:row.profile_image_url,blockedAt:row.created_at})),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
}
