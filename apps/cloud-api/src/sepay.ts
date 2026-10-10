import {Injectable,UnauthorizedException,BadRequestException,ServiceUnavailableException} from '@nestjs/common';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {CloudDb} from './db';

type SePayEvent={id:number;gateway:string;accountNumber:string;code:string|null;content:string;transferType:string;transferAmount:number};
const REFERENCE=/\bBMC[A-F0-9]{14}\b/g;
const HEX=/^[a-f0-9]{64}$/i;
const safeString=(x:unknown,n=140)=>typeof x==='string'&&x.length<=n?x:'';
function compare(a:Buffer,b:Buffer){return a.length===b.length&&timingSafeEqual(a,b)}
function mac(key:string,msg:string){return createHmac('sha256',key).update(msg).digest('hex')}

/** SePay adapter: verify RAW request bytes, then atomically classify/settle exact matches.
 * Source: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
 */
@Injectable()
export class SePayService{
 constructor(private readonly db:CloudDb){}
 private store(){const s=process.env.CLOUD_STORE_ID;if(!s)throw new Error('CLOUD_STORE_ID required');return s}
 private bridgeSecret(){const s=process.env.CLOUD_SYNC_SECRET;if(!s||s.length<32)throw new ServiceUnavailableException('Cloud bank bridge disabled');return s}
 private providerConfig(){
  const secret=process.env.SEPAY_WEBHOOK_SECRET,account=process.env.SEPAY_ACCOUNT_NUMBER,gateway=process.env.SEPAY_BANK_GATEWAY;
  if(!secret||secret.length<32||!account||!gateway)throw new ServiceUnavailableException('SePay merchant integration not configured');
  return {secret,account,gateway};
 }
 private reference(e:SePayEvent){
  const value=safeString(e.code,80).toUpperCase();
  if(/^BMC[A-F0-9]{14}$/.test(value))return value;
  const content=safeString(e.content,1500).toUpperCase();
  const refs=[...new Set(content.match(REFERENCE)||[])];
  return refs.length===1?refs[0]:null;
 }
 async receiveWebhook(raw:unknown,stamp:unknown,signature:unknown){
  const config=this.providerConfig();
  if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>256*1024)throw new BadRequestException('Raw JSON webhook body required');
  const ts=typeof stamp==='string'?stamp:'';
  if(!/^[0-9]{10}$/.test(ts)||Math.abs(Math.floor(Date.now()/1000)-Number(ts))>300)
   throw new UnauthorizedException('Webhook timestamp invalid or expired');
  const got=typeof signature==='string'?signature:'',presented=got.startsWith('sha256=')?got.slice(7):'';
  const expected=mac(config.secret,ts+'.'+raw.toString('utf8'));
  if(!HEX.test(presented)||!compare(Buffer.from(expected,'hex'),Buffer.from(presented,'hex')))
   throw new UnauthorizedException('Webhook signature invalid');
  let data:any;
  try{data=JSON.parse(raw.toString('utf8'))}catch{throw new BadRequestException('Invalid JSON')}
  if(!data||!Number.isSafeInteger(data.id)||data.id<1||typeof data.gateway!=='string'||typeof data.accountNumber!=='string'
   ||!Number.isSafeInteger(data.transferAmount)||data.transferAmount<=0||data.transferAmount>1_000_000_000
   ||!['in','out'].includes(data.transferType)||typeof data.content!=='string')
   throw new BadRequestException('Unsupported SePay payload');
  const e=data as SePayEvent,ref=this.reference(e),store=this.store(),id=String(e.id);
  await this.db.transaction(async c=>{
   const inserted=await c.query(`INSERT INTO sepay_events(store_id,sepay_id,reference,account_number,bank_gateway,amount_vnd,state,reason)
 VALUES($1,$2,$3,$4,$5,$6,'RECEIVED',NULL) ON CONFLICT DO NOTHING RETURNING sepay_id`,[store,id,ref,e.accountNumber,e.gateway,e.transferAmount]);
   if(!inserted.rowCount)return; // webhook replay: never capture twice
   let reason='';
   const lookup=ref?await c.query(`SELECT i.*,o.status AS order_status,o.payment_status AS order_payment_status
FROM mirror_bank_intents i JOIN mirror_orders o ON o.store_id=i.store_id AND o.id=i.order_id
WHERE i.store_id=$1 AND i.reference=$2 FOR UPDATE OF i,o`,[store,ref]):{rows:[]};
   const intent=lookup.rows[0];
   if(e.transferType!=='in')reason='NOT_CREDIT';
   else if(e.accountNumber!==config.account||e.gateway.toLowerCase()!==config.gateway.toLowerCase())reason='WRONG_RECEIVER';
   else if(!ref||!intent)reason='UNMATCHED_REFERENCE';
   else if(intent.account_number!==config.account||intent.bank_code.toLowerCase()!==config.gateway.toLowerCase())reason='INTENT_RECEIVER_MISMATCH';
   else if(Number(intent.amount_vnd)!==e.transferAmount)reason='AMOUNT_MISMATCH';
   else if(intent.order_status!=='COMMITTED'||intent.order_payment_status!=='UNPAID'||intent.status!=='PENDING')reason='ORDER_ALREADY_SETTLED';
   if(!reason){
    const insertedSettlement=await c.query(`INSERT INTO cloud_bank_settlements(store_id,provider_tx_id,order_id,reference,account_number,bank_code,amount_vnd)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING seq`,[store,'sepay:'+id,intent.order_id,ref,config.account,intent.bank_code,e.transferAmount]);
    if(!insertedSettlement.rowCount)reason='DUPLICATE_ORDER_SETTLEMENT';
    else{
     await c.query("UPDATE mirror_bank_intents SET status='CONFIRMED' WHERE store_id=$1 AND order_id=$2",[store,intent.order_id]);
     await c.query("UPDATE mirror_orders SET payment_status='PAID' WHERE store_id=$1 AND id=$2",[store,intent.order_id]);
    }
   }
   await c.query("UPDATE sepay_events SET state=$3,reason=$4 WHERE store_id=$1 AND sepay_id=$2",[store,id,reason?'EXCEPTION':'CONFIRMED',reason||null]);
  });
  return {success:true};
 }
 /**
  * Hub pulls a signed, replayable ordered settlement inbox over HTTPS.
  * Responses are signed using the existing cloud sync key; no unsigned payload can settle.
  */

 /** A signed transfer may arrive before its Hub intent when WAN sync is delayed.
  * Only re-evaluate HMAC-VERIFIED incoming credits originally held as unmatched.
  * Requires exact receiver, amount and a still-unpaid committed order.
  */
 async reconcilePending(reference:string){
  if(!/^BMC[A-F0-9]{14}$/.test(reference))return;
  const store=this.store();
  const stale=await this.db.pool.query("SELECT sepay_id FROM sepay_events WHERE store_id=$1 AND reference=$2 AND reason='UNMATCHED_REFERENCE' ORDER BY received_at LIMIT 100",[store,reference]);
  for(const row of stale.rows){
   await this.db.transaction(async c=>{
    const rx=await c.query("SELECT * FROM sepay_events WHERE store_id=$1 AND sepay_id=$2 FOR UPDATE",[store,row.sepay_id]);
    const e=rx.rows[0];
    if(!e||e.reason!=='UNMATCHED_REFERENCE')return;
    const q=await c.query(`SELECT i.*,o.status AS order_status,o.payment_status AS order_payment_status
 FROM mirror_bank_intents i JOIN mirror_orders o ON o.store_id=i.store_id AND o.id=i.order_id
 WHERE i.store_id=$1 AND i.reference=$2 FOR UPDATE OF i,o`,[store,reference]);
    const intent=q.rows[0];
    if(!intent)return;
    const config=this.providerConfig();
    let reason='';
    if(e.account_number!==config.account||e.bank_gateway.toLowerCase()!==config.gateway.toLowerCase())
     reason='WRONG_RECEIVER';
    else if(intent.account_number!==config.account||intent.bank_code.toLowerCase()!==config.gateway.toLowerCase())
     reason='INTENT_RECEIVER_MISMATCH';
    else if(Number(intent.amount_vnd)!==Number(e.amount_vnd))reason='AMOUNT_MISMATCH';
    else if(intent.order_status!=='COMMITTED'||intent.order_payment_status!=='UNPAID'||intent.status!=='PENDING')
     reason='ORDER_ALREADY_SETTLED';
    if(!reason){
     const saved=await c.query(`INSERT INTO cloud_bank_settlements(store_id,provider_tx_id,order_id,reference,account_number,bank_code,amount_vnd)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING seq`,
     [store,'sepay:'+e.sepay_id,intent.order_id,reference,config.account,intent.bank_code,Number(e.amount_vnd)]);
     if(!saved.rowCount)reason='DUPLICATE_ORDER_SETTLEMENT';
     else{
      await c.query("UPDATE mirror_bank_intents SET status='CONFIRMED' WHERE store_id=$1 AND order_id=$2",[store,intent.order_id]);
      await c.query("UPDATE mirror_orders SET payment_status='PAID' WHERE store_id=$1 AND id=$2",[store,intent.order_id]);
     }
    }
    await c.query("UPDATE sepay_events SET state=$3,reason=$4 WHERE store_id=$1 AND sepay_id=$2",[store,e.sepay_id,reason?'EXCEPTION':'CONFIRMED',reason||null]);
   });
  }
 }
 async signedSettlements(after:unknown,store:unknown,stamp:unknown,signature:unknown){
  const key=this.bridgeSecret(),id=this.store();
  const cursor=typeof after==='string'?after:'';
  const ts=typeof stamp==='string'?stamp:'';
  const sig=typeof signature==='string'?signature:'';
  if(store!==id||!/^(0|[1-9][0-9]{0,15})$/.test(cursor)||!Number.isSafeInteger(Number(cursor))
   ||!/^[0-9]{13}$/.test(ts)||Math.abs(Date.now()-Number(ts))>300000)
   throw new UnauthorizedException('Invalid sync inbox request');
  const expected=mac(key,ts+'.GET:'+id+':'+cursor);
  if(!HEX.test(sig)||!compare(Buffer.from(expected,'hex'),Buffer.from(sig,'hex')))
   throw new UnauthorizedException('Invalid sync inbox signature');
  const rows=await this.db.pool.query(`SELECT seq,provider_tx_id,reference,account_number,bank_code,amount_vnd
 FROM cloud_bank_settlements WHERE store_id=$1 AND seq>$2 ORDER BY seq LIMIT 50`,[id,cursor]);
  const payload={store_id:id,settlements:rows.rows.map(x=>({...x,seq:Number(x.seq),amount_vnd:Number(x.amount_vnd)}))};
  const timestamp=String(Date.now());
  return {timestamp,payload,signature:mac(key,timestamp+'.'+JSON.stringify(payload))};
 }
}
