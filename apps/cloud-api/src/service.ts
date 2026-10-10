import {Injectable} from '@nestjs/common';import {CloudDb} from './db';import {SepayTransfer,findExactMemoReference} from './sepay';
export class CloudError extends Error {constructor(public readonly status:number,public readonly code:string,message:string){super(message)}}
type SyncEvent={id:string;kind:'ORDER'|'ORDER_VOID'|'BANK_INTENT';payload:any};
@Injectable()
export class CloudService{
 constructor(readonly database:CloudDb){}
 private credentials(){
  const token=process.env.CLOUD_SYNC_TOKEN;
  if(!token||token.length<32||token.startsWith('replace-'))throw new CloudError(503,'CLOUD_NOT_CONFIGURED','Sync credential not configured');
  return token;
 }
 authorize(header:unknown){
  const token=this.credentials();if(typeof header!=='string'||header!=='Bearer '+token)throw new CloudError(401,'UNAUTHORIZED','Invalid sync credential');
 }
 private config(){const account=process.env.BANK_ACCOUNT_NUMBER,bin=process.env.BANK_BIN;if(!account||!bin||!/^[A-Za-z0-9]{6,19}$/.test(account)||!/^\d{6}$/.test(bin))throw new CloudError(503,'BANK_NOT_CONFIGURED','Merchant bank settings incomplete');return {account,bin}}
 async ingest(events:unknown){
  if(!Array.isArray(events)||events.length<1||events.length>100)throw new CloudError(400,'INVALID_EVENTS','Invalid batch');
  const cfg=this.config();
  const ordered=[...(events as SyncEvent[])].sort((a,b)=>(a?.kind==='ORDER'?0:1)-(b?.kind==='ORDER'?0:1));
  return this.database.txn(async c=>{
   for(const e of ordered){
    if(!e||typeof e.id!=='string'||!/^[0-9a-f-]{36}$/i.test(e.id)||!['ORDER','ORDER_VOID','BANK_INTENT'].includes(e.kind)||!e.payload||typeof e.payload!=='object')throw new CloudError(400,'INVALID_EVENT','Unsupported event');
    const saved=await c.query('INSERT INTO sync_events(event_id,kind,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[e.id,e.kind,e.payload]);if(saved.rowCount===0)continue;
    if(e.kind==='ORDER'){
     const p=e.payload;if(typeof p.order_id!=='string'||typeof p.display_code!=='string'||!Number.isSafeInteger(p.total_vnd)||p.total_vnd<=0||p.status!=='COMMITTED'||typeof p.created_at!=='string')throw new CloudError(400,'INVALID_ORDER','Bad synced order');
     await c.query('INSERT INTO cloud_orders(order_id,display_code,total_vnd,status,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING',[p.order_id,p.display_code,p.total_vnd,p.status,p.created_at]);
    }else if(e.kind==='ORDER_VOID'){
     const p=e.payload;if(typeof p.order_id!=='string')throw new CloudError(400,'INVALID_VOID','Order id missing');
     await c.query("UPDATE cloud_orders SET status='VOIDED' WHERE order_id=$1 AND status='COMMITTED'",[p.order_id]);
    }else{
     const p=e.payload;if(typeof p.order_id!=='string'||typeof p.reference!=='string'||!/^BMC[A-F0-9]{16}$/.test(p.reference)||!Number.isSafeInteger(p.amount_vnd)||p.amount_vnd<=0||p.account_number!==cfg.account||p.bank_bin!==cfg.bin)throw new CloudError(400,'INVALID_INTENT','Bad intent');
     const order=await c.query('SELECT * FROM cloud_orders WHERE order_id=$1',[p.order_id]);if(order.rowCount===0)throw new CloudError(409,'ORDER_NOT_SYNCED','Order not in cloud');
     if(Number(order.rows[0].total_vnd)!==p.amount_vnd)throw new CloudError(409,'AMOUNT_CHANGED','Amount differs from committed order');
     await c.query("INSERT INTO bank_intents(reference,order_id,account_number,bank_bin,amount_vnd,status) VALUES($1,$2,$3,$4,$5,'PENDING') ON CONFLICT (order_id) DO NOTHING",[p.reference,p.order_id,p.account_number,p.bank_bin,p.amount_vnd]);
    }
   }
   await this.reconcile(c,cfg.account);
   return {success:true};
  });
 }
 async webhook(transfer:SepayTransfer){
  const cfg=this.config();
  return this.database.txn(async c=>{
   const data=await c.query('INSERT INTO bank_transactions(provider_tx_id,account_number,amount_vnd,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING provider_tx_id',[transfer.id,transfer.accountNumber,transfer.transferAmount,transfer]);
   if(data.rowCount===0)return {success:true};
   if(transfer.accountNumber!==cfg.account||transfer.transferType!=='in'){
    await c.query("UPDATE bank_transactions SET status='EXCEPTION',reason='WRONG_ACCOUNT_OR_DIRECTION' WHERE provider_tx_id=$1",[transfer.id]);return {success:true};
   }
   await this.reconcile(c,cfg.account);
   return {success:true};
  });
 }
 private async reconcile(c:import('pg').PoolClient,account:string){
  const transactions=await c.query("SELECT * FROM bank_transactions WHERE status='PENDING' ORDER BY received_at ASC FOR UPDATE");
  for(const tx of transactions.rows){
   if(tx.account_number!==account){await c.query("UPDATE bank_transactions SET status='EXCEPTION',reason='WRONG_ACCOUNT' WHERE provider_tx_id=$1",[tx.provider_tx_id]);continue}
   const v=tx.payload as SepayTransfer;
   const refs=await c.query("SELECT bi.*,co.status order_status FROM bank_intents bi JOIN cloud_orders co ON co.order_id=bi.order_id WHERE bi.status IN ('PENDING','CONFIRMED')");
   const candidates=refs.rows.filter(r=>findExactMemoReference(v.content,r.reference,v.code));
   if(candidates.length===0)continue; // arrives before order sync; retry at next ingest
   if(candidates.length!==1){await c.query("UPDATE bank_transactions SET status='EXCEPTION',reason='AMBIGUOUS_REFERENCE' WHERE provider_tx_id=$1",[tx.provider_tx_id]);continue}
   const intent=candidates[0];
   if(intent.order_status!=='COMMITTED'||Number(intent.amount_vnd)!==Number(tx.amount_vnd)){
    await c.query("UPDATE bank_transactions SET status='EXCEPTION',reason='AMOUNT_OR_STATUS_MISMATCH',matched_reference=$2 WHERE provider_tx_id=$1",[tx.provider_tx_id,intent.reference]);continue;
   }
   const settle=await c.query("INSERT INTO bank_settlements(order_id,reference,provider_tx_id,amount_vnd) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING seq",[intent.order_id,intent.reference,tx.provider_tx_id,intent.amount_vnd]);
   if(settle.rowCount===0){await c.query("UPDATE bank_transactions SET status='EXCEPTION',reason='ALREADY_SETTLED',matched_reference=$2 WHERE provider_tx_id=$1",[tx.provider_tx_id,intent.reference]);continue}
   await c.query("UPDATE bank_intents SET status='CONFIRMED' WHERE reference=$1",[intent.reference]);
   await c.query("UPDATE bank_transactions SET status='MATCHED',matched_reference=$2 WHERE provider_tx_id=$1",[tx.provider_tx_id,intent.reference]);
  }
 }
 async settlements(after:string|undefined){
  const n=Number(after||'0');if(!Number.isSafeInteger(n)||n<0)throw new CloudError(400,'INVALID_CURSOR','Invalid sequence');
  const result=await this.database.pool.query('SELECT seq,order_id,reference,provider_tx_id,amount_vnd FROM bank_settlements WHERE seq>$1 ORDER BY seq ASC LIMIT 100',[n]);
  return {items:result.rows.map(x=>({...x,seq:Number(x.seq),amount_vnd:Number(x.amount_vnd),provider_tx_id:String(x.provider_tx_id)})),next_seq:result.rows.length?Number(result.rows[result.rows.length-1].seq):n};
 }
 async exceptions(){const r=await this.database.pool.query("SELECT provider_tx_id,amount_vnd,reason,received_at,matched_reference FROM bank_transactions WHERE status='EXCEPTION' ORDER BY received_at DESC LIMIT 100");return r.rows}
}
