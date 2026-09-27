import { app } from './app';
import { env } from './config/env';
import { pool } from './config/database';
const server=app.listen(env.PORT,()=>console.info(`ConnectChat API listening on port ${env.PORT}`));
const shutdown=()=>{server.close(()=>{void pool.end().finally(()=>process.exit(0));});};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
