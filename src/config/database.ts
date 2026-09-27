import mysql from 'mysql2/promise';
import { env } from './env';
export const pool = mysql.createPool({ host: env.DATABASE_HOST, port: env.DATABASE_PORT, user: env.DATABASE_USER, password: env.DATABASE_PASSWORD, database: env.DATABASE_NAME, waitForConnections: true, connectionLimit: 10, queueLimit: 0, charset: 'utf8mb4', decimalNumbers: true });
export async function checkDatabase(): Promise<boolean> { try { await pool.query('SELECT 1'); return true; } catch { return false; } }
