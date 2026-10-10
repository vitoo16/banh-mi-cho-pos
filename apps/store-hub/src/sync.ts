import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {createHmac} from 'node:crypto';
import {StoreService} from './service';
/** Outbound-only durable sync. Local Hub still owns orders and cash while cloud is offline. */
@Injectable()
export class CloudSyncWorker implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;
 constructor(private readonly service:StoreService){}
 onModuleInit(){
  if(!process.env.CLOUD_SYNC_URL)return;
  const url=new URL(process.env.CLOUD_SYNC_URL);
  if(url.protocol!=='https:'&&url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')throw Error('Cloud sync requires HTTPS');
  if(!process.env.CLOUD_SYNC_SECRET||process.env.CLOUD_SYNC_SECRET.length<32||!process.env.CLOUD_STORE_ID)throw Error('Cloud sync credentials missing');
  this.timer=setInterval(()=>void this.flush().catch(e=>console.error('Sync batch error:',String(e))),6000);
  this.timer.unref();
 }
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 private async flush(){
  if(this.running)return;this.running=true;
  try{
   const db=this.service.store;
   const rows=db.all<{id:string;entity:string;payload_json:string}>("SELECT id,entity,payload_json FROM sync_outbox WHERE delivered_at IS NULL ORDER BY seq LIMIT 75");
   if(!rows.length)return;
   const events=rows.map(r=>({id:r.id,entity:r.entity,payload:JSON.parse(r.payload_json)}));
   const body=JSON.stringify({events}),stamp=String(Date.now());
   const signature=createHmac('sha256',process.env.CLOUD_SYNC_SECRET!).update(stamp+'.'+body).digest('hex');
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   let result:Response;
   try{
    result=await fetch(new URL('/v1/sync/events',process.env.CLOUD_SYNC_URL),{
     method:'POST',body,signal:controller.signal,headers:{'Content-Type':'application/json','x-bmc-timestamp':stamp,'x-bmc-signature':signature,'x-bmc-store':process.env.CLOUD_STORE_ID!}
    });
   }finally{clearTimeout(timeout)}
   if(!result.ok)throw Error('Cloud rejected sync batch status '+result.status);
   const bodyJson=await result.json() as {received?:unknown};
   const received=new Set(Array.isArray(bodyJson.received)?bodyJson.received:[]);
   // Mark only events the cloud acknowledged; never drop unacknowledged records.
   db.transaction(()=>{for(const row of rows){if(received.has(row.id))db.run('UPDATE sync_outbox SET delivered_at=? WHERE id=? AND delivered_at IS NULL',new Date().toISOString(),row.id)}});
  }finally{this.running=false}
 }
}
