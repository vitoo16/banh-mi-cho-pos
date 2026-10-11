import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {StoreService} from './service';
/** Outbound-only durable sync. Local Hub still owns orders and cash while cloud is offline. */
@Injectable()
export class CloudSyncWorker implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;private pulling=false;private pollingProducts=false;
 constructor(private readonly service:StoreService){}
 onModuleInit(){
  if(!process.env.CLOUD_SYNC_URL)return;
  const url=new URL(process.env.CLOUD_SYNC_URL);
  if(url.protocol!=='https:'&&url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')throw Error('Cloud sync requires HTTPS');
  if(!process.env.CLOUD_SYNC_SECRET||process.env.CLOUD_SYNC_SECRET.length<32||!process.env.CLOUD_STORE_ID)throw Error('Cloud sync credentials missing');
  // Seed the mirror for databases that predate outbox/sync deployment.
  this.service.store.prepareCloudBackfill(process.env.CLOUD_STORE_ID);
  this.service.store.prepareBankIntentBackfill(process.env.CLOUD_STORE_ID);
  if(process.env.ENABLE_VERIFIED_BANK_INBOX==='1'&&(!process.env.BANK_BRIDGE_SECRET||process.env.BANK_BRIDGE_SECRET.length<32))
   throw Error('Verified bank inbox requires BANK_BRIDGE_SECRET 32+ characters');
  this.timer=setInterval(()=>{
   void this.flush().catch(e=>console.error('Cloud outbox sync error:',String(e)));
   void this.pullRemoteProducts().catch(e=>console.error('Remote product sync error:',String(e)));
   if(process.env.ENABLE_VERIFIED_BANK_INBOX==='1')
    void this.pullBankSettlements().catch(e=>console.error('Verified bank inbox error:',String(e)));
  },6000);
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
 /**
  * Owner's cloud product edits are commands, not cloud-authoritative price writes.
  * Hub applies exactly once, respecting the latest local price snapshot.
  */
 private async pullRemoteProducts(){
  if(this.pollingProducts)return;
  this.pollingProducts=true;
  try{
   const base=process.env.CLOUD_SYNC_URL,secret=process.env.CLOUD_SYNC_SECRET,storeId=process.env.CLOUD_STORE_ID;
   if(!base||!secret||secret.length<32||!storeId)return;
   const stamp=String(Date.now());
   const reqSig=createHmac('sha256',secret).update(stamp+'.GET:product-commands').digest('hex');
   const headers={'x-bmc-store':storeId,'x-bmc-timestamp':stamp,'x-bmc-signature':reqSig};
   const timeout=AbortSignal.timeout(9000);
   const res=await fetch(new URL('/v1/sync/product-commands',base),{headers,signal:timeout});
   if(!res.ok)throw Error('Cloud command inbox HTTP '+res.status);
   const envelope=await res.json() as {timestamp?:unknown;payload?:any;signature?:unknown};
   const responseStamp=envelope.timestamp,signature=envelope.signature;
   if(typeof responseStamp!=='string'||!/^[0-9]{13}$/.test(responseStamp)||
    Math.abs(Date.now()-Number(responseStamp))>300000||typeof signature!=='string'||
    !/^[a-f0-9]{64}$/i.test(signature))
    throw Error('Invalid remote product inbox envelope');
   const expectedSig=createHmac('sha256',secret).update(responseStamp+'.'+JSON.stringify(envelope.payload)).digest('hex');
   if(!timingSafeEqual(Buffer.from(expectedSig,'hex'),Buffer.from(signature,'hex')))
    throw Error('Remote product inbox signature invalid');
   if(envelope.payload?.store_id!==storeId||!Array.isArray(envelope.payload.commands)||
    envelope.payload.commands.length>20)throw Error('Invalid remote product inbox');
   const results:Array<{id:string;status:'APPLIED'|'CONFLICT';result_code:string}>=[];
   for(const command of envelope.payload.commands){
    if(!command||typeof command.id!=='string'||!/^[0-9a-f-]{36}$/i.test(command.id)||
     typeof command.product_id!=='string'||!(/^[A-Za-z0-9_-]{1,90}$/.test(command.product_id))||
     typeof command.name!=='string'||!command.name.trim()||command.name.length>120||
     !Number.isSafeInteger(command.price_vnd)||command.price_vnd<0||command.price_vnd>1_000_000_000||
     !Number.isSafeInteger(command.expected_price_vnd)||command.expected_price_vnd<0||command.expected_price_vnd>1_000_000_000||
     typeof command.is_active!=='boolean'||command.status!=='PENDING')
      throw Error('Untrusted remote product command payload');
    try{
     this.service.applyRemoteProductCommand(command);
     results.push({id:command.id,status:'APPLIED',result_code:'OK'});
    }catch(error){
     const code=error&&typeof error==='object'&&'code' in error?(error as {code:string}).code:'';
     if(!['PRICE_CHANGED','NOT_FOUND'].includes(code))throw error;
     results.push({id:command.id,status:'CONFLICT',result_code:code});
    }
   }
   if(!results.length)return;
   const body=JSON.stringify({results}),ackStamp=String(Date.now());
   const ackSig=createHmac('sha256',secret).update(ackStamp+'.'+body).digest('hex');
   const ack=await fetch(new URL('/v1/sync/product-command-results',base),{
    method:'POST',body,signal:AbortSignal.timeout(9000),
    headers:{'Content-Type':'application/json','x-bmc-store':storeId,
     'x-bmc-timestamp':ackStamp,'x-bmc-signature':ackSig},
   });
   if(!ack.ok)throw Error('Cloud command ACK HTTP '+ack.status);
   const parsed=await ack.json() as {accepted?:unknown};
   if(!Array.isArray(parsed.accepted)||results.some(x=>!parsed.accepted?.includes(x.id)))
    throw Error('Cloud failed to acknowledge all product commands');
  }finally{this.pollingProducts=false}
 }
 /** Poll cloud-authoritative verified bank settlements. Every accepted event is journaled
  * locally via the same bankEvent() transaction as an internal bank bridge.
  * A trusted signed envelope + strict ordering is required; never settle from raw HTTP JSON.
  */
 private async pullBankSettlements(){
  if(this.pulling)return;
  this.pulling=true;
  try{
   const cloudKey=process.env.CLOUD_SYNC_SECRET!,bankKey=process.env.BANK_BRIDGE_SECRET!;
   const storeId=process.env.CLOUD_STORE_ID!;
   const db=this.service.store,setting='cloud_bank_cursor_v1:'+storeId;
   const last=db.row<{value:string}>('SELECT value FROM settings WHERE key=?',setting)?.value||'0';
   if(!/^(0|[1-9][0-9]{0,15})$/.test(last))throw Error('Cloud bank cursor corrupted');
   const stamp=String(Date.now());
   const signature=createHmac('sha256',cloudKey).update(stamp+'.GET:'+storeId+':'+last).digest('hex');
   const url=new URL('/v1/sync/settlements',process.env.CLOUD_SYNC_URL);
   url.searchParams.set('after',last);
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
   let result:Response;
   try{
    result=await fetch(url,{signal:controller.signal,headers:{'x-bmc-store':storeId,'x-bmc-timestamp':stamp,'x-bmc-signature':signature}});
   }finally{clearTimeout(timeout)}
   if(!result.ok)throw Error('Cloud bank inbox unavailable: '+result.status);
   const env=await result.json() as {timestamp?:unknown;payload?:{store_id?:unknown;settlements?:unknown};signature?:unknown};
   const responseStamp=typeof env.timestamp==='string'?env.timestamp:'';
   if(!/^[0-9]{13}$/.test(responseStamp)||Math.abs(Date.now()-Number(responseStamp))>300000)
    throw Error('Stale or invalid cloud bank response');
   if(env.payload?.store_id!==storeId||!Array.isArray(env.payload.settlements)||env.payload.settlements.length>50)
    throw Error('Malformed bank inbox batch');
   const expected=createHmac('sha256',cloudKey).update(responseStamp+'.'+JSON.stringify(env.payload)).digest('hex');
   const sig=typeof env.signature==='string'?env.signature:'';
   if(!/^[a-f0-9]{64}$/i.test(sig)||!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(sig,'hex')))
    throw Error('Invalid cloud bank inbox signature');
   let cursor=Number(last);
   for(const entry of env.payload.settlements as any[]){
    if(!Number.isSafeInteger(entry.seq)||entry.seq<=cursor||entry.seq>Number.MAX_SAFE_INTEGER
      ||typeof entry.provider_tx_id!=='string'||!/^sepay:[0-9]{1,16}$/.test(entry.provider_tx_id)
      ||typeof entry.reference!=='string'||!/^BMC[A-F0-9]{14}$/.test(entry.reference)
      ||typeof entry.account_number!=='string'||typeof entry.bank_code!=='string'
      ||!Number.isSafeInteger(entry.amount_vnd)||entry.amount_vnd<=0||entry.amount_vnd>1_000_000_000)
     throw Error('Malformed bank settlement record');
    const event=JSON.stringify({provider_tx_id:entry.provider_tx_id,reference:entry.reference,
     account_number:entry.account_number,bank_code:entry.bank_code,
     amount_vnd:entry.amount_vnd,direction:'CREDIT'});
    const ts=String(Date.now());
    const hmac=createHmac('sha256',bankKey).update(ts+'.'+event).digest('hex');
    // Idempotent bankEvent logs any late/double-payment as an owner-visible exception.
    this.service.bankEvent(event,ts,hmac);
    cursor=entry.seq;
    db.run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",setting,String(cursor));
   }
  }finally{this.pulling=false}
 }
}
