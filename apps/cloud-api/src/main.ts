import 'reflect-metadata';import 'dotenv/config';
import {NestFactory} from '@nestjs/core';import {Module} from '@nestjs/common';
import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';
import {CloudDb} from './db';import {CloudService} from './service';import {CloudController} from './controller';
@Module({providers:[CloudDb,CloudService],controllers:[CloudController]})class CloudModule{}
async function main(){
 const secret=process.env.CLOUD_SYNC_SECRET,owner=process.env.CLOUD_OWNER_LOGIN_SECRET,store=process.env.CLOUD_STORE_ID;
 if(!secret||secret.length<32||!owner||owner.length<12||!store)throw Error('Cloud security environment variables not configured');
 const app=await NestFactory.create<NestFastifyApplication>(CloudModule,new FastifyAdapter({logger:true,bodyLimit:256*1024}));
 const allowed=process.env.CLOUD_ALLOWED_ORIGIN;if(allowed)app.enableCors({origin:allowed,methods:['GET','POST'],allowedHeaders:['Authorization','Content-Type','x-bmc-timestamp','x-bmc-signature','x-bmc-store']});
 const host=process.env.CLOUD_BIND_HOST||'127.0.0.1',port=Number(process.env.CLOUD_PORT||4500);
 if(host!=='127.0.0.1'&&process.env.CLOUD_TLS_TERMINATED!=='1')throw Error('Public cloud bind requires trusted TLS termination');
 await app.listen({host,port});
}
main().catch(e=>{console.error(e);process.exitCode=1});
