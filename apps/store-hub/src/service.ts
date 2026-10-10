import {Injectable,OnModuleInit} from '@nestjs/common';
import {randomUUID,randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {StoreDb} from './db';
import {closingCash,ensureMoney,ensureQty,makeCashSettlement} from './domain';
type Role='OWNER'|'CASHIER'|'STAFF';
type Actor={id:string;role:Role;name:string};
const now=()=>new Date().toISOString();
export class StoreError extends Error {constructor(public status:number,public code:string,message:string){super(message)}}
function ensureText(x:unknown,max=500){if(typeof x!=='string'||x.length>max)throw new StoreError(400,'INVALID_TEXT','Nội dung không hợp lệ');return x.trim()}
function passwordHash(pin:string,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(pin,salt,64).toString('hex')}
function verify(pin:string,hash:string){const [salt,hex]=hash.split(':');if(!salt||!hex)return false;const a=Buffer.from(hex,'hex'),b=scryptSync(pin,salt,64);return a.length===b.length&&timingSafeEqual(a,b)}
function audit(db:StoreDb,actor:string,kind:string,entity:string,detail:object={}){db.run('INSERT INTO audit(id,actor_id,kind,entity_id,created_at,details_json) VALUES(?,?,?,?,?,?)',randomUUID(),actor,kind,entity,now(),JSON.stringify(detail))}
@Injectable()
export class StoreService implements OnModuleInit {
 readonly store=new StoreDb();
 private attempts=new Map<string,{times:number;until:number}>();
 onModuleInit(){
  const users=this.store.row<{n:number}>('SELECT COUNT(*) n FROM users')?.n||0;
  if(users!==0)return;
  const seeds=[['owner','OWNER','Chủ tiệm','BOOTSTRAP_OWNER_PIN'],['cashier','CASHIER','Thu ngân','BOOTSTRAP_CASHIER_PIN'],['staff','STAFF','Nhân viên','BOOTSTRAP_STAFF_PIN']] as const;
  for(const [_id,_role,_name,key] of seeds)if(!process.env[key]||process.env[key]!.length<6||process.env[key]!.startsWith('replace-with'))throw new Error('First run requires '+key+' (>= 6 chars). No hardcoded PINs.');
  this.store.transaction(()=>{for(const [id,role,name,key] of seeds)this.store.run('INSERT INTO users(id,name,role,pin_hash) VALUES(?,?,?,?)',id,name,role,passwordHash(process.env[key]!))});
  if(process.env.SEED_DEMO_CATALOG==='1'){
   for(const [id,name,category,price] of [['bm-thit','Bánh mì thịt nguội','Bánh mì',35000],['bm-dacbiet','Bánh mì đặc biệt','Bánh mì',45000],['bm-san','Bánh mì sẵn','Hàng sẵn',20000],['banh-bao','Bánh bao','Bánh bao',20000]] as const)
    this.store.run('INSERT INTO products(id,name,category,price_vnd) VALUES(?,?,?,?)',id,name,category,price);
  }
 }
 employees(){return this.store.all<{id:string;name:string;role:string;active:number}>('SELECT id,name,role,active FROM users ORDER BY role,id').map(u=>({...u,active:!!u.active}))}
 addEmployee(a:Actor,body:any,key:unknown){
  return this.idem('employee.add:'+a.id,key,body,()=>{
   const id=ensureText(body?.id,50).toLowerCase(),name=ensureText(body?.name,120),pin=body?.pin,role=body?.role;
   if(!/^[a-z0-9_-]{2,50}$/.test(id)||!name||!['STAFF','CASHIER'].includes(role)||typeof pin!=='string'||pin.length<6||pin.length>128)
    throw new StoreError(400,'INVALID_EMPLOYEE','Mã nhân viên, tên, vai trò hoặc PIN không hợp lệ');
   if(this.store.row('SELECT 1 FROM users WHERE id=?',id))throw new StoreError(409,'USER_EXISTS','Mã nhân viên đã tồn tại');
   this.store.run('INSERT INTO users(id,name,role,pin_hash,active) VALUES(?,?,?,?,1)',id,name,role,passwordHash(pin));
   audit(this.store,a.id,'EMPLOYEE_CREATE',id,{role,name});
   return {id,name,role,active:true};
  });
 }
 setEmployeeActive(a:Actor,id:string,body:any,key:unknown){
  return this.idem('employee.active:'+a.id+':'+id,key,body,()=>{
   const employee=this.store.row<any>('SELECT id,name,role FROM users WHERE id=?',id);
   if(!employee||employee.role==='OWNER'||typeof body?.active!=='boolean')
    throw new StoreError(400,'INVALID_EMPLOYEE','Không thể chỉnh trạng thái tài khoản này');
   this.store.run('UPDATE users SET active=? WHERE id=?',body.active?1:0,id);
   audit(this.store,a.id,'EMPLOYEE_ACTIVE',id,{active:body.active});
   return {...employee,active:body.active};
  });
 }
 login(user_id:unknown,pin:unknown){
  const uid=ensureText(user_id,80);if(typeof pin!=='string'||pin.length>128)throw new StoreError(401,'AUTH_FAILED','Thông tin đăng nhập không đúng');
  const k=uid.toLowerCase(),a=this.attempts.get(k);
  if(a&&a.until>Date.now())throw new StoreError(429,'TOO_MANY_ATTEMPTS','Thử lại sau ít phút');
  const u=this.store.row<any>('SELECT * FROM users WHERE id=? AND active=1',uid);
  if(!u||!verify(pin,u.pin_hash)){const tries=(a?.times||0)+1;this.attempts.set(k,{times:tries,until:tries>=5?Date.now()+60000:0});throw new StoreError(401,'AUTH_FAILED','Thông tin đăng nhập không đúng')}
  this.attempts.delete(k);
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  this.store.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',hash,uid,Date.now()+12*3600_000);
  return {token,user:{id:u.id,name:u.name,role:u.role}};
 }
 logout(auth:unknown){
  if(typeof auth!=='string'||!auth.startsWith('Bearer '))throw new StoreError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập');
  const hash=createHash('sha256').update(auth.slice(7)).digest('hex');this.store.run('DELETE FROM sessions WHERE token_hash=?',hash);return {success:true};
 }
 actor(auth:unknown,roles:Role[]=['OWNER','CASHIER','STAFF']):Actor{
  if(typeof auth!=='string'||!auth.startsWith('Bearer '))throw new StoreError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập');
  const token=auth.slice(7);if(token.length>200)throw new StoreError(401,'LOGIN_REQUIRED','Phiên đăng nhập không hợp lệ');
  const hash=createHash('sha256').update(token).digest('hex');
  const row=this.store.row<any>('SELECT u.id,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1',hash,Date.now());
  if(!row)throw new StoreError(401,'SESSION_EXPIRED','Phiên đăng nhập hết hạn');
  if(!roles.includes(row.role))throw new StoreError(403,'FORBIDDEN','Không có quyền thực hiện');
  return row as Actor;
 }
 private idem<T>(scope:string,key:unknown,payload:unknown,fn:()=>T):T{
  if(typeof key!=='string'||key.length<8||key.length>128)throw new StoreError(400,'IDEMPOTENCY_REQUIRED','Thiếu mã chống gửi trùng');
  const requestHash=createHash('sha256').update(JSON.stringify(payload??null)).digest('hex');
  return this.store.transaction(()=>{
   const found=this.store.row<{result_json:string;request_hash:string}>('SELECT result_json,request_hash FROM idempotency WHERE scope=? AND key=?',scope,key);
   if(found){if(found.request_hash!==requestHash)throw new StoreError(409,'IDEMPOTENCY_CONFLICT','Mã thao tác đã sử dụng cho nội dung khác');return JSON.parse(found.result_json) as T}
   const result=fn();this.store.run('INSERT INTO idempotency(scope,key,result_json,request_hash) VALUES(?,?,?,?)',scope,key,JSON.stringify(result),requestHash);return result;
  });
 }
 catalog(){
  const version=Number(this.store.row<{value:string}>("SELECT value FROM settings WHERE key='catalog_version'")?.value||1);
  return {version,products:this.store.all<any>('SELECT id,name,category,price_vnd,is_active FROM products WHERE is_active=1 ORDER BY category,name').map(p=>({...p,is_active:!!p.is_active})),enabled_payment_methods:['CASH','BANK']};
 }
 allProducts(){return {version:this.catalog().version,products:this.store.all<any>('SELECT id,name,category,price_vnd,is_active FROM products ORDER BY category,name').map(p=>({...p,is_active:!!p.is_active})),enabled_payment_methods:['CASH','BANK']}}
 createProduct(a:Actor,body:any,key:unknown){
  return this.idem('product.create:'+a.id,key,body,()=>{
   const id=randomUUID(),name=ensureText(body?.name,120),category=ensureText(body?.category||'Khác',80),price=ensureMoney(body?.price_vnd);
   if(!name)throw new StoreError(400,'INVALID_NAME','Tên món không được trống');
   this.store.run('INSERT INTO products(id,name,category,price_vnd,is_active) VALUES(?,?,?,?,1)',id,name,category,price);this.bump();audit(this.store,a.id,'PRODUCT_CREATE',id,{name,price});
   return {id,name,category,price_vnd:price,is_active:true};
  });
 }
 updateProduct(a:Actor,id:string,body:any,key:unknown){
  return this.idem('product.update:'+a.id,key,body,()=>{
   const prev=this.store.row<any>('SELECT * FROM products WHERE id=?',id);if(!prev)throw new StoreError(404,'NOT_FOUND','Không tìm thấy món');
   const name=ensureText(body?.name,120),price=ensureMoney(body?.price_vnd),active=body?.is_active;
   if(!name||typeof active!=='boolean')throw new StoreError(400,'INVALID_PRODUCT','Thông tin món không hợp lệ');
   this.store.run('UPDATE products SET name=?,price_vnd=?,is_active=? WHERE id=?',name,price,active?1:0,id);
   this.bump();audit(this.store,a.id,'PRODUCT_UPDATE',id,{old:{name:prev.name,price_vnd:prev.price_vnd},new:{name,price_vnd:price},active});
   return {id,name,category:prev.category,price_vnd:price,is_active:active};
  });
 }
 private bump(){this.store.run("UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='catalog_version'")}
 order(a:Actor,id:string){
  const row=this.store.row<any>('SELECT * FROM orders WHERE id=?',id);
  if(!row||a.role==='STAFF'&&row.created_by!==a.id)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
  return this.asOrder(row);
 }
 voidOrder(a:Actor,id:string,body:any,key:unknown){
  return this.idem('order.void:'+id,key,body,()=>{
   const row=this.store.row<any>('SELECT * FROM orders WHERE id=?',id);
   if(!row)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
   if(row.status!=='COMMITTED'||row.payment_status!=='UNPAID')throw new StoreError(409,'CANNOT_VOID','Chỉ được hủy đơn chưa thanh toán');
   const reason=ensureText(body?.reason,250);if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần ghi lý do hủy đơn');
   this.store.run("UPDATE orders SET status='VOIDED',version=version+1 WHERE id=?",id);
   audit(this.store,a.id,'ORDER_VOID',id,{reason});this.store.run('INSERT INTO cloud_outbox(id,kind,payload,created_at) VALUES(?,?,?,?)',randomUUID(),'ORDER_VOID',JSON.stringify({order_id:id}),now());return this.order(a,id);
  });
 }

  orders(a:Actor){
  const rows=a.role==='STAFF'?
   this.store.all<any>('SELECT * FROM orders WHERE created_by=? ORDER BY created_at DESC LIMIT 100',a.id):
   this.store.all<any>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');
  return rows.map(r=>this.asOrder(r));
 }
 history(a:Actor,cursor?:string,requestedLimit?:number){
  const limit=Math.max(1,Math.min(100,Number.isInteger(requestedLimit)?requestedLimit!:100));
  let boundary:{t:string;id:string}|null=null;
  if(cursor){
   try{if(cursor.length>500)throw new Error('large');const data=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(typeof data.t!=='string'||typeof data.id!=='string')throw new Error('invalid');boundary=data}
   catch{throw new StoreError(400,'INVALID_CURSOR','Mã trang không hợp lệ')}
  }
  const where:string[]=[];const args:(string|number)[]=[];
  if(a.role==='STAFF'){where.push('created_by=?');args.push(a.id)}
  if(boundary){where.push('(created_at<? OR (created_at=? AND id<?))');args.push(boundary.t,boundary.t,boundary.id)}
  const sql='SELECT * FROM orders '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY created_at DESC,id DESC LIMIT ?';
  const rows=this.store.all<any>(sql,...args,limit+1),hasMore=rows.length>limit,items=rows.slice(0,limit);
  const last=items[items.length-1];
  return {items:items.map(x=>this.asOrder(x)),next_cursor:hasMore&&last?Buffer.from(JSON.stringify({t:last.created_at,id:last.id})).toString('base64url'):null};
 }
 private asOrder(r:any){return {order_id:r.id,display_code:r.display_code,created_at:r.created_at,created_by:r.created_by,status:r.status,payment_status:r.payment_status,requested_payment_method:r.requested_method,total_vnd:r.total_vnd,version:r.version,note:r.note,items:JSON.parse(r.lines_json)}}
 createOrder(a:Actor,body:any,key:unknown){
  return this.idem('order.create:'+a.id,key,body,()=>{
   const version=this.catalog().version;if(body?.catalog_version!==version)throw new StoreError(409,'CATALOG_CHANGED','Giá bán đã cập nhật, vui lòng tải lại');
   const method=body?.requested_payment_method;
   if(!['CASH','BANK'].includes(method))throw new StoreError(422,'METHOD_DISABLED','Phương thức thanh toán chưa được bật');
   if(!Array.isArray(body?.items)||body.items.length<1||body.items.length>60)throw new StoreError(400,'EMPTY_ORDER','Đơn hàng phải có món');
   const lines:any[]=[];let total=0;
   for(const item of body.items){
    if(typeof item.product_id!=='string')throw new StoreError(400,'INVALID_PRODUCT','Món không hợp lệ');
    const p=this.store.row<any>('SELECT * FROM products WHERE id=? AND is_active=1',item.product_id);
    if(!p)throw new StoreError(409,'PRODUCT_UNAVAILABLE','Món không còn trong danh mục');
    const qty=ensureQty(item.qty);const line=p.price_vnd*qty;
    if(!Number.isSafeInteger(line))throw new StoreError(400,'INVALID_TOTAL','Tổng tiền không hợp lệ');
    total+=line;const note=ensureText(item.note||'',500);
    lines.push({product_id:p.id,name_snapshot:p.name,qty,unit_price_vnd:p.price_vnd,line_total_vnd:line,note});
   }
   ensureMoney(total,false);const note=ensureText(body.note||'',1000),id=randomUUID();
   const seq=this.store.run('INSERT INTO order_sequence DEFAULT VALUES').lastInsertRowid;
   const code='B'+String(seq).padStart(5,'0');
   this.store.run('INSERT INTO orders(id,display_code,created_at,created_by,requested_method,total_vnd,note,lines_json) VALUES(?,?,?,?,?,?,?,?)',id,code,now(),a.id,method,total,note,JSON.stringify(lines));
   audit(this.store,a.id,'ORDER_COMMIT',id,{total_vnd:total,requested_method:method});
   this.store.run('INSERT INTO cloud_outbox(id,kind,payload,created_at) VALUES(?,?,?,?)',randomUUID(),'ORDER',JSON.stringify({order_id:id,display_code:code,total_vnd:total,status:'COMMITTED',created_at:now()}),now());
   return this.order(a,id);
  });
 }
 openShift(a:Actor,body:any,key:unknown){
  return this.idem('shift.open:'+a.id,key,body,()=>{
   const current=this.store.row<any>("SELECT id FROM shifts WHERE status='OPEN' LIMIT 1");
   if(current)throw new StoreError(409,'SHIFT_ALREADY_OPEN','Đang có ca mở');
   const amount=ensureMoney(body?.opening_float_vnd),id=randomUUID();
   this.store.run('INSERT INTO shifts(id,cashier_id,opening_float_vnd,status,opened_at) VALUES(?,?,?,?,?)',id,a.id,amount,'OPEN',now());
   audit(this.store,a.id,'SHIFT_OPEN',id,{opening_float_vnd:amount});return this.getShift(id)!;
  });
 }
 currentShift(){const r=this.store.row<any>("SELECT id FROM shifts WHERE status='OPEN' LIMIT 1");return r?this.getShift(r.id):null}
 getShift(id:string){
  const s=this.store.row<any>('SELECT * FROM shifts WHERE id=?',id);if(!s)return null;
  const moves=this.store.all<{amount_vnd:number}>('SELECT amount_vnd FROM cash_movements WHERE shift_id=?',id).map(x=>x.amount_vnd);
  return {id:s.id,cashier_id:s.cashier_id,opening_float_vnd:s.opening_float_vnd,status:s.status,opened_at:s.opened_at,closed_at:s.closed_at||undefined,expected_cash_vnd:closingCash(s.opening_float_vnd,moves),counted_cash_vnd:s.counted_cash_vnd??undefined,variance_vnd:s.variance_vnd??undefined};
 }
 cash(a:Actor,orderId:string,body:any,key:unknown){
  return this.idem('capture.cash:'+orderId,key,body,()=>{
   const shift=this.store.row<any>("SELECT * FROM shifts WHERE id=? AND status='OPEN'",body?.shift_id);
   if(!shift||shift.cashier_id!==a.id)throw new StoreError(409,'INVALID_SHIFT','Ca này không thuộc thu ngân đang đăng nhập');
   const order=this.store.row<any>('SELECT * FROM orders WHERE id=?',orderId);
   if(!order)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
   if(order.payment_status!=='UNPAID'||order.status!=='COMMITTED')throw new StoreError(409,'ORDER_SETTLED','Đơn đã thanh toán hoặc không hợp lệ');
   if(body?.expected_order_version!==order.version)throw new StoreError(409,'ORDER_CHANGED','Đơn đã được chỉnh sửa, vui lòng tải lại');
   const m=makeCashSettlement(order.total_vnd,body?.cash_tendered_vnd),paymentId=randomUUID(),t=now();
   this.store.run('INSERT INTO payments(id,order_id,method,amount_vnd,tendered_vnd,change_vnd,created_at,actor_id) VALUES(?,?,?,?,?,?,?,?)',paymentId,orderId,'CASH',m.net,m.tendered,m.change,t,a.id);
   for(const [kind,value] of [['CASH_RECEIVED',m.tendered],['CHANGE_PAID',-m.change]] as const){
    this.store.run('INSERT INTO cash_movements(id,shift_id,order_id,kind,amount_vnd,created_at,actor_id) VALUES(?,?,?,?,?,?,?)',randomUUID(),shift.id,orderId,kind,value,t,a.id);
   }
   this.store.run("UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=?",orderId);
   const batch=randomUUID();
   for(const kind of ['CUSTOMER','STORE'])
    this.store.run("INSERT INTO receipts(id,batch_id,order_id,kind,status,created_at) VALUES(?,?,?,?,?,?)",randomUUID(),batch,orderId,kind,'WAITING_FOR_PRINTER',t);
   audit(this.store,a.id,'CASH_CAPTURE',orderId,{payment_id:paymentId,amount:m.net,tendered:m.tendered,change:m.change,batch_id:batch});
   return {payment_id:paymentId,cash_tendered_vnd:m.tendered,cash_change_vnd:m.change,cash_net_vnd:m.net,payment_status:'PAID',receipt_batch_id:batch};
  });
 }
 receipts(a:Actor,orderId:string){this.order(a,orderId);return this.store.all<any>('SELECT id,kind,status,attempts FROM receipts WHERE order_id=? ORDER BY kind',orderId)}
 refundCash(a:Actor,orderId:string,body:any,key:unknown){
  return this.idem('cash.refund:'+orderId,key,body,()=>{
   const shift=this.store.row<any>("SELECT * FROM shifts WHERE id=? AND status='OPEN'",body?.shift_id);
   if(!shift||shift.cashier_id!==a.id)throw new StoreError(409,'INVALID_SHIFT','Ca thu ngân không hợp lệ');
   const order=this.store.row<any>('SELECT * FROM orders WHERE id=?',orderId);
   if(!order||order.status!=='COMMITTED'||order.payment_status!=='PAID')throw new StoreError(409,'CANNOT_REFUND','Đơn không đủ điều kiện hoàn tiền');
   if(order.version!==body?.expected_order_version)throw new StoreError(409,'ORDER_CHANGED','Đơn đã thay đổi');
   const p=this.store.row<any>("SELECT id,amount_vnd FROM payments WHERE order_id=? AND method='CASH'",orderId);
   if(!p)throw new StoreError(409,'BANK_REFUND_UNSUPPORTED','Hoàn tiền ngân hàng phải xử lý qua dịch vụ ngân hàng');
   const reason=ensureText(body?.reason,300);if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần lý do hoàn tiền');
   if(this.getShift(shift.id)!.expected_cash_vnd<p.amount_vnd)throw new StoreError(409,'INSUFFICIENT_DRAWER','Quỹ không đủ hoàn tiền');
   const t=now(),ref=randomUUID();
   this.store.run('INSERT INTO refunds(id,order_id,payment_id,shift_id,amount_vnd,created_at,reason,actor_id) VALUES(?,?,?,?,?,?,?,?)',ref,orderId,p.id,shift.id,p.amount_vnd,t,reason,a.id);
   this.store.run('INSERT INTO cash_movements(id,shift_id,order_id,kind,amount_vnd,created_at,reason,actor_id) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),shift.id,orderId,'REFUND',-p.amount_vnd,t,reason,a.id);
   this.store.run("UPDATE orders SET payment_status='REFUNDED',version=version+1 WHERE id=?",orderId);
   audit(this.store,a.id,'CASH_REFUND',orderId,{refund_id:ref,payment_id:p.id,amount_vnd:p.amount_vnd,reason});
   return {refund_id:ref,amount_vnd:p.amount_vnd,payment_status:'REFUNDED'};
  });
 }
 reprint(a:Actor,id:string,body:any,key:unknown){
  return this.idem('receipt.reprint:'+id,key,body,()=>{
   const r=this.store.row<any>('SELECT * FROM receipts WHERE id=?',id);if(!r)throw new StoreError(404,'NOT_FOUND','Không tìm thấy liên in');
   const reason=ensureText(body?.reason,250);if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần ghi lý do in lại');
   this.store.run("UPDATE receipts SET status='WAITING_FOR_PRINTER',attempts=attempts+1 WHERE id=?",id);
   audit(this.store,a.id,'RECEIPT_REPRINT',r.order_id,{copy_id:id,kind:r.kind,reason});
   return {id,kind:r.kind,status:'WAITING_FOR_PRINTER',attempts:r.attempts+1};
  });
 }
 movement(a:Actor,shiftId:string,body:any,key:unknown){
  return this.idem('shift.movement:'+shiftId,key,body,()=>{
   const s=this.store.row<any>("SELECT * FROM shifts WHERE id=? AND status='OPEN'",shiftId);
   if(!s||s.cashier_id!==a.id)throw new StoreError(409,'INVALID_SHIFT','Ca không hợp lệ');
   const kind=body?.kind;if(!['ADD','WITHDRAW','EXPENSE'].includes(kind))throw new StoreError(400,'INVALID_MOVEMENT','Loại giao dịch không hợp lệ');
   const amount=ensureMoney(body?.amount_vnd,false),reason=ensureText(body?.reason,250);
   if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Vui lòng ghi lý do');
   const signed=kind==='ADD'?amount:-amount;
   const balance=this.getShift(shiftId)!.expected_cash_vnd;
   if(balance+signed<0)throw new StoreError(409,'INSUFFICIENT_DRAWER','Quỹ không đủ tiền');
   this.store.run('INSERT INTO cash_movements(id,shift_id,kind,amount_vnd,created_at,reason,actor_id) VALUES(?,?,?,?,?,?,?)',randomUUID(),shiftId,kind,signed,now(),reason,a.id);
   audit(this.store,a.id,'CASH_MOVEMENT',shiftId,{kind,amount_vnd:amount,reason});return this.getShift(shiftId)!;
  });
 }
 closeShift(a:Actor,id:string,body:any,key:unknown){
  return this.idem('shift.close:'+id,key,body,()=>{
   const s=this.store.row<any>("SELECT * FROM shifts WHERE id=? AND status='OPEN'",id);
   if(!s||s.cashier_id!==a.id)throw new StoreError(409,'INVALID_SHIFT','Không thể chốt ca không thuộc thu ngân');
   const counted=ensureMoney(body?.counted_cash_vnd),expected=this.getShift(id)!.expected_cash_vnd;
   const reason=ensureText(body?.reason||'',500);
   if(counted!==expected&&reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Ca lệch quỹ cần ghi lý do');
   this.store.run("UPDATE shifts SET status='CLOSED',closed_at=?,counted_cash_vnd=?,variance_vnd=?,close_reason=? WHERE id=?",now(),counted,counted-expected,reason,id);
   audit(this.store,a.id,'SHIFT_CLOSE',id,{expected,counted,variance:counted-expected,reason});
   return this.getShift(id)!;
  });
 }
 summary(){
  const p=this.store.row<any>("SELECT COUNT(*) paid_orders,COALESCE(SUM(total_vnd),0) net_revenue_vnd FROM orders WHERE payment_status='PAID'");
  const cash=(this.store.row<any>("SELECT COALESCE(SUM(amount_vnd),0) val FROM payments WHERE method='CASH'")?.val||0)-(this.store.row<any>("SELECT COALESCE(SUM(amount_vnd),0) val FROM refunds")?.val||0);
  const unpaid=this.store.row<any>("SELECT COUNT(*) n FROM orders WHERE status='COMMITTED' AND payment_status='UNPAID'")?.n||0;
  const bank=this.store.row<any>("SELECT COUNT(*) n FROM orders WHERE status='COMMITTED' AND payment_status='UNPAID' AND requested_method='BANK'")?.n||0;
  return {paid_orders:p.paid_orders,net_revenue_vnd:p.net_revenue_vnd,cash_vnd:cash,bank_vnd:(this.store.row<{v:number}>("SELECT COALESCE(SUM(amount_vnd),0) v FROM payments WHERE method='BANK'")?.v||0),pending_orders:unpaid,bank_pending:bank,last_synced_at:now(),shift:this.currentShift()};
 }
 createBankIntent(a:Actor,orderId:string,key:unknown){
  if(!process.env.CLOUD_SYNC_URL||!process.env.BANK_BIN||!process.env.BANK_ACCOUNT_NUMBER)throw new StoreError(503,'BANK_NOT_CONFIGURED','Chưa cấu hình tài khoản ngân hàng/Cloud');
  return this.idem('bank.intent:'+orderId,key,{orderId},()=>{
   const o=this.store.row<any>('SELECT * FROM orders WHERE id=?',orderId);
   if(!o)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
   if(o.status!=='COMMITTED'||o.payment_status!=='UNPAID')throw new StoreError(409,'INVALID_ORDER','Đơn đã hủy hoặc thanh toán');
   const old=this.store.row<{reference:string}>('SELECT reference FROM bank_intents WHERE order_id=?',orderId);if(old)return old.reference;
   const ref='BMC'+randomBytes(8).toString('hex').toUpperCase();
   this.store.run('INSERT INTO bank_intents(order_id,reference,amount_vnd,created_at) VALUES(?,?,?,?)',orderId,ref,o.total_vnd,now());
   this.store.run('INSERT INTO cloud_outbox(id,kind,payload,created_at) VALUES(?,?,?,?)',randomUUID(),'BANK_INTENT',JSON.stringify({order_id:orderId,reference:ref,amount_vnd:o.total_vnd,account_number:process.env.BANK_ACCOUNT_NUMBER,bank_bin:process.env.BANK_BIN}),now());
   audit(this.store,a.id,'BANK_INTENT_CREATE',orderId,{reference:ref});return ref;
  });
 }
}
