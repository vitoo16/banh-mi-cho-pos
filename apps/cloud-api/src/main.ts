import 'reflect-metadata';import 'dotenv/config';import {NestFactory} from '@nestjs/core';import {Module} from '@nestjs/common';import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';import {CloudDb} from './db';import {CloudService} from './service';import {CloudController} from './controller';
@Module({controllers:[CloudController],providers:[CloudDb,CloudService]})class AppModule{}
async function main(){
 const host=process.env.CLOUD_BIND_HOST||'127.0.0.1',port=Number(process.env.CLOUD_PORT||4500);
 if(host!=='127.0.0.1'&&host!=='::1'&&process.env.CLOUD_ALLOW_INSECURE_DEV!=='1')throw new Error('Use trusted public HTTPS reverse proxy for cloud API; insecure bind denied');
 for(const key of ['DATABASE_URL','CLOUD_SYNC_TOKEN','SEPAY_WEBHOOK_SECRET','BANK_ACCOUNT_NUMBER','BANK_BIN'])if(!process.env[key]||process.env[key]!.startsWith('replace-'))throw new Error('Missing valid '+key);
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({logger:true,bodyLimit:64*1024}),{rawBody:true});
 await app.listen({host,port});
}
main().catch(e=>{console.error(e);process.exitCode=1});
