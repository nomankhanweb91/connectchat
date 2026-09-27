import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/database';
import { HttpError } from '../utils/http-error';


/** Shared anti-join predicate for lists that must hide either side of a block. */
export function notBlockedBetweenSql(leftUserIdSql:string,rightUserIdSql:string):string {
  return `NOT EXISTS (SELECT 1 FROM blocks block_edge WHERE (block_edge.blocker_user_id=${leftUserIdSql} AND block_edge.blocked_user_id=${rightUserIdSql}) OR (block_edge.blocker_user_id=${rightUserIdSql} AND block_edge.blocked_user_id=${leftUserIdSql}))`;
}

export async function hasBlockBetween(firstUserId:string,secondUserId:string,connection?:PoolConnection):Promise<boolean>{
  const sql='SELECT 1 AS present FROM blocks WHERE (blocker_user_id=? AND blocked_user_id=?) OR (blocker_user_id=? AND blocked_user_id=?) LIMIT 1';const values=[firstUserId,secondUserId,secondUserId,firstUserId];
  const[rows]=connection?await connection.execute<(RowDataPacket&{present:number})[]>(sql,values):await pool.execute<(RowDataPacket&{present:number})[]>(sql,values);
  return rows.length>0;
}

export async function assertNoBlockBetween(firstUserId:string,secondUserId:string):Promise<void>{
  if(await hasBlockBetween(firstUserId,secondUserId))throw new HttpError(404,'RESOURCE_NOT_FOUND','Resource not found');
}
