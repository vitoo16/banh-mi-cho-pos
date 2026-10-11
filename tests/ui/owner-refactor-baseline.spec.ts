import {test,expect,type Page} from '@playwright/test';

const localUrl='http://127.0.0.1:5174/';
const remoteUrl='http://127.0.0.1:5175/';
type Product={id:string;name:string;category:string;price_vnd:number;is_active:boolean};
type Employee={id:string;name:string;role:'OWNER'|'STAFF'|'CASHIER';active:boolean};
type Device={id:string;user_id:string;label:string;created_at:string;last_seen_at:string|null;revoked_at:string|null};
const product=():Product=>({id:'bm-thit',name:'Bánh mì thịt nguội',category:'Bánh mì',price_vnd:35000,is_active:true});
const sampleSummary={
 paid_orders:7,net_revenue_vnd:245000,cash_vnd:175000,bank_vnd:70000,
 pending_orders:2,bank_pending:1,last_synced_at:'2026-10-11T06:00:00.000Z',
 shift:{id:'shift-001',cashier_id:'cashier',opening_float_vnd:200000,status:'OPEN',opened_at:'2026-10-11T01:00:00.000Z',expected_cash_vnd:375000},
 unallocated_bank_vnd:0,bank_conflict_orders:0,
};
const order=(id:string,total=35000)=>({
 order_id:id,display_code:id,created_at:'2026-10-11T03:00:00.000Z',created_by:'staff',
 status:'COMMITTED',payment_status:'UNPAID',requested_payment_method:'BANK',
 total_vnd:total,version:1,note:'',items:[{product_id:'bm-thit',name_snapshot:'Bánh mì thịt nguội',qty:1,unit_price_vnd:total,line_total_vnd:total,note:''}],
});
const report=(period:string)=>({
 period,date:'2026-10-11',start_utc:'2026-10-10T17:00:00.000Z',end_utc:'2026-10-11T17:00:00.000Z',
 label:'2026-10-11 → 2026-10-11',total_orders:4,voided_orders:1,paid_orders:2,
 refunded_orders:0,pending_orders:1,total_units_sold:5,gross_vnd:175000,
 sales_definition:'PAID_ONLY_BY_ORDER_CREATED_AT',
 products:[{product_id:'bm-thit',name:'Bánh mì thịt nguội',category:'Bánh mì',units_sold:5,gross_vnd:175000}],
 categories:[{category:'Bánh mì',units_sold:5,gross_vnd:175000}],
});
type Call={path:string;method:string;key:string;body:unknown};
async function fixture(page:Page,{remote=false,failLogin=false}={}){
 const calls:Call[]=[];
 const products:Product[]=[product()];
 const employees:Employee[]=[{id:'cashier01',name:'Thu ngân 01',role:'CASHIER',active:true}];
 const devices:Device[]=[{id:'device-1',user_id:'staff',label:'Máy nhân viên 1',created_at:'2026-10-11T02:00:00.000Z',last_seen_at:null,revoked_at:null}];
 const commands:Array<Record<string,unknown>>=[];
 let today=4;let revenue=sampleSummary.net_revenue_vnd;
 await page.route('**/v1/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname,method=route.request().method();
  let data:unknown={},status=200;
  const json=route.request().postData();
  const body:unknown=json?JSON.parse(json):null;
  calls.push({path,method,key:route.request().headers()['idempotency-key']||'',body});
  if(path==='/v1/auth/login'&&method==='POST'){
   if(failLogin){status=401;data={code:'AUTH_FAILED',message:'Sai mã đăng nhập'};}
   else data={token:'owner-test-session',user:{id:'owner',role:'OWNER',name:'Chủ tiệm'}};
  }else if(path==='/v1/auth/logout'&&method==='POST')data={ok:true};
  else if(path==='/v1/owner/dashboard')data={...sampleSummary,net_revenue_vnd:revenue,
   ...(remote?{unallocated_bank_vnd:45000,bank_conflict_orders:1}:{})};
  else if(path==='/v1/owner/analytics/today')
   data={total_orders:today,paid_orders:2,pending_orders:1,voided_orders:1,refunded_orders:0};
  else if(path==='/v1/owner/analytics/products')data=report(u.searchParams.get('period')||'day');
  else if(path==='/v1/owner/products'&&method==='GET')data={version:3,enabled_payment_methods:['CASH','BANK'],products:products.map(p=>({...p}))};
  else if(path==='/v1/owner/products'&&method==='POST'){
   if(!route.request().headers()['idempotency-key']){status=400;data={code:'KEY_REQUIRED',message:'Missing idempotency key'};}
   else if(remote){
    const p=body as {name:string;category:string;price_vnd:number;is_active:boolean};
    const cmd={id:'remote-command-'+(commands.length+1),product_id:'new-remote-1',operation:'CREATE',category:p.category,name:p.name,
     price_vnd:p.price_vnd,expected_price_vnd:0,is_active:p.is_active,status:'PENDING',
     result_code:null,created_at:'2026-10-11T02:00:00.000Z',completed_at:null};
    commands.unshift(cmd);data=cmd;
   }else{
    const p=body as Omit<Product,'id'>;const created={...p,id:'created-001'};products.push(created);data=created;
   }
  }else if(path==='/v1/owner/products/bm-thit'&&method==='PATCH'){
   const p=body as {name:string;price_vnd:number;is_active:boolean;expected_price_vnd?:number};
   if(remote){
    const cmd={id:'remote-update-1',product_id:'bm-thit',operation:'UPDATE',category:'Bánh mì',name:p.name,
     price_vnd:p.price_vnd,expected_price_vnd:p.expected_price_vnd,is_active:p.is_active,status:'PENDING',
     result_code:null,created_at:'2026-10-11T02:00:00.000Z',completed_at:null};
    commands.unshift(cmd);data=cmd;
   }else{
    products[0]={...products[0],name:p.name,price_vnd:p.price_vnd,is_active:p.is_active};data=products[0];
   }
  }else if(path==='/v1/owner/product-commands'&&remote)data=commands.map(c=>({...c}));
  else if(path==='/v1/owner/employees'&&method==='GET')data=remote?[]:employees.map(e=>({...e}));
  else if(path==='/v1/owner/employees'&&method==='POST'&&!remote){
   const x=body as Employee & {pin:string};const employee={id:x.id,name:x.name,role:x.role,active:true};
   employees.push(employee);data=employee;
  }else if(path.startsWith('/v1/owner/employees/')&&method==='PATCH'&&!remote){
   const emp=employees.find(e=>e.id===decodeURIComponent(path.split('/').pop()||''));if(!emp){status=404;data={code:'NOT_FOUND'};}
   else{emp.active=Boolean((body as {active:boolean}).active);data={...emp};}
  }else if(path==='/v1/owner/devices'&&!remote)data=devices.map(d=>({...d}));
  else if(path==='/v1/owner/device-pairings'&&method==='POST'&&!remote)
   data={pairing_code:'ABCDEF0123456789',label:(body as {label:string}).label,expires_at:Date.now()+180000};
  else if(path==='/v1/owner/devices/device-1/revoke'&&method==='POST'&&!remote){
   devices[0].revoked_at=new Date('2026-10-11T05:00:00.000Z').toISOString();data={ok:true,revoked:true};
  }else if(path==='/v1/owner/bank-exceptions')data=[{
   provider_tx_id:'provider-1',reference:'BANK-UNKNOWN-01',amount_vnd:50000,reason:'WRONG_AMOUNT',received_at:'2026-10-11T05:00:00.000Z',
  }];
  else if(path==='/v1/orders/history'){
   data=u.searchParams.get('cursor')?
    {items:[order('B00002'),order('B00003')],next_cursor:null}:
    {items:[order('B00001'),order('B00002')],next_cursor:'cursor-2'};
  }else{status=404;data={code:'NOT_MOCKED',message:'Unexpected '+method+' '+path};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {calls,products,employees,devices,commands,setToday:(value:number)=>{today=value},
  setRevenue:(value:number)=>{revenue=value}};
}
async function login(page:Page,remote=false){
 const jsErrors:string[]=[];
 page.on('pageerror',error=>jsErrors.push(error.message));
 await page.goto(remote?remoteUrl:localUrl);
 const label=remote?'Mật khẩu quản trị từ xa':'Mã PIN chủ tiệm';
 await expect(page.getByLabel(label)).toBeVisible();
 await page.getByLabel(label).fill(remote?'cloud-password-mock-long':'owner-pin-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toBeVisible();
 expect(jsErrors,'Owner browser runtime should not crash').toEqual([]);
}
async function tab(page:Page,name:string){
 // Desktop sidebar or mobile bottom navigation has exactly one visible copy.
 await page.getByRole('button',{name,exact:true}).click();
}
test('OWNER G1: failed login must not expose protected dashboard or write a session token',async({page})=>{
 const f=await fixture(page,{failLogin:true});
 await page.goto(localUrl);
 await page.getByLabel('Mã PIN chủ tiệm').fill('bad-pin-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByRole('alert')).toContainText('Sai mã đăng nhập');
 await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toHaveCount(0);
 const token=await page.evaluate(()=>sessionStorage.getItem('bmc_owner_token'));
 expect(token).toBeNull();
 expect(f.calls.filter(x=>x.method==='POST'&&x.path==='/v1/auth/login')).toHaveLength(1);
});
test('OWNER G2: order pagination preserves cursor, deduplicates overlap and searches locally',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Đơn hàng');
 await expect(page.getByText('#B00001')).toBeVisible();
 await expect(page.getByText('#B00002')).toHaveCount(1);
 await page.getByRole('button',{name:'Xem thêm đơn cũ'}).click();
 await expect(page.getByText('#B00003')).toBeVisible();
 await expect(page.getByText('#B00002')).toHaveCount(1);
 const history=f.calls.filter(x=>x.path==='/v1/orders/history');
 expect(history).toHaveLength(2);
 await page.getByLabel('Tìm đơn').fill('B00003');
 await expect(page.getByText('#B00003')).toBeVisible();
 await expect(page.getByText('#B00001')).toHaveCount(0);
 await expect(page.getByText('#B00002')).toHaveCount(0);
});
test('OWNER G3: local product UPDATE preserves exact integer VND and one key',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Sản phẩm');
 await page.getByRole('button',{name:'Sửa',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await dialog.getByLabel('Tên món').fill('Bánh mì thịt mới');
 await dialog.getByLabel('Giá bán (VNĐ)').fill('42000');
 await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByText('Bánh mì thịt mới')).toBeVisible();
 const updates=f.calls.filter(c=>c.path==='/v1/owner/products/bm-thit'&&c.method==='PATCH');
 expect(updates).toHaveLength(1);
 expect(updates[0].key.length).toBeGreaterThanOrEqual(8);
 expect(updates[0].body).toMatchObject({name:'Bánh mì thịt mới',price_vnd:42000,is_active:true});
 expect(f.products[0].price_vnd).toBe(42000);
});
test('OWNER G5: local Employee creation and deactivation carry stable, distinct mutation keys',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Nhân viên');
 await page.getByPlaceholder('nv01').fill('staff02');
 await page.getByPlaceholder('Nguyễn A').fill('Nhân viên kiểm thử');
 await page.getByRole('combobox').selectOption('STAFF');
 await page.locator('input[type="password"]').fill('staff-pin-test');
 await page.getByRole('button',{name:'Tạo tài khoản'}).click();
 await expect(page.getByText('Nhân viên kiểm thử')).toBeVisible();
 const created=f.calls.filter(x=>x.path==='/v1/owner/employees'&&x.method==='POST');
 expect(created).toHaveLength(1);
 expect(created[0].body).toMatchObject({id:'staff02',role:'STAFF'});
 expect(created[0].key.length).toBeGreaterThanOrEqual(8);
 // Deactivate the newly created row instead of mutating the initial cashier.
 const row=page.locator('.record').filter({hasText:'Nhân viên kiểm thử'});
 page.once('dialog',dialog=>void dialog.accept());
 await row.getByRole('button',{name:'Khóa'}).click();
 await expect(row).toContainText('Đã khóa');
 const mutation=f.calls.filter(x=>x.path==='/v1/owner/employees/staff02'&&x.method==='PATCH');
 expect(mutation).toHaveLength(1);
 expect(mutation[0].body).toMatchObject({active:false});
 expect(mutation[0].key).not.toBe(created[0].key);
 expect(f.employees.find(x=>x.id==='staff02')?.active).toBe(false);
});
test('OWNER G7: finance shows cash ledger and unmatched bank exception, never a payment confirmation action',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Tài chính');
 await expect(page.getByText('200.000đ')).toBeVisible();
 await expect(page.getByText('375.000đ')).toBeVisible();
 await expect(page.getByText('BANK-UNKNOWN-01')).toBeVisible();
 await expect(page.getByText('50.000đ')).toBeVisible();
 await expect(page.getByText('Chờ xác minh: 1 đơn yêu cầu chuyển khoản.')).toBeVisible();
 expect(f.calls.filter(x=>x.path==='/v1/owner/bank-exceptions').length).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:/Xác nhận đã thanh toán/})).toHaveCount(0);
});
test('OWNER G9: dashboard and production report use independent queries, not full order history',async({page})=>{
 const f=await fixture(page);await login(page);
 await expect(page.getByLabel('Tổng số đơn hôm nay')).toHaveText('4');
 const allPaths=()=>f.calls.map(x=>x.path);
 expect(allPaths()).not.toContain('/v1/orders/history');
 await page.getByRole('button',{name:'Xem số bánh bán theo loại'}).click();
 await expect(page.getByRole('region',{name:'Số lượng bán theo từng món'}).getByText('5 bánh')).toBeVisible();
 const paths=f.calls.filter(x=>x.path==='/v1/owner/analytics/products');
 expect(paths).toHaveLength(1);
 await page.getByRole('button',{name:'Quý',exact:true}).click();
 await expect.poll(()=>f.calls.filter(x=>x.path==='/v1/owner/analytics/products').length).toBe(2);
 expect(f.calls.filter(x=>x.path==='/v1/orders/history')).toHaveLength(0);
 await tab(page,'Tổng quan');
 f.setToday(9);f.setRevenue(310000);
 await page.getByRole('button',{name:'Tải lại'}).click();
 await expect(page.getByLabel('Tổng số đơn hôm nay')).toHaveText('9');
 await expect(page.getByText('310.000đ')).toBeVisible();
 expect(f.calls.filter(x=>x.path==='/v1/orders/history')).toHaveLength(0);
});
test('OWNER G8: 320px mobile owner six-tab navigation and finance never overflow',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await fixture(page);await login(page);await tab(page,'Tài chính');
 await expect(page.getByText('Sổ quỹ hiện tại')).toBeVisible();
 const dims=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 expect(dims.doc).toBeLessThanOrEqual(dims.width+1);
 expect(dims.body).toBeLessThanOrEqual(dims.width+1);
});
test('CLOUD G6: remote catalog UPDATE is queued with expected old price, never applied optimistically',async({page})=>{
 const f=await fixture(page,{remote:true});await login(page,true);await tab(page,'Sản phẩm');
 await expect(page.getByText('Bánh mì thịt nguội')).toBeVisible();
 await page.getByRole('button',{name:'Đề xuất sửa giá'}).click();
 const dlg=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await dlg.getByLabel('Giá bán (VNĐ)').fill('39000');
 await dlg.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dlg).toHaveCount(0);
 await expect(page.locator('.command-row .command-pending')).toHaveText('Đang chờ POS');
 expect(f.products[0].price_vnd).toBe(35000);
 const request=f.calls.filter(x=>x.path==='/v1/owner/products/bm-thit'&&x.method==='PATCH');
 expect(request).toHaveLength(1);
 expect(request[0].key.length).toBeGreaterThanOrEqual(8);
 expect(request[0].body).toMatchObject({price_vnd:39000,expected_price_vnd:35000});
});
test('CLOUD G6: remote Owner staff page is read-only; local employee and device endpoints stay unused',async({page})=>{
 const f=await fixture(page,{remote:true});await login(page,true);await tab(page,'Nhân viên');
 await expect(page.getByText('Quản lý nhân viên chỉ được thao tác từ POS nội bộ')).toBeVisible();
 await expect(page.getByRole('button',{name:'Tạo tài khoản'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Tạo mã ghép'})).toHaveCount(0);
 expect(f.calls.filter(x=>x.path.includes('/device-')||x.path.endsWith('/devices')).length).toBe(0);
 expect(f.calls.filter(x=>x.path==='/v1/owner/employees'&&x.method!=='GET').length).toBe(0);
});
test('CLOUD G7: bank+cash conflict is an exception, not extra sales',async({page})=>{
 await fixture(page,{remote:true});await login(page,true);await tab(page,'Tài chính');
 await expect(page.getByText('Phát hiện thu cả tiền mặt và chuyển khoản')).toBeVisible();
 await expect(page.getByText('45.000đ')).toBeVisible();
 await expect(page.getByText('Khoản này được loại khỏi doanh thu chuyển khoản để không tính hai lần.',{exact:false})).toBeVisible();
});

test('OWNER G5: local device pairing issues one-time code and revoked device stays disabled',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Nhân viên');
 await page.getByLabel('Tên thiết bị').fill('Máy dự phòng nhân viên');
 await page.getByRole('button',{name:'Tạo mã ghép'}).click();
 await expect(page.getByText('ABCDEF0123456789')).toBeVisible();
 const pair=f.calls.filter(x=>x.path==='/v1/owner/device-pairings'&&x.method==='POST');
 expect(pair).toHaveLength(1);
 expect(pair[0].key.length).toBeGreaterThanOrEqual(8);
 expect(pair[0].body).toMatchObject({label:'Máy dự phòng nhân viên'});
 const row=page.locator('.record').filter({hasText:'Máy nhân viên 1'});
 page.on('dialog',dialog=>{
  if(dialog.type()==='confirm')void dialog.accept();
  else if(dialog.type()==='prompt')void dialog.accept('Thiết bị đã thất lạc');
  else void dialog.dismiss();
 });
 await row.getByRole('button',{name:'Thu hồi'}).click();
 await expect(row).toContainText('Đã thu hồi');
 const revoke=f.calls.filter(x=>x.path==='/v1/owner/devices/device-1/revoke'&&x.method==='POST');
 expect(revoke).toHaveLength(1);
 expect(revoke[0].body).toMatchObject({reason:'Thiết bị đã thất lạc'});
 expect(revoke[0].key).not.toBe(pair[0].key);
});
test('OWNER G1: sign out drops session and does not display cached protected KPI',async({page})=>{
 await fixture(page);await login(page);
 await page.getByRole('button',{name:'Đăng xuất'}).click();
 await expect(page.getByLabel('Mã PIN chủ tiệm')).toBeVisible();
 await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toHaveCount(0);
 const token=await page.evaluate(()=>sessionStorage.getItem('bmc_owner_token'));
 expect(token).toBeNull();
});
test('CLOUD G6: remote CREATE stays in pending command log, never becomes effective product immediately',async({page})=>{
 const f=await fixture(page,{remote:true});await login(page,true);await tab(page,'Sản phẩm');
 await page.getByRole('button',{name:/Thêm món/}).click();
 const dlg=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await dlg.getByLabel('Tên món').fill('Bánh mì mùa mới');
 await dlg.getByLabel('Nhóm món').fill('Bánh mì');
 await dlg.getByLabel('Giá bán (VNĐ)').fill('28000');
 await dlg.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dlg).toHaveCount(0);
 await expect(page.getByText('Thêm món: Bánh mì mùa mới')).toBeVisible();
 await expect(page.locator('.command-row .command-pending')).toHaveText('Đang chờ POS');
 expect(f.products).toHaveLength(1,'Cloud command must not mutate local mirror catalog until Hub ACK');
 const pending=f.calls.filter(x=>x.path==='/v1/owner/products'&&x.method==='POST');
 expect(pending).toHaveLength(1);
 expect(pending[0].key.length).toBeGreaterThanOrEqual(8);
 expect(pending[0].body).toMatchObject({name:'Bánh mì mùa mới',price_vnd:28000,is_active:true});
 expect(f.commands[0].status).toBe('PENDING');
});

test('OR-01: login → logout → login again uses fresh owner query data, not old cache',async({page})=>{
 const f=await fixture(page);
 await login(page);
 await expect(page.getByText('245.000đ')).toBeVisible();
 const first=f.calls.filter(x=>x.path==='/v1/owner/dashboard').length;
 await page.getByRole('button',{name:'Đăng xuất'}).click();
 await expect(page.getByLabel('Mã PIN chủ tiệm')).toBeVisible();
 f.setRevenue(390000);
 await page.getByLabel('Mã PIN chủ tiệm').fill('owner-pin-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('390.000đ')).toBeVisible();
 expect(f.calls.filter(x=>x.path==='/v1/owner/dashboard').length).toBeGreaterThan(first);
});
test('OR-01: Cloud logout revokes session once and wipes Owner protected view',async({page})=>{
 const f=await fixture(page,{remote:true});await login(page,true);
 await page.getByRole('button',{name:'Đăng xuất'}).click();
 await expect(page.getByLabel('Mật khẩu quản trị từ xa')).toBeVisible();
 await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toHaveCount(0);
 await expect.poll(()=>f.calls.filter(x=>x.path==='/v1/auth/logout'&&x.method==='POST').length).toBe(1);
 expect(await page.evaluate(()=>sessionStorage.getItem('bmc_owner_token'))).toBeNull();
});

test('OR-02: navigating the Owner dashboard does not fetch order history until Orders is opened',async({page})=>{
 const f=await fixture(page);await login(page);
 const requests=()=>f.calls.filter(x=>x.path==='/v1/orders/history');
 expect(requests()).toHaveLength(0);
 await tab(page,'Sản lượng');
 await expect(page.getByRole('heading',{name:'Thống kê số bánh đã bán'})).toBeVisible();
 expect(requests()).toHaveLength(0);
 await tab(page,'Đơn hàng');
 await expect(page.getByText('#B00001')).toBeVisible();
 expect(requests()).toHaveLength(1);
 await page.getByLabel('Tìm đơn').fill('B00002');
 await expect(page.getByText('#B00002')).toBeVisible();
 expect(requests()).toHaveLength(1,'Typing in client filter must not hit server');
});


test('OR-03: after lost catalog ACK and reload, retry uses exact persisted key and original JSON',async({page})=>{
 const f=await fixture(page);
 const pending={
  key:'existing-idempotency-key-ack-loss-001',
  draft:{remote:false,target:'bm-thit',name:'Bánh mì sửa sau mất ACK',category:'Bánh mì',price_vnd:42000,is_active:true},
  payload:{name:'Bánh mì sửa sau mất ACK',price_vnd:42000,is_active:true},
 };
 await page.addInitScript(value=>sessionStorage.setItem('bmc_owner_pending_catalog_v1',JSON.stringify(value)),pending);
 await login(page);
 await expect(page.getByRole('dialog',{name:'Chỉnh sản phẩm'})).toBeVisible();
 const dlg=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await expect(dlg.getByLabel('Giá bán (VNĐ)')).toHaveValue('42000');
 await dlg.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dlg).toHaveCount(0);
 const changes=f.calls.filter(x=>x.path==='/v1/owner/products/bm-thit'&&x.method==='PATCH');
 expect(changes).toHaveLength(1);
 expect(changes[0].key).toBe(pending.key);
 expect(changes[0].body).toEqual(pending.payload);
 expect(await page.evaluate(()=>sessionStorage.getItem('bmc_owner_pending_catalog_v1'))).toBeNull();
});


test('OR-03b: extracted local catalog list and product form create one exact integer-VND product',async({page})=>{
 const f=await fixture(page);
 await login(page);
 await tab(page,'Sản phẩm');
 await page.getByRole('button',{name:'+ Thêm món'}).click();
 const dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await expect(dialog).toBeVisible();
 await dialog.getByLabel('Tên món').fill('Bánh mì gà nướng');
 await dialog.getByLabel('Nhóm món').fill('Bánh mì');
 await dialog.getByLabel('Giá bán (VNĐ)').fill('31000');
 await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByText('Bánh mì gà nướng')).toBeVisible();
 await expect(page.getByText('31.000đ')).toBeVisible();
 const creates=f.calls.filter(x=>x.path==='/v1/owner/products'&&x.method==='POST');
 expect(creates).toHaveLength(1);
 expect(creates[0].key.length).toBeGreaterThanOrEqual(8);
 expect(creates[0].body).toEqual({name:'Bánh mì gà nướng',category:'Bánh mì',price_vnd:31000,is_active:true});
 expect(f.products.filter(x=>x.name==='Bánh mì gà nướng')).toHaveLength(1);
});


