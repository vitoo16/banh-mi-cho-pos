import {Injectable,UnauthorizedException,BadRequestException} from '@nestjs/common';
import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {CloudDb} from './db';
type Event={id:string;entity:string;payload:Record<string,unknown>};
const digest=(input:string)=>createHash('sha256').update(input).digest();
function same(a:Buffer,b:Buffer){return a.length===b.length&&timingSafeEqual(a,b)}
function secretMatch(a:string,b:string){return same(digest(a),digest(b))}
function vnd(x:unknown){if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>1_000_000_000)throw new BadRequestException('Invalid VND amount');return x}
function str(x:unknown,max=180){if(typeof x!=='string'||x.length>max||!x.length)throw new BadRequestException('Invalid field');return x}
@Injectable()
export class CloudService{
 readonly sessions=new Map<string,number>();
 constructor(private readonly db:CloudDb){}
 private store(){const id=process.env.CLOUD_STORE_ID;if(!id)throw new Error('CLOUD_STORE_ID required');return id}
 private verifyBridge(payload:string,stamp:string,sig:string,store:string){
  const secret=process.env.CLOUD_SYNC_SECRET;if(!secret||secret.length<32)throw new UnauthorizedException('Sync bridge disabled');
  if(store!==this.store()||!/^[0-9]{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>300000)throw new UnauthorizedException('Stale/invalid sync origin');
  const mac=createHmac('sha256',secret).update(stamp+'.'+payload).digest();
  if(!/^[a-f0-9]{64}$/i.test(sig||'')||!same(mac,Buffer.from(sig,'hex')))throw new UnauthorizedException('Invalid sync signature');
 }
 login(uid:unknown,pin:unknown){
  const secret=process.env.CLOUD_OWNER_LOGIN_SECRET;
  if(!secret||secret.length<12)throw new UnauthorizedException('Owner cloud login not configured');
  if(uid!=='owner'||typeof pin!=='string'||pin.length>128||!secretMatch(pin,secret))throw new UnauthorizedException('Incorrect credentials');
  const token=randomBytes(32).toString('base64url');
  this.sessions.set(createHash('sha256').update(token).digest('hex'),Date.now()+8*3600_000);
  return {token,user:{id:'owner',name:'Chủ tiệm',role:'OWNER'}};
 }
 authorize(header:unknown){
  if(typeof header!=='string'||!header.startsWith('Bearer '))throw new UnauthorizedException('Authentication required');
  const key=createHash('sha256').update(header.slice(7)).digest('hex');
  if((this.sessions.get(key)||0)<=Date.now())throw new UnauthorizedException('Session expired');
 }
 async ingest(events:unknown,stamp:string,sig:string,store:string){
  if(!Array.isArray(events)||events.length>100||events.length===0)throw new BadRequestException('Invalid sync batch');
  const canonical=JSON.stringify({events});
  this.verifyBridge(canonical,stamp,sig,store);
  const storeId=this.store();
  return this.db.transaction(async c=>{
   const received:string[]=[];
   for(const event of events as Event[]){
    if(!event||typeof event!=='object'||!['order','payment','refund','product','shift','cash_movement'].includes(event.entity))throw new BadRequestException('Unknown event');
    const id=str(event.id,80),p=event.payload;
    if(!p||typeof p!=='object')throw new BadRequestException('Invalid event body');
    const inserted=await c.query('INSERT INTO synced_events(store_id,event_id,entity) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[storeId,id,event.entity]);
    if(!inserted.rowCount){received.push(id);continue}
    if(event.entity==='order'){
     const items=JSON.parse(str(p.lines_json,100000));if(!Array.isArray(items))throw new BadRequestException('Invalid order lines');
     await c.query(`INSERT INTO mirror_orders(store_id,id,display_code,created_at,created_by,status,payment_status,requested_method,total_vnd,version,lines_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
 ON CONFLICT(store_id,id) DO UPDATE SET status=EXCLUDED.status,payment_status=EXCLUDED.payment_status,total_vnd=EXCLUDED.total_vnd,version=EXCLUDED.version WHERE mirror_orders.version<EXCLUDED.version`,[storeId,str(p.id),str(p.display_code),str(p.created_at),str(p.created_by),str(p.status),str(p.payment_status),str(p.requested_method),vnd(p.total_vnd),p.version,JSON.stringify(items)]);
     }else if(event.entity==='cash_movement'){
      const amount=Number(p.amount_vnd);
      if(!Number.isSafeInteger(amount)||Math.abs(amount)>1_000_000_000)throw new BadRequestException('Invalid cash movement');
      await c.query('INSERT INTO mirror_cash_movements(store_id,id,shift_id,order_id,kind,amount_vnd,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[storeId,str(p.id),str(p.shift_id),p.order_id||null,str(p.kind),amount,str(p.created_at)]);
    }else if(event.entity==='payment'||event.entity==='refund'){
     const table=event.entity==='payment'?'mirror_payments':'mirror_refunds';
     const fields=event.entity==='payment'?'store_id,id,order_id,method,amount_vnd,created_at':'store_id,id,order_id,amount_vnd,created_at';
     const args=event.entity==='payment'?[storeId,str(p.id),str(p.order_id),str(p.method),vnd(p.amount_vnd),str(p.created_at)]:[storeId,str(p.id),str(p.order_id),vnd(p.amount_vnd),str(p.created_at)];
     const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
     await c.query('INSERT INTO '+table+'('+fields+') VALUES('+placeholders+') ON CONFLICT DO NOTHING',args);
    }else if(event.entity==='product'){
     await c.query(`INSERT INTO mirror_products(store_id,id,name,category,price_vnd,is_active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(store_id,id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price_vnd=EXCLUDED.price_vnd,is_active=EXCLUDED.is_active`,[storeId,str(p.id),str(p.name),str(p.category),vnd(p.price_vnd),Boolean(p.is_active)]);
    }else if(event.entity==='shift'){
     await c.query(`INSERT INTO mirror_shifts(store_id,id,cashier_id,opening_float_vnd,status,opened_at,closed_at,counted_cash_vnd,variance_vnd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(store_id,id) DO UPDATE SET status=EXCLUDED.status,closed_at=EXCLUDED.closed_at,counted_cash_vnd=EXCLUDED.counted_cash_vnd,variance_vnd=EXCLUDED.variance_vnd`,[storeId,str(p.id),str(p.cashier_id),vnd(p.opening_float_vnd),str(p.status),str(p.opened_at),p.closed_at||null,p.counted_cash_vnd??null,p.variance_vnd??null]);
    }
    received.push(id);
   }
   return {received};
  });
 }
 async summary(){
  const store=this.store(),rows=await this.db.pool.query(`
SELECT (SELECT COUNT(*) FROM mirror_orders WHERE store_id=$1 AND payment_status='PAID') AS paid_orders,
(SELECT COALESCE(SUM(total_vnd),0) FROM mirror_orders WHERE store_id=$1 AND payment_status='PAID') AS net_revenue_vnd,
(SELECT COALESCE(SUM(amount_vnd),0) FROM mirror_payments WHERE store_id=$1 AND method='CASH')-(SELECT COALESCE(SUM(amount_vnd),0) FROM mirror_refunds WHERE store_id=$1) AS cash_vnd,
(SELECT COALESCE(SUM(amount_vnd),0) FROM mirror_payments WHERE store_id=$1 AND method='BANK') AS bank_vnd,
(SELECT COUNT(*) FROM mirror_orders WHERE store_id=$1 AND payment_status='UNPAID' AND status='COMMITTED') AS pending_orders,
(SELECT COUNT(*) FROM mirror_orders WHERE store_id=$1 AND payment_status='UNPAID' AND requested_method='BANK' AND status='COMMITTED') AS bank_pending`,[store]);
  const r=rows.rows[0],shift=await this.db.pool.query("SELECT * FROM mirror_shifts WHERE store_id=$1 AND status='OPEN' ORDER BY opened_at DESC LIMIT 1",[store]);
  if(shift.rows[0]){
   const movements=await this.db.pool.query('SELECT COALESCE(SUM(amount_vnd),0) total FROM mirror_cash_movements WHERE store_id=$1 AND shift_id=$2',[store,shift.rows[0].id]);
   shift.rows[0].expected_cash_vnd=Number(shift.rows[0].opening_float_vnd)+Number(movements.rows[0].total);
   shift.rows[0].opening_float_vnd=Number(shift.rows[0].opening_float_vnd);
  }
  const last=await this.db.pool.query('SELECT MAX(received_at) latest FROM synced_events WHERE store_id=$1',[store]);
  return {paid_orders:Number(r.paid_orders),net_revenue_vnd:Number(r.net_revenue_vnd),cash_vnd:Number(r.cash_vnd),bank_vnd:Number(r.bank_vnd),pending_orders:Number(r.pending_orders),bank_pending:Number(r.bank_pending),last_synced_at:last.rows[0].latest||null,shift:shift.rows[0]||null};
 }
 async orders(){
  const r=await this.db.pool.query('SELECT * FROM mirror_orders WHERE store_id=$1 ORDER BY created_at DESC LIMIT 100',[this.store()]);
  return r.rows.map(x=>({...x,order_id:x.id,requested_payment_method:x.requested_method,total_vnd:Number(x.total_vnd),items:x.lines_json}));
 }
 async orderHistory(cursor?:string){
  const store=this.store();let bound:string|null=null,id:string|null=null;
  if(cursor){try{const x=JSON.parse(Buffer.from(cursor,'base64url').toString());bound=x.t;id=x.id;if(typeof bound!=='string'||typeof id!=='string')throw Error('invalid')}catch{throw new BadRequestException('Invalid cursor')}}
  const r=await this.db.pool.query('SELECT * FROM mirror_orders WHERE store_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::text)) ORDER BY created_at DESC,id DESC LIMIT 101',[store,bound,id]);
  const items=r.rows.slice(0,100).map(x=>({...x,order_id:x.id,requested_payment_method:x.requested_method,total_vnd:Number(x.total_vnd),items:x.lines_json}));
  const last=r.rows[99];return {items,next_cursor:r.rows.length>100&&last?Buffer.from(JSON.stringify({t:last.created_at,id:last.id})).toString('base64url'):null};
 }
 async products(){
  const r=await this.db.pool.query('SELECT id,name,category,price_vnd,is_active FROM mirror_products WHERE store_id=$1 ORDER BY category,name',[this.store()]);
  return {version:1,enabled_payment_methods:['CASH','BANK'],products:r.rows.map(x=>({...x,price_vnd:Number(x.price_vnd)}))};
 }
}
