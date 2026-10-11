import {Injectable,BadRequestException,NotFoundException,UnauthorizedException,HttpException} from '@nestjs/common';
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {CloudDb} from './db';

export type RemoteProductCommand={
 id:string;product_id:string;name:string;price_vnd:number;expected_price_vnd:number;
 is_active:boolean;status:'PENDING'|'APPLIED'|'CONFLICT';result_code:string|null;
 created_at:string;completed_at:string|null;
};
const validMoney=(value:unknown)=>Number.isSafeInteger(value)&&typeof value==='number'&&value>=0&&value<=1_000_000_000;
const ownStore=()=>{const store=process.env.CLOUD_STORE_ID;if(!store)throw Error('CLOUD_STORE_ID required');return store};
const signed=(stamp:string,content:string)=>createHmac('sha256',process.env.CLOUD_SYNC_SECRET!).update(stamp+'.'+content).digest('hex');
const asCommand=(row:any):RemoteProductCommand=>({
 id:row.id,product_id:row.product_id,name:row.name,price_vnd:Number(row.price_vnd),
 expected_price_vnd:Number(row.expected_price_vnd),is_active:row.is_active,
 status:row.status,result_code:row.result_code,
 created_at:new Date(row.created_at).toISOString(),
 completed_at:row.completed_at?new Date(row.completed_at).toISOString():null,
});
@Injectable()
export class RemoteProductCommands{
 constructor(private readonly db:CloudDb){}
 private verify(stamp:string,sig:string,store:string,content:string){
  const secret=process.env.CLOUD_SYNC_SECRET;
  if(!secret||secret.length<32||store!==ownStore()||
    !/^[0-9]{13}$/.test(stamp||'')||Math.abs(Date.now()-Number(stamp))>300000||
    !/^[0-9a-f]{64}$/i.test(sig||''))throw new UnauthorizedException('Invalid cloud sync signature');
  const expected=Buffer.from(signed(stamp,content),'hex'),actual=Buffer.from(sig,'hex');
  if(!timingSafeEqual(expected,actual))throw new UnauthorizedException('Invalid cloud sync signature');
 }
 async enqueue(id:string,raw:any,key:string):Promise<RemoteProductCommand>{
  if(!/^[A-Za-z0-9_-]{1,90}$/.test(id||'')||typeof key!=='string'||key.length<8||key.length>128)
   throw new BadRequestException('Product ID or idempotency key invalid');
  const name=typeof raw?.name==='string'?raw.name.trim():'';
  const price=raw?.price_vnd,expected=raw?.expected_price_vnd,active=raw?.is_active;
  if(!name||name.length>120||!validMoney(price)||!validMoney(expected)||typeof active!=='boolean')
   throw new BadRequestException('Invalid product price update');
  const data={id,name,price_vnd:price,expected_price_vnd:expected,is_active:active};
  const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex'),store=ownStore();
  return this.db.transaction(async client=>{
   const prior=await client.query('SELECT * FROM remote_product_commands WHERE store_id=$1 AND idem_key=$2',[store,key]);
   if(prior.rows.length){
    if(prior.rows[0].payload_hash!==hash)throw new HttpException({code:'IDEMPOTENCY_PAYLOAD_MISMATCH',message:'Idempotency key reused with different content'},409);
    return asCommand(prior.rows[0]);
   }
   const exists=await client.query('SELECT 1 FROM mirror_products WHERE store_id=$1 AND id=$2',[store,id]);
   if(!exists.rowCount)throw new NotFoundException('Product not yet mirrored from Store Hub');
   const commandId=randomUUID();
   await client.query(`INSERT INTO remote_product_commands
    (id,store_id,idem_key,payload_hash,product_id,name,price_vnd,expected_price_vnd,is_active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(store_id,idem_key) DO NOTHING`,
    [commandId,store,key,hash,id,name,price,expected,active]);
   const saved=await client.query('SELECT * FROM remote_product_commands WHERE store_id=$1 AND idem_key=$2',[store,key]);
   if(saved.rows[0].payload_hash!==hash)throw new HttpException({code:'IDEMPOTENCY_PAYLOAD_MISMATCH',message:'Idempotency key reused with different content'},409);
   return asCommand(saved.rows[0]);
  });
 }
 async list():Promise<RemoteProductCommand[]>{
  const result=await this.db.pool.query('SELECT * FROM remote_product_commands WHERE store_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[ownStore()]);
  return result.rows.map(asCommand);
 }
 async poll(store:string,stamp:string,sig:string){
  this.verify(stamp,sig,store,'GET:product-commands');
  const rows=await this.db.pool.query("SELECT * FROM remote_product_commands WHERE store_id=$1 AND status='PENDING' ORDER BY created_at,id LIMIT 20",[ownStore()]);
  const payload={store_id:ownStore(),commands:rows.rows.map(asCommand)};
  const responseStamp=String(Date.now());
  return {timestamp:responseStamp,payload,signature:signed(responseStamp,JSON.stringify(payload))};
 }
 async acknowledge(input:unknown,stamp:string,sig:string,store:string){
  const results=(input as {results?:unknown})?.results;
  if(!Array.isArray(results)||results.length<1||results.length>20)throw new BadRequestException('Invalid command results');
  // The signed envelope includes the exact ordered list sent by the Hub.
  this.verify(stamp,sig,store,JSON.stringify({results}));
  const accepted:string[]=[];
  await this.db.transaction(async client=>{
   for(const value of results){
    if(!value||typeof value!=='object')throw new BadRequestException('Invalid command result');
    const {id,status,result_code}=value as Record<string,unknown>;
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)||
      (status!=='APPLIED'&&status!=='CONFLICT')||
      typeof result_code!=='string'||!/^[A-Z_]{2,60}$/.test(result_code))
     throw new BadRequestException('Invalid command result');
    const row=await client.query(`UPDATE remote_product_commands
      SET status=$3,result_code=$4,completed_at=now()
      WHERE store_id=$1 AND id=$2 AND status='PENDING' RETURNING id`,
      [ownStore(),id,status,result_code]);
    if(row.rowCount)accepted.push(id);
    else{
     const prev=await client.query('SELECT status,result_code FROM remote_product_commands WHERE store_id=$1 AND id=$2',[ownStore(),id]);
     if(!prev.rowCount||prev.rows[0].status!==status||prev.rows[0].result_code!==result_code)
      throw new HttpException({code:'COMMAND_ACK_CONFLICT',message:'Conflicting command acknowledgement'},409);
     accepted.push(id); // Same signed ACK replay is safe.
    }
   }
  });
  return {accepted};
 }
}
