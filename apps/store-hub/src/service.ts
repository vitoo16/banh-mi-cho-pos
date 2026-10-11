import {salesWindow,type SalesPeriod,type ProductSalesReport} from '@bmc/contracts';
import {Injectable,OnModuleInit} from '@nestjs/common';
import {randomUUID,randomBytes,createHash,createHmac,scryptSync,timingSafeEqual} from 'node:crypto';
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
function stableIdempotencyJson(value:unknown):string{
 if(value===null||value===undefined)return 'null';
 if(Array.isArray(value))return '['+value.map(stableIdempotencyJson).join(',')+']';
 if(typeof value==='object'){
  const record=value as Record<string,unknown>;
  return '{'+Object.keys(record).filter(k=>record[k]!==undefined).sort()
   .map(k=>JSON.stringify(k)+':'+stableIdempotencyJson(record[k])).join(',')+'}';
 }
 const result=JSON.stringify(value);
 if(result===undefined)throw new StoreError(400,'INVALID_IDEMPOTENCY_PAYLOAD','Nội dung yêu cầu không hợp lệ');
 return result;
}

@Injectable()
export class StoreService implements OnModuleInit {
 readonly store=new StoreDb();

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
 issuePairing(a:Actor,labelInput:unknown,key:unknown){
  return this.idem('pairing.issue:'+a.id,key,labelInput,()=>{
   const label=ensureText(labelInput,80);
   if(label.length<3)throw new StoreError(400,'INVALID_DEVICE_LABEL','Tên thiết bị phải từ 3 ký tự');
   const code=randomBytes(8).toString('hex').toUpperCase(),hash=createHash('sha256').update(code).digest('hex');
   const expires_at=Date.now()+180000;
   this.store.run('INSERT INTO device_pairing_codes(code_hash,label,created_by,expires_at) VALUES(?,?,?,?)',hash,label,a.id,expires_at);
   audit(this.store,a.id,'PAIRING_ISSUED',hash,{label,expires_at});
   return {pairing_code:code,label,expires_at};
  });
 }
 assertRemoteStaffAccount(userId:unknown){
  const id=typeof userId==='string'&&userId.length<=80?userId.trim():'';
  const user=id?this.store.row<{role:string;active:number}>('SELECT role,active FROM users WHERE id=?',id):undefined;
  if(!user||user.role!=='STAFF'||!user.active)
   throw new StoreError(403,'REMOTE_STAFF_ONLY','Điện thoại chỉ được đăng nhập bằng tài khoản nhân viên');
 }
 devices(){return this.store.all<any>('SELECT id,user_id,label,created_at,last_seen_at,revoked_at FROM staff_devices ORDER BY created_at DESC LIMIT 100')}
 revokeDevice(a:Actor,id:string,reasonInput:unknown,key:unknown){
  return this.idem('device.revoke:'+id,key,{id,reasonInput},()=>{
   const device=this.store.row<any>('SELECT * FROM staff_devices WHERE id=?',id);
   if(!device)throw new StoreError(404,'NOT_FOUND','Không tìm thấy thiết bị');
   const reason=ensureText(reasonInput,250);
   if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần ghi lý do thu hồi thiết bị');
   if(!device.revoked_at){
    this.store.run('UPDATE staff_devices SET revoked_at=? WHERE id=?',now(),id);
    this.store.run('DELETE FROM sessions WHERE device_id=?',id);
    audit(this.store,a.id,'DEVICE_REVOKE',id,{reason});
   }
   return {ok:true,revoked:true};
  });
 }
 employees(){return this.store.all<{id:string;name:string;role:string;active:number}>('SELECT id,name,role,active FROM users ORDER BY role,id').map(u=>({...u,active:!!u.active}))}
 addEmployee(a:Actor,body:any,key:unknown){
  return this.idem('employee.add:'+a.id,key,{id:body?.id,name:body?.name,role:body?.role},()=>{
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
  return this.idem('employee.active:'+a.id+':'+id,key,{id,body},()=>{
   const employee=this.store.row<any>('SELECT id,name,role FROM users WHERE id=?',id);
   if(!employee||employee.role==='OWNER'||typeof body?.active!=='boolean')
    throw new StoreError(400,'INVALID_EMPLOYEE','Không thể chỉnh trạng thái tài khoản này');
   this.store.run('UPDATE users SET active=? WHERE id=?',body.active?1:0,id);
   if(!body.active)this.store.run('DELETE FROM sessions WHERE user_id=?',id);
   audit(this.store,a.id,'EMPLOYEE_ACTIVE',id,{active:body.active});
   return {...employee,active:body.active};
  });
 }
 login(user_id:unknown,pin:unknown,pairing_code?:unknown,device_token?:unknown){
  const uid=ensureText(user_id,80);if(typeof pin!=='string'||pin.length>128)throw new StoreError(401,'AUTH_FAILED','Thông tin đăng nhập không đúng');
  const k=uid.toLowerCase();
  const a=this.store.row<{attempts:number;blocked_until:number}>('SELECT attempts,blocked_until FROM login_attempts WHERE user_id=?',k);
  if(a&&a.blocked_until>Date.now())throw new StoreError(429,'TOO_MANY_ATTEMPTS','Thử lại sau ít phút');
  const u=this.store.row<any>('SELECT * FROM users WHERE id=? AND active=1',uid);
  if(!u||!verify(pin,u.pin_hash)){
   const tries=(a?.blocked_until&&a.blocked_until<Date.now()?0:a?.attempts||0)+1;
   const blockedUntil=tries>=5?Date.now()+60000:0;
   this.store.run('INSERT INTO login_attempts(user_id,attempts,blocked_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET attempts=excluded.attempts,blocked_until=excluded.blocked_until',k,tries,blockedUntil);
   throw new StoreError(401,'AUTH_FAILED','Thông tin đăng nhập không đúng');
  }
  this.store.run('DELETE FROM login_attempts WHERE user_id=?',k);
  const mustPair=u.role==='STAFF'&&process.env.PAIRING_ENFORCED==='1';
  let deviceId:string|null=null,newDeviceToken:string|undefined;
  if(mustPair){
   if(typeof device_token==='string'&&device_token.length<=200){
    const tokenHash=createHash('sha256').update(device_token).digest('hex');
    const matched=this.store.row<{id:string}>('SELECT id FROM staff_devices WHERE user_id=? AND token_hash=? AND revoked_at IS NULL',uid,tokenHash);
    if(matched)deviceId=matched.id;
   }
   if(!deviceId&&typeof pairing_code==='string'&&/^[A-F0-9]{16}$/.test(pairing_code.trim().toUpperCase())){
    const codeHash=createHash('sha256').update(pairing_code.trim().toUpperCase()).digest('hex');
    const generated=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(generated).digest('hex');
    deviceId=this.store.transaction(()=>{
     const pairing=this.store.row<{label:string}>('SELECT label FROM device_pairing_codes WHERE code_hash=? AND expires_at>? AND claimed_at IS NULL',codeHash,Date.now());
     if(!pairing)return null;
     this.store.run('UPDATE device_pairing_codes SET claimed_at=? WHERE code_hash=? AND claimed_at IS NULL',Date.now(),codeHash);
     const id=randomUUID();
     this.store.run('INSERT INTO staff_devices(id,user_id,label,token_hash,created_at) VALUES(?,?,?,?,?)',id,uid,pairing.label,tokenHash,now());
     audit(this.store,uid,'DEVICE_PAIR',id,{label:pairing.label});
     return id;
    });
    if(deviceId)newDeviceToken=generated;
   }
   if(!deviceId)throw new StoreError(403,'DEVICE_PAIRING_REQUIRED','Thiết bị chưa được ghép hoặc đã bị thu hồi. Cần mã ghép từ chủ tiệm.');
  }
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  this.store.run('INSERT INTO sessions(token_hash,user_id,expires_at,device_id) VALUES(?,?,?,?)',hash,uid,Date.now()+12*3600_000,deviceId);
  return {...newDeviceToken?{device_token:newDeviceToken}:{},token,user:{id:u.id,name:u.name,role:u.role}};
 }
 logout(auth:unknown,deviceToken?:unknown){
  this.actor(auth,undefined,deviceToken);
  const token=(auth as string).slice(7);
  const hash=createHash('sha256').update(token).digest('hex');
  this.store.run('DELETE FROM sessions WHERE token_hash=?',hash);
  return {ok:true};
 }
 actor(auth:unknown,roles:Role[]=['OWNER','CASHIER','STAFF'],deviceToken?:unknown):Actor{
  if(typeof auth!=='string'||!auth.startsWith('Bearer '))throw new StoreError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập');
  const token=auth.slice(7);if(token.length>200)throw new StoreError(401,'LOGIN_REQUIRED','Phiên đăng nhập không hợp lệ');
  const hash=createHash('sha256').update(token).digest('hex');
  const row=this.store.row<any>('SELECT u.id,u.name,u.role,s.device_id FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1',hash,Date.now());
  if(!row)throw new StoreError(401,'SESSION_EXPIRED','Phiên đăng nhập hết hạn');
  if(!roles.includes(row.role))throw new StoreError(403,'FORBIDDEN','Không có quyền thực hiện');
  if(row.role==='STAFF'&&process.env.PAIRING_ENFORCED==='1'){
   if(typeof deviceToken!=='string'||deviceToken.length>200||!row.device_id)
    throw new StoreError(401,'DEVICE_NOT_TRUSTED','Thiết bị chưa được xác minh hoặc đã bị thu hồi');
   const tokenHash=createHash('sha256').update(deviceToken).digest('hex');
   const device=this.store.row('SELECT 1 FROM staff_devices WHERE id=? AND user_id=? AND token_hash=? AND revoked_at IS NULL',row.device_id,row.id,tokenHash);
   if(!device)throw new StoreError(401,'DEVICE_NOT_TRUSTED','Thiết bị chưa được xác minh hoặc đã bị thu hồi');
  }
  return {id:row.id,name:row.name,role:row.role} as Actor;
 }
 private idem<T>(scope:string,key:unknown,payload:unknown,fn:()=>T):T{
  if(typeof key!=='string'||key.length<8||key.length>128)throw new StoreError(400,'IDEMPOTENCY_REQUIRED','Thiếu mã chống gửi trùng');
  const requestHash=createHash('sha256').update(stableIdempotencyJson(payload)).digest('hex');
  return this.store.transaction(()=>{
   const found=this.store.row<{request_hash:string|null;result_json:string}>('SELECT request_hash,result_json FROM idempotency WHERE scope=? AND key=?',scope,key);
   if(found){
    if(!found.request_hash)throw new StoreError(409,'IDEMPOTENCY_LEGACY_REVIEW','Yêu cầu cũ cần đối soát thủ công; không gửi lại tiền');
    if(found.request_hash!==requestHash)throw new StoreError(409,'IDEMPOTENCY_PAYLOAD_MISMATCH','Mã chống trùng đã được dùng với nội dung khác');
    return JSON.parse(found.result_json) as T;
   }
   const result=fn();
   this.store.run('INSERT INTO idempotency(scope,key,request_hash,result_json) VALUES(?,?,?,?)',scope,key,requestHash,JSON.stringify(result));
   return result;
  });
 }
 catalog(){
  const version=Number(this.store.row<{value:string}>("SELECT value FROM settings WHERE key='catalog_version'")?.value||1);
  return {version,products:this.store.all<any>('SELECT id,name,category,price_vnd,is_active FROM products WHERE is_active=1 ORDER BY category,name').map(p=>({...p,is_active:!!p.is_active})),enabled_payment_methods:['CASH','BANK']};
 }
 allProducts(){return {version:this.catalog().version,products:this.store.all<any>('SELECT id,name,category,price_vnd,is_active FROM products ORDER BY category,name').map(p=>({...p,is_active:!!p.is_active})),enabled_payment_methods:['CASH','BANK']}}
 createProduct(a:Actor,body:any,key:unknown,preassignedId?:string){
  const payload=preassignedId?{body,preassignedId}:body;
  return this.idem('product.create:'+a.id,key,payload,()=>{
   if(preassignedId&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(preassignedId))
    throw new StoreError(400,'INVALID_PRODUCT_ID','Mã món mới không hợp lệ');
   const id=preassignedId||randomUUID(),name=ensureText(body?.name,120);
   const category=ensureText(body?.category||'Khác',80),price=ensureMoney(body?.price_vnd);
   const active=body?.is_active===undefined?true:body.is_active;
   if(!name||!category||typeof active!=='boolean')
    throw new StoreError(400,'INVALID_PRODUCT','Thông tin món mới không hợp lệ');
   if(this.store.row('SELECT 1 FROM products WHERE id=?',id))
    throw new StoreError(409,'PRODUCT_ALREADY_EXISTS','Món đã tồn tại tại POS');
   this.store.run('INSERT INTO products(id,name,category,price_vnd,is_active) VALUES(?,?,?,?,?)',id,name,category,price,active?1:0);
   this.bump();audit(this.store,a.id,'PRODUCT_CREATE',id,{name,category,price,is_active:active});
   return {id,name,category,price_vnd:price,is_active:active};
  });
 }
 updateProduct(a:Actor,id:string,body:any,key:unknown){
  return this.idem('product.update:'+a.id,key,{id,body},()=>{
   const prev=this.store.row<any>('SELECT * FROM products WHERE id=?',id);if(!prev)throw new StoreError(404,'NOT_FOUND','Không tìm thấy món');
   if(body?.expected_price_vnd!==undefined){
    const expected=body.expected_price_vnd;
    if(!Number.isSafeInteger(expected)||expected<0||expected>1_000_000_000)
     throw new StoreError(400,'INVALID_EXPECTED_PRICE','Giá đối chiếu không hợp lệ');
    if(prev.price_vnd!==expected)throw new StoreError(409,'PRICE_CHANGED','Giá đã thay đổi tại POS; cần kiểm tra lại');
   }
   const name=ensureText(body?.name,120),price=ensureMoney(body?.price_vnd),active=body?.is_active;
   if(!name||typeof active!=='boolean')throw new StoreError(400,'INVALID_PRODUCT','Thông tin món không hợp lệ');
   this.store.run('UPDATE products SET name=?,price_vnd=?,is_active=? WHERE id=?',name,price,active?1:0,id);
   this.bump();audit(this.store,a.id,'PRODUCT_UPDATE',id,{old:{name:prev.name,price_vnd:prev.price_vnd},new:{name,price_vnd:price},active});
   return {id,name,category:prev.category,price_vnd:price,is_active:active};
  });
 }
 /**
  * Only the authenticated/signed outbound CloudSyncWorker may call this method.
  * Same command id is an idempotent key persisted inside the update transaction.
  */
 applyRemoteProductCommand(command:{
  id:string;product_id:string;operation?:'CREATE'|'UPDATE';category?:string;
  name:string;price_vnd:number;expected_price_vnd:number;is_active:boolean;
 }){
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(command.id)||
   !/^[A-Za-z0-9_-]{1,90}$/.test(command.product_id))
   throw new StoreError(400,'INVALID_CLOUD_COMMAND','Lệnh cloud không hợp lệ');
  const actor:Actor={id:'cloud-owner',role:'OWNER',name:'Chủ tiệm từ xa'};
  if(command.operation==='CREATE'){
   if(!command.category||command.category.length>80||command.expected_price_vnd!==0)
    throw new StoreError(400,'INVALID_CLOUD_COMMAND','Lệnh tạo món không hợp lệ');
   return this.createProduct(actor,{
    name:command.name,category:command.category,price_vnd:command.price_vnd,is_active:command.is_active,
   },command.id,command.product_id);
  }
  if(command.operation&&command.operation!=='UPDATE')
   throw new StoreError(400,'INVALID_CLOUD_COMMAND','Loại lệnh không hỗ trợ');
  return this.updateProduct(actor,command.product_id,{
   name:command.name,price_vnd:command.price_vnd,is_active:command.is_active,
   expected_price_vnd:command.expected_price_vnd,
  },command.id);
 }
 private bump(){this.store.run("UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='catalog_version'")}
 order(a:Actor,id:string){
  const row=this.store.row<any>('SELECT * FROM orders WHERE id=?',id);
  if(!row||a.role==='STAFF'&&row.created_by!==a.id)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
  return this.asOrder(row);
 }
 voidOrder(a:Actor,id:string,body:any,key:unknown){
  return this.idem('order.void:'+id,key,{id,body},()=>{
   const row=this.store.row<any>('SELECT * FROM orders WHERE id=?',id);
   if(!row)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
   if(row.status!=='COMMITTED'||row.payment_status!=='UNPAID')throw new StoreError(409,'CANNOT_VOID','Chỉ được hủy đơn chưa thanh toán');
   const reason=ensureText(body?.reason,250);if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần ghi lý do hủy đơn');
   this.store.run("UPDATE orders SET status='VOIDED',version=version+1 WHERE id=?",id);
   audit(this.store,a.id,'ORDER_VOID',id,{reason});return this.order(a,id);
  });
 }

  orders(a:Actor){
  if(a.role==='STAFF'){
   // Staff sees their own recent orders; full history is cursor-paginated.
   return this.store.all<any>(
    'SELECT * FROM orders WHERE created_by=? ORDER BY created_at DESC,id DESC LIMIT 100',a.id
   ).map(r=>this.asOrder(r));
  }
  // Never silently hide an unpaid order when 200+ new sales happen.
  // Oldest actionable first; non-actionable recent context stays bounded.
  const actionable=this.store.all<any>(
   "SELECT * FROM orders WHERE status='COMMITTED' AND payment_status IN ('UNPAID','PARTIAL') ORDER BY created_at ASC,id ASC"
  );
  const recent=this.store.all<any>(
   "SELECT * FROM orders WHERE NOT (status='COMMITTED' AND payment_status IN ('UNPAID','PARTIAL')) ORDER BY created_at DESC,id DESC LIMIT 200"
  );
  return [...actionable,...recent].map(r=>this.asOrder(r));
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
  return this.idem('capture.cash:'+orderId,key,{orderId,body},()=>{
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
 reprint(a:Actor,id:string,body:any,key:unknown){
  return this.idem('receipt.reprint:'+id,key,{id,body},()=>{
   const r=this.store.row<any>('SELECT * FROM receipts WHERE id=?',id);if(!r)throw new StoreError(404,'NOT_FOUND','Không tìm thấy liên in');
   const reason=ensureText(body?.reason,250);if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Cần ghi lý do in lại');
   if(r.status==='WAITING_FOR_PRINTER')throw new StoreError(409,'RECEIPT_ALREADY_QUEUED','Liên này đang chờ máy in, không thể xếp hàng trùng');
   this.store.run("UPDATE receipts SET status='WAITING_FOR_PRINTER',attempts=attempts+1 WHERE id=?",id);
   audit(this.store,a.id,'RECEIPT_REPRINT',r.order_id,{copy_id:id,kind:r.kind,reason});
   return {id,kind:r.kind,status:'WAITING_FOR_PRINTER',attempts:r.attempts+1};
  });
 }
 movement(a:Actor,shiftId:string,body:any,key:unknown){
  return this.idem('shift.movement:'+shiftId,key,{shiftId,body},()=>{
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
 refundCash(a:Actor,orderId:string,body:any,key:unknown){
  return this.idem('refund.cash:'+orderId,key,{orderId,body},()=>{
   const order=this.store.row<any>('SELECT * FROM orders WHERE id=?',orderId);
   if(!order||order.status!=='COMMITTED'||order.payment_status!=='PAID')throw new StoreError(409,'NOT_REFUNDABLE','Đơn không ở trạng thái có thể hoàn');
   const p=this.store.row<any>("SELECT * FROM payments WHERE order_id=? AND method='CASH'",orderId);
   if(!p||p.amount_vnd!==order.total_vnd)throw new StoreError(409,'REFUND_METHOD_UNSUPPORTED','Chỉ hoàn tiền mặt của đơn đã thu tiền mặt. Hoàn ngân hàng cần xử lý nhà cung cấp.');
   const shift=this.store.row<any>("SELECT * FROM shifts WHERE id=? AND status='OPEN'",body?.shift_id);
   if(!shift||shift.cashier_id!==a.id)throw new StoreError(409,'INVALID_SHIFT','Thu ngân phải có ca đang mở');
   const balance=this.getShift(shift.id)!.expected_cash_vnd;
   if(balance<p.amount_vnd)throw new StoreError(409,'INSUFFICIENT_DRAWER','Quỹ không đủ tiền hoàn');
   const reason=ensureText(body?.reason,250);
   if(reason.length<3)throw new StoreError(400,'REASON_REQUIRED','Ghi lý do hoàn tiền');
   const id=randomUUID(),when=now();
   this.store.run('INSERT INTO cash_refunds(id,order_id,shift_id,amount_vnd,reason,created_at,actor_id) VALUES(?,?,?,?,?,?,?)',id,orderId,shift.id,p.amount_vnd,reason,when,a.id);
   this.store.run('INSERT INTO cash_movements(id,shift_id,order_id,kind,amount_vnd,created_at,reason,actor_id) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),shift.id,orderId,'REFUND',-p.amount_vnd,when,reason,a.id);
   this.store.run("UPDATE orders SET payment_status='REFUNDED',version=version+1 WHERE id=?",orderId);
   audit(this.store,a.id,'CASH_REFUND',orderId,{refund_id:id,amount_vnd:p.amount_vnd,reason});
   return {refund_id:id,order_id:orderId,amount_vnd:p.amount_vnd,payment_status:'REFUNDED'};
  });
 }

 closeShift(a:Actor,id:string,body:any,key:unknown){
  return this.idem('shift.close:'+id,key,{id,body},()=>{
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
 operationalStatus(a:Actor){
  if(a.role!=='CASHIER'&&a.role!=='OWNER')throw new StoreError(403,'FORBIDDEN','Chỉ thu ngân/chủ tiệm được xem trạng thái vận hành');
  const rows=this.store.all<{status:string;n:number}>("SELECT status,COUNT(*) n FROM receipts WHERE status IN ('UNKNOWN','WAITING_FOR_PRINTER') GROUP BY status");
  const statusCounts=Object.fromEntries(rows.map(r=>[r.status,r.n]));
  const unknown=this.store.all<{id:string;order_id:string;display_code:string;kind:string;attempts:number;created_at:string}>(
   "SELECT r.id,r.order_id,o.display_code,r.kind,r.attempts,r.created_at FROM receipts r JOIN orders o ON o.id=r.order_id WHERE r.status='UNKNOWN' ORDER BY r.created_at DESC,r.id DESC LIMIT 8"
  );
  const backlog=this.store.row<{n:number}>('SELECT COUNT(*) n FROM sync_outbox WHERE delivered_at IS NULL')?.n||0;
  const last=this.store.row<{at:string|null}>('SELECT MAX(delivered_at) at FROM sync_outbox WHERE delivered_at IS NOT NULL')?.at||null;
  return {
   checked_at:now(),
   printer:{driver_configured:Boolean(process.env.PRINTER_HOST),waiting_copies:statusCounts.WAITING_FOR_PRINTER||0,unknown_copies:statusCounts.UNKNOWN||0,unknown_receipts:unknown},
   cloud_sync:{configured:Boolean(process.env.CLOUD_SYNC_URL),pending_events:backlog,last_delivered_at:process.env.CLOUD_SYNC_URL?last:null}
  };
 }
 todayOrderCounts(){
  const window=salesWindow('day');
  const r=this.store.row<any>(`SELECT COUNT(*) total_orders,
    SUM(CASE WHEN status='VOIDED' THEN 1 ELSE 0 END) voided_orders,
    SUM(CASE WHEN status='COMMITTED' AND payment_status='PAID' THEN 1 ELSE 0 END) paid_orders,
    SUM(CASE WHEN payment_status='REFUNDED' THEN 1 ELSE 0 END) refunded_orders,
    SUM(CASE WHEN status='COMMITTED' AND payment_status NOT IN ('PAID','REFUNDED') THEN 1 ELSE 0 END) pending_orders
    FROM orders WHERE created_at>=? AND created_at<?`,window.start_utc,window.end_utc);
  return {total_orders:Number(r.total_orders||0),voided_orders:Number(r.voided_orders||0),
   paid_orders:Number(r.paid_orders||0),refunded_orders:Number(r.refunded_orders||0),
   pending_orders:Number(r.pending_orders||0)};
 }
 productSales(period:SalesPeriod,date?:string):ProductSalesReport{
  const window=salesWindow(period,date);
  const counts=this.store.row<any>(`SELECT COUNT(*) total_orders,
    SUM(CASE WHEN status='VOIDED' THEN 1 ELSE 0 END) voided_orders,
    SUM(CASE WHEN status='COMMITTED' AND payment_status='PAID' THEN 1 ELSE 0 END) paid_orders,
    SUM(CASE WHEN payment_status='REFUNDED' THEN 1 ELSE 0 END) refunded_orders,
    SUM(CASE WHEN status='COMMITTED' AND payment_status NOT IN ('PAID','REFUNDED') THEN 1 ELSE 0 END) pending_orders
    FROM orders WHERE created_at>=? AND created_at<?`,window.start_utc,window.end_utc);
  const products=this.store.all<any>(`SELECT
   json_extract(j.value,'$.product_id') product_id,
   COALESCE(p.name,MAX(json_extract(j.value,'$.name_snapshot')),'Món đã xóa') name,
   COALESCE(p.category,'Khác') category,
   SUM(CAST(json_extract(j.value,'$.qty') AS INTEGER)) units_sold,
   SUM(CAST(json_extract(j.value,'$.line_total_vnd') AS INTEGER)) gross_vnd
   FROM orders o JOIN json_each(o.lines_json) j
   LEFT JOIN products p ON p.id=json_extract(j.value,'$.product_id')
   WHERE o.created_at>=? AND o.created_at<? AND o.status='COMMITTED' AND o.payment_status='PAID'
   GROUP BY json_extract(j.value,'$.product_id'),p.name,p.category
   ORDER BY units_sold DESC,product_id`,window.start_utc,window.end_utc)
    .map(r=>({...r,units_sold:Number(r.units_sold),gross_vnd:Number(r.gross_vnd)}));
  const byCategory=new Map<string,{category:string;units_sold:number;gross_vnd:number}>();
  for(const p of products){const current=byCategory.get(p.category)||{category:p.category,units_sold:0,gross_vnd:0};
   current.units_sold+=p.units_sold;current.gross_vnd+=p.gross_vnd;byCategory.set(p.category,current)}
  return {...window,total_orders:Number(counts.total_orders||0),
   voided_orders:Number(counts.voided_orders||0),paid_orders:Number(counts.paid_orders||0),
   refunded_orders:Number(counts.refunded_orders||0),pending_orders:Number(counts.pending_orders||0),
   total_units_sold:products.reduce((n,p)=>n+p.units_sold,0),
   gross_vnd:products.reduce((n,p)=>n+p.gross_vnd,0),
   products,categories:[...byCategory.values()].sort((a,b)=>b.units_sold-a.units_sold||a.category.localeCompare(b.category)),
   sales_definition:'PAID_ONLY_BY_ORDER_CREATED_AT' as const};
 }
 summary(){
  const p=this.store.row<any>("SELECT COUNT(*) paid_orders,COALESCE(SUM(total_vnd),0) net_revenue_vnd FROM orders WHERE payment_status='PAID'");
  const cash=(this.store.row<any>("SELECT COALESCE(SUM(amount_vnd),0) val FROM payments WHERE method='CASH'")?.val||0)-(this.store.row<any>("SELECT COALESCE(SUM(amount_vnd),0) val FROM cash_refunds")?.val||0);
  const unpaid=this.store.row<any>("SELECT COUNT(*) n FROM orders WHERE status='COMMITTED' AND payment_status='UNPAID'")?.n||0;
  const bank=this.store.row<any>("SELECT COUNT(*) n FROM orders WHERE status='COMMITTED' AND payment_status='UNPAID' AND requested_method='BANK'")?.n||0;
  return {paid_orders:p.paid_orders,net_revenue_vnd:p.net_revenue_vnd,cash_vnd:cash,bank_vnd:this.store.row<any>("SELECT COALESCE(SUM(amount_vnd),0) total FROM payments WHERE method='BANK'")?.total||0,pending_orders:unpaid,bank_pending:bank,last_synced_at:process.env.CLOUD_SYNC_URL?(this.store.row<{at:string|null}>('SELECT MAX(delivered_at) at FROM sync_outbox WHERE delivered_at IS NOT NULL')?.at||null):null,shift:this.currentShift()};
 }
 bankIntent(a:Actor,id:string,key:unknown){
  return this.idem('bank.intent:'+id,key,{id},()=>{
   const account=process.env.BANK_ACCOUNT_NUMBER,bank=process.env.BANK_CODE,secret=process.env.BANK_BRIDGE_SECRET;
   if(!account||!bank||!secret||secret.length<32)throw new StoreError(503,'BANK_NOT_CONFIGURED','Chưa kết nối ngân hàng');
   const o=this.store.row<any>('SELECT * FROM orders WHERE id=?',id);
   if(!o)throw new StoreError(404,'NOT_FOUND','Không tìm thấy đơn');
   if(o.status!=='COMMITTED'||o.payment_status!=='UNPAID')throw new StoreError(409,'ALREADY_SETTLED','Đơn đã hoàn tất hoặc bị hủy');
   const old=this.store.row<any>('SELECT * FROM bank_intents WHERE order_id=?',id);
   if(old)return {status:old.status,reference:old.reference,amount_vnd:old.amount_vnd,bank_code:old.bank_code,account_number:old.account_number};
   const reference='BMC'+randomBytes(7).toString('hex').toUpperCase();
   this.store.run('INSERT INTO bank_intents(order_id,reference,account_number,bank_code,amount_vnd) VALUES(?,?,?,?,?)',id,reference,account,bank,o.total_vnd);
   audit(this.store,a.id,'BANK_INTENT',id,{reference});
   return {status:'PENDING',reference,amount_vnd:o.total_vnd,bank_code:bank,account_number:account};
  });
 }
 bankEvent(raw:string,stamp:string,signature:string){
  const secret=process.env.BANK_BRIDGE_SECRET;
  if(!secret||secret.length<32)throw new StoreError(503,'BANK_NOT_CONFIGURED','Bank bridge chưa cấu hình');
  if(!/^[0-9]{13}$/.test(stamp||'')||Math.abs(Date.now()-Number(stamp))>300000)throw new StoreError(401,'STALE_EVENT','Giao dịch quá thời hạn');
  const digest=createHmac('sha256',secret).update(stamp+'.'+raw).digest('hex');
  if(!/^[a-f0-9]{64}$/i.test(signature||'')||!timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(signature,'hex')))throw new StoreError(401,'INVALID_SIGNATURE','Chữ ký không hợp lệ');
  let e:any;try{e=JSON.parse(raw)}catch{throw new StoreError(400,'INVALID_BODY','Dữ liệu không hợp lệ')}
  if(typeof e.provider_tx_id!=='string'||e.provider_tx_id.length<8||e.provider_tx_id.length>150||typeof e.reference!=='string'||typeof e.account_number!=='string'||typeof e.bank_code!=='string'||e.direction!=='CREDIT')throw new StoreError(400,'INVALID_EVENT','Sự kiện giao dịch không hợp lệ');
  const amount=ensureMoney(e.amount_vnd,false);
  return this.store.transaction(()=>{
   const prior=this.store.row<any>('SELECT * FROM bank_events WHERE provider_tx_id=?',e.provider_tx_id);
   if(prior)return {state:prior.state,reason:prior.reason,duplicate:true};
   const intent=this.store.row<any>('SELECT * FROM bank_intents WHERE reference=?',e.reference);
   const order=intent?this.store.row<any>('SELECT * FROM orders WHERE id=?',intent.order_id):null;
   let reason='';
   if(!intent||!order)reason='UNMATCHED_REFERENCE';
   else if(e.bank_code!==intent.bank_code||e.account_number!==intent.account_number||e.bank_code!==process.env.BANK_CODE||e.account_number!==process.env.BANK_ACCOUNT_NUMBER)reason='WRONG_DESTINATION';
   else if(amount!==intent.amount_vnd)reason='AMOUNT_MISMATCH';
   else if(order.status!=='COMMITTED'||order.payment_status!=='UNPAID'||intent.status!=='PENDING')reason='ALREADY_SETTLED';
   const state=reason?'EXCEPTION':'CONFIRMED';
   this.store.run('INSERT INTO bank_events(provider_tx_id,order_id,reference,amount_vnd,state,reason,received_at) VALUES(?,?,?,?,?,?,?)',e.provider_tx_id,intent?.order_id||null,e.reference,amount,state,reason,new Date().toISOString());
   if(!reason){
    this.store.run('INSERT INTO payments(id,order_id,method,amount_vnd,created_at,actor_id) VALUES(?,?,?,?,?,?)',randomUUID(),order.id,'BANK',amount,new Date().toISOString(),'BANK_BRIDGE');
    this.store.run("UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=?",order.id);
    this.store.run("UPDATE bank_intents SET status='CONFIRMED' WHERE order_id=?",order.id);
    const batch=randomUUID();for(const kind of ['CUSTOMER','STORE'])this.store.run("INSERT INTO receipts(id,batch_id,order_id,kind,status,created_at) VALUES(?,?,?,?,?,?)",randomUUID(),batch,order.id,kind,'WAITING_FOR_PRINTER',new Date().toISOString());
    audit(this.store,'BANK_BRIDGE','BANK_SETTLED',order.id,{provider_tx_id:e.provider_tx_id,amount_vnd:amount});
   } else audit(this.store,'BANK_BRIDGE','BANK_EXCEPTION',intent?.order_id||'UNKNOWN',{provider_tx_id:e.provider_tx_id,reason});
   return {state,reason:reason||undefined,duplicate:false};
  });
 }
 bankExceptions(){return this.store.all<any>("SELECT * FROM bank_events WHERE state='EXCEPTION' ORDER BY received_at DESC LIMIT 100")}

}
