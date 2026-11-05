import 'reflect-metadata';
import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';
import {StoreError} from './service';
import {assertRemoteStaffRequest} from './remote-gateway';
import {assertHubNetworkPolicy} from './network-policy';
import {CloudSyncWorker} from './sync';import {ReceiptPrinter} from './printer';import {StoreService} from './service';import {StoreController} from './controller';
@Module({controllers:[StoreController],providers:[StoreService,ReceiptPrinter,CloudSyncWorker]})
class AppModule{}
async function main(){
 const host=process.env.HUB_BIND_HOST||'127.0.0.1',port=Number(process.env.HUB_PORT||4400);
 const certPath=process.env.HUB_TLS_CERT_PATH,keyPath=process.env.HUB_TLS_KEY_PATH;
 if(Boolean(certPath)!==Boolean(keyPath))throw Error('Both HUB_TLS_CERT_PATH and HUB_TLS_KEY_PATH must be configured');
 const tls=certPath&&keyPath?{cert:readFileSync(certPath),key:readFileSync(keyPath)}:undefined;
 // Validate before Nest initializes providers or opens the local ledger.
 assertHubNetworkPolicy({
  host,tlsConfigured:Boolean(tls),pairingEnforced:process.env.PAIRING_ENFORCED==='1',
  allowInsecureLanDev:process.env.ALLOW_INSECURE_LAN_DEV==='1',nodeEnv:process.env.NODE_ENV,
 });
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({logger:true,bodyLimit:64*1024,...(tls?{https:tls}:{})}));
 // After body parse and before Nest handlers, authorize each non-loopback phone request.
 // request.ip is the socket peer, not a client-controlled forwarding header.
 const hub=app.get(StoreService);
 app.getHttpAdapter().getInstance().addHook('preHandler',async(request:any,reply:any)=>{
  try{
   assertRemoteStaffRequest(hub,request.ip,request.method,request.url,
    request.headers.authorization,request.headers['x-device-token'],request.body);
  }catch(error){
   if(error instanceof StoreError){reply.code(error.status).send({code:error.code,message:error.message});return}
   throw error;
  }
 });
 const origins=(process.env.CORS_ORIGINS||'http://localhost:5173,http://localhost:5174').split(',').filter(Boolean);
 app.enableCors({origin:origins,methods:['GET','POST','PATCH'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key','X-Device-Token']});
 await app.listen({host,port});
 console.log('BMC PILOT HUB '+host+':'+port+'; bank and physical printing not validated.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
