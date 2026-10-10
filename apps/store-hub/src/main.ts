import 'reflect-metadata';
import 'dotenv/config';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';
import {ReceiptPrinter} from './printer';import {StoreService} from './service';import {StoreController} from './controller';
@Module({controllers:[StoreController],providers:[StoreService,ReceiptPrinter]})
class AppModule{}
async function main(){
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({logger:true,bodyLimit:64*1024}));
 const origins=(process.env.CORS_ORIGINS||'http://localhost:5173,http://localhost:5174').split(',').filter(Boolean);
 app.enableCors({origin:origins,methods:['GET','POST','PATCH'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key']});
 const host=process.env.HUB_BIND_HOST||'127.0.0.1',port=Number(process.env.HUB_PORT||4400);
 if(host!=='127.0.0.1'&&host!=='::1'&&process.env.ALLOW_INSECURE_LAN_DEV!=='1')
  throw new Error('LAN bind blocked without explicit development opt-in. Configure trusted TLS reverse proxy and pairing before production.');
 await app.listen({host,port});
 console.log('BMC PILOT HUB '+host+':'+port+'; bank and physical printing not validated.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
