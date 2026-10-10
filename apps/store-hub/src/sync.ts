import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {StoreService} from './service';import {randomUUID} from 'node:crypto';
const now=()=>new Date().toISOString();
/** Durable ordered local outbox and verified cloud settlement inbox. */
@Injectable()
export class HubCloudSync implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running=false;
 constructor(private readonly s:StoreService){}
 onModuleInit(){if(process.env.CLOUD_SYNC_URL){this.timer=setInterval(()=>void this.cycle().catch(e=>console.error('CLOUD_SYNC_ERROR',String(e))),4000);this.timer.unref()}}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 private settings(){
  const url=(process.env.CLOUD_SYNC_URL||'').replace(/\/$/,'');const token=process.env.CLOUD_SYNC_TOKEN||'';
  if((!url.startsWith('https://') && !(process.env.CLOUD_ALLOW_HTTP_DEV==='1'&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)))||token.length<32)throw new Error('Cloud TLS endpoint and long sync token required');
  return {url,token};
 }
 private async request<T>(path:string,init:RequestInit={}):Promise<T>{
  const {url,token}=this.settings();const c=new AbortController(),timeout=setTimeout(()=>c.abort(),5000);
  try{const r=await fetch(url+path,{...init,signal:c.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(init.headers||{})}});
   if(!r.ok)throw new Error('Cloud HTTP '+r.status);
   return await r.json() as T;
  }finally{clearTimeout(timeout)}
 }
 async flush(){
  const db=this.s.store;
  const events=db.all<{id:string;kind:string;payload:string}>("SELECT id,kind,payload FROM cloud_outbox WHERE acked=0 ORDER BY created_at,id LIMIT 50");
  if(!events.length)return;
  await this.request('/v1/sync/events',{method:'POST',body:JSON.stringify({events:events.map(e=>({id:e.id,kind:e.kind,payload:JSON.parse(e.payload)}))})});
  db.transaction(()=>{for(const e of events){
   db.run('UPDATE cloud_outbox SET acked=1 WHERE id=?',e.id);
   if(e.kind==='BANK_INTENT'){const p=JSON.parse(e.payload);db.run('UPDATE bank_intents SET cloud_acked=1 WHERE order_id=?',p.order_id)}
  }});
 }
 private async apply(){
  const db=this.s.store,after=db.row<{seq:number}>('SELECT seq FROM cloud_checkpoint WHERE id=1')?.seq||0;
  const answer=await this.request<{items:Array<{seq:number;order_id:string;reference:string;provider_tx_id:string;amount_vnd:number}>;next_seq:number}>('/v1/sync/settlements?after='+after);
  if(!Array.isArray(answer.items))throw new Error('Invalid cloud settlements schema');
  for(const e of answer.items)db.transaction(()=>{
   if(!Number.isSafeInteger(e.seq)||e.seq<=after||!Number.isSafeInteger(e.amount_vnd)||e.amount_vnd<=0)throw new Error('Invalid bank settlement');
   if(db.row('SELECT 1 FROM bank_receipts WHERE seq=?',e.seq))return;
   const intent=db.row<any>('SELECT * FROM bank_intents WHERE order_id=? AND reference=?',e.order_id,e.reference);
   const order=db.row<any>('SELECT * FROM orders WHERE id=?',e.order_id);
   const eligible=!!intent&&!!order&&intent.amount_vnd===e.amount_vnd&&order.total_vnd===e.amount_vnd&&order.status==='COMMITTED'&&order.payment_status==='UNPAID';
   if(!eligible){
    db.run('INSERT INTO bank_receipts(seq,order_id,reference,provider_tx_id,status,reason) VALUES(?,?,?,?,?,?)',e.seq,e.order_id,e.reference,e.provider_tx_id,'EXCEPTION','UNMATCHED_OR_ALREADY_PAID');
   }else{
    db.run('INSERT INTO payments(id,order_id,method,amount_vnd,created_at,actor_id) VALUES(?,?,?,?,?,?)',randomUUID(),e.order_id,'BANK',e.amount_vnd,now(),'CLOUD_VERIFIED');
    db.run("UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=?",e.order_id);
    const batch=randomUUID(),date=now();
    for(const kind of ['CUSTOMER','STORE'])db.run("INSERT INTO receipts(id,batch_id,order_id,kind,status,created_at) VALUES(?,?,?,?,?,?)",randomUUID(),batch,e.order_id,kind,'WAITING_FOR_PRINTER',date);
    db.run('INSERT INTO bank_receipts(seq,order_id,reference,provider_tx_id,status) VALUES(?,?,?,?,?)',e.seq,e.order_id,e.reference,e.provider_tx_id,'MATCHED');
    db.run('INSERT INTO audit(id,actor_id,kind,entity_id,created_at,details_json) VALUES(?,?,?,?,?,?)',randomUUID(),'CLOUD_VERIFIED','BANK_CAPTURE',e.order_id,date,JSON.stringify({reference:e.reference,provider_tx_id:e.provider_tx_id,amount:e.amount_vnd}));
   }
   db.run('UPDATE cloud_checkpoint SET seq=? WHERE id=1',e.seq);
  });
 }
 async cycle(){if(this.running)return;this.running=true;try{await this.flush();await this.apply()}finally{this.running=false}}
}
