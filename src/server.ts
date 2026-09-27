import { createServer } from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { pool } from './config/database';
import { attachSocketServer } from './realtime/socket-server';

const httpServer=createServer(app);
const io=attachSocketServer(httpServer);
httpServer.listen(env.PORT,()=>console.info(`ConnectChat API and Socket.IO listening on port ${env.PORT}`));
const shutdown=()=>{io.close(()=>{void pool.end().finally(()=>process.exit(0));});};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

