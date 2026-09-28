import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(3000), DATABASE_HOST: z.string().default('127.0.0.1'), DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(3306), DATABASE_NAME: z.string().min(1), DATABASE_USER: z.string().min(1), DATABASE_PASSWORD: z.string(), MYSQL_TCP_DIAGNOSTIC_SECRET: z.string().min(32).optional(), JWT_SECRET: z.string().min(32), JWT_EXPIRES_IN: z.string().default('15m'), REFRESH_TOKEN_SECRET: z.string().min(32), REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'), CORS_ORIGIN: z.string().default('http://localhost:3000'), BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12), ONLINE_THRESHOLD_MINUTES: z.coerce.number().int().min(1).max(1440).default(5), MAX_IMAGE_SIZE_MB: z.coerce.number().int().min(1).max(50).default(10), IMAGE_UPLOADS_PER_15_MINUTES: z.coerce.number().int().min(1).max(100).default(10), UPLOAD_STORAGE_DIR: z.string().min(1).default('var/uploads'), BLOCK_ACTIONS_PER_HOUR: z.coerce.number().int().min(1).max(500).default(60), REPORTS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(20), MESSAGE_SENDS_PER_MINUTE: z.coerce.number().int().min(1).max(300).default(30) });
// Hostinger's DB_* names are the deployment-facing interface. Keep the
// DATABASE_* aliases for existing deployments and test scripts.
const config = {
  ...process.env,
  DATABASE_HOST: process.env.DB_HOST ?? process.env.DATABASE_HOST,
  DATABASE_PORT: process.env.DB_PORT ?? process.env.DATABASE_PORT,
  DATABASE_NAME: process.env.DB_NAME ?? process.env.DATABASE_NAME,
  DATABASE_USER: process.env.DB_USER ?? process.env.DATABASE_USER,
  DATABASE_PASSWORD: process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD,
};
export const env = schema.parse(config);