test('OR-03c: local Catalog GET and manual refresh do not request finance, staff or device data',async({page})=>{
 const f=await fixture(page);await login(page);await tab(page,'Sản phẩm');
 await expect(page.getByText('Bánh mì thịt nguội')).toBeVisible();
 const count=(path:string)=>f.calls.filter(x=>x.path===path&&x.method==='GET').length;
 expect(count('/v1/owner/products')).toBe(1);
 expect(count('/v1/owner/employees')).toBe(0);
 expect(count('/v1/owner/devices')).toBe(0);
 expect(count('/v1/owner/bank-exceptions')).toBe(0);
 await page.getByRole('button',{name:'Tải lại'}).click();
 await expect.poll(()=>count('/v1/owner/products')).toBe(2);
 expect(count('/v1/owner/employees')).toBe(0);
 expect(count('/v1/owner/devices')).toBe(0);
 expect(count('/v1/owner/bank-exceptions')).toBe(0);
});
test('OR-03c: Cloud menu and command status use only their isolated reads, queued edit does not reload finance',async({page})=>{
 const f=await fixture(page,{remote:true});await login(page,true);await tab(page,'Sản phẩm');
 await expect(page.getByText('Bánh mì thịt nguội')).toBeVisible();
 await expect(page.getByText('Chưa có yêu cầu chỉnh giá từ xa.')).toBeVisible();
 const reads=(path:string)=>f.calls.filter(x=>x.path===path&&x.method==='GET').length;
 expect(reads('/v1/owner/products')).toBe(1);
 expect(reads('/v1/owner/product-commands')).toBe(1);
 expect(reads('/v1/owner/employees')).toBe(0);
 expect(reads('/v1/owner/bank-exceptions')).toBe(0);
 await page.getByRole('button',{name:'Đề xuất sửa giá'}).click();
 const dlg=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await dlg.getByLabel('Giá bán (VNĐ)').fill('41000');
 await dlg.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(page.locator('.command-row .command-pending')).toHaveText('Đang chờ POS');
 expect(f.products[0].price_vnd).toBe(35000);
 expect(reads('/v1/owner/employees')).toBe(0);
 expect(reads('/v1/owner/bank-exceptions')).toBe(0);
 const patches=f.calls.filter(x=>x.path==='/v1/owner/products/bm-thit'&&x.method==='PATCH');
 expect(patches).toHaveLength(1);
 expect(patches[0].body).toMatchObject({price_vnd:41000,expected_price_vnd:35000});
});
