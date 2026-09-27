import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(3000), DATABASE_HOST: z.string().default('127.0.0.1'), DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(3306), DATABASE_NAME: z.string().min(1), DATABASE_USER: z.string().min(1), DATABASE_PASSWORD: z.string(), JWT_SECRET: z.string().min(32), JWT_EXPIRES_IN: z.string().default('15m'), REFRESH_TOKEN_SECRET: z.string().min(32), REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'), CORS_ORIGIN: z.string().default('http://localhost:3000'), BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12), ONLINE_THRESHOLD_MINUTES: z.coerce.number().int().min(1).max(1440).default(5) });
export const env = schema.parse(process.env);

