import 'reflect-metadata';
import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';
import {StoreError} from './service';
import {CloudSyncWorker} from './sync';import {ReceiptPrinter} from './printer';import {StoreService} from './service';import {StoreController} from './controller';
@Module({controllers:[StoreController],providers:[StoreService,ReceiptPrinter,CloudSyncWorker]})
class AppModule{}
async function main(){
 const bind=process.env.HUB_BIND_HOST||'127.0.0.1',port=Number(process.env.HUB_PORT||4400);
 const key=process.env.LOCAL_TLS_KEY_PATH,cert=process.env.LOCAL_TLS_CERT_PATH;
 if(Boolean(key)!==Boolean(cert))throw Error('Both LOCAL_TLS_KEY_PATH and LOCAL_TLS_CERT_PATH are required');
 const tls=key&&cert?{https:{key:readFileSync(key),cert:readFileSync(cert)}}:{};
 const loopback=(ip:string)=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
 if(!loopback(bind)&&!key&&process.env.ALLOW_INSECURE_LAN_DEV!=='1')
  throw Error('Refusing insecure LAN access; configure direct Hub HTTPS and trusted mobile CA');
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({logger:true,bodyLimit:64*1024,...tls}));
 const service=app.get(StoreService);
 // Trust only socket peer IP; never trust forwarded headers on this direct-TLS Hub.
 // Any remote device is STAFF-scoped, regardless of user credentials or URL.
 app.getHttpAdapter().getInstance().addHook('onRequest',async(req:any,reply:any)=>{
  if(loopback(req.ip))return;
  const path=String(req.url).split('?')[0],method=String(req.method);
  if(method==='OPTIONS'||method==='GET'&&path==='/v1/health')return;
  if(method==='POST'&&path==='/v1/auth/device/pair')return;
  try{
   service.validateDevice(req.headers['x-device-token']);
   if(method==='POST'&&path==='/v1/auth/login')return;
   const allowed=method==='GET'&&(path==='/v1/catalog'||path==='/v1/orders'||path==='/v1/orders/history'||/^\/v1\/orders\/[^/]+$/.test(path))
    ||method==='POST'&&path==='/v1/orders';
   if(!allowed){reply.code(403).send({code:'STAFF_DEVICE_FORBIDDEN',message:'Điện thoại nhân viên không có quyền truy cập chức năng này'});return}
   service.actor(req.headers.authorization,['STAFF']);
  }catch(err){
   const e=err instanceof StoreError?err:new StoreError(401,'DEVICE_NOT_PAIRED','Thiết bị chưa được xác thực');
   reply.code(e.status).send({code:e.code,message:e.message});
  }
 });
 const origins=(process.env.CORS_ORIGINS||'http://localhost:5173,http://localhost:5174').split(',').filter(Boolean);
 app.enableCors({origin:origins,methods:['GET','POST','PATCH'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key','X-Device-Token']});
 await app.listen({host:bind,port});
 console.log('BMC HUB '+bind+':'+port+'; bank and physical printing not validated.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
