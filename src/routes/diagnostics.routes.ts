import { timingSafeEqual } from 'node:crypto';
import { createConnection } from 'node:net';
import { Router } from 'express';
import { env } from '../config/env';

const TCP_CONNECT_TIMEOUT_MS=5_000;
const router=Router();

function matchesDiagnosticSecret(candidate:string|undefined,expected:string|undefined):boolean{
 if(!candidate||!expected)return false;
 const candidateBytes=Buffer.from(candidate);
 const expectedBytes=Buffer.from(expected);
 return candidateBytes.length===expectedBytes.length&&timingSafeEqual(candidateBytes,expectedBytes);
}

function checkTcpConnection(host:string,port:number):Promise<Record<string,unknown>>{
 const startedAt=Date.now();
 return new Promise(resolve=>{
  const socket=createConnection({host,port});
  let completed=false;
  const timer=setTimeout(()=>{
   const timeoutError=Object.assign(new Error('TCP connection timed out'),{name:'TimeoutError',code:'ETIMEDOUT',syscall:'connect'});
   finish(false,timeoutError);
  },TCP_CONNECT_TIMEOUT_MS);
  const finish=(success:boolean,error?:(NodeJS.ErrnoException&{address?:string;port?:number}))=>{
   if(completed)return;
   completed=true;
   clearTimeout(timer);
   const diagnostic:Record<string,unknown>={host,port,success,elapsedMs:Date.now()-startedAt};
   if(error)diagnostic.error={
    name:error.name,
    ...(error.code!==undefined?{code:error.code}:{}),
    ...(error.errno!==undefined?{errno:error.errno}:{}),
    ...(error.syscall!==undefined?{syscall:error.syscall}:{}),
    ...(error.address!==undefined?{address:error.address}:{}),
    ...(error.port!==undefined?{port:error.port}:{}),
   };
   socket.destroy();
   resolve(diagnostic);
  };
  socket.once('connect',()=>finish(true));
  socket.once('error',error=>finish(false,error as NodeJS.ErrnoException&{address?:string;port?:number}));
 });
}

router.get('/mysql-tcp',async(req,res)=>{
 if(!matchesDiagnosticSecret(req.get('x-diagnostic-secret'),env.MYSQL_TCP_DIAGNOSTIC_SECRET)){
  res.status(404).json({success:false,message:'Not found'});
  return;
 }
 const result=await checkTcpConnection(env.DATABASE_HOST,env.DATABASE_PORT);
 res.status(200).json(result);
});

export const diagnosticsRouter=router;
