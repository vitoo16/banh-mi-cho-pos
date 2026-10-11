import {test,expect,type Page} from '@playwright/test';

const summary={
 paid_orders:23,net_revenue_vnd:1234567,cash_vnd:1100000,bank_vnd:134567,
 pending_orders:4,bank_pending:2,last_synced_at:null,shift:null,
};
async function mockOwner(page:Page){
 const products:Array<{id:string;name:string;category:string;price_vnd:number;is_active:boolean}>=[];
 const created:unknown[]=[];
 let revenue=summary.net_revenue_vnd, todayCount=753;
 await page.route('**/v1/**',async route=>{
  const {pathname}=new URL(route.request().url()),method=route.request().method();
  let body:unknown={},status=200;
  if(pathname==='/v1/auth/login')body={token:'test-owner',user:{id:'owner',role:'OWNER',name:'Chủ tiệm'}};
  else if(pathname==='/v1/owner/dashboard')body={...summary,net_revenue_vnd:revenue};
  else if(pathname==='/v1/owner/analytics/today')body={total_orders:todayCount,paid_orders:621,voided_orders:12,refunded_orders:5,pending_orders:115};
  else if(pathname==='/v1/owner/analytics/products')body={
   period:new URL(route.request().url()).searchParams.get('period'),date:'2026-10-11',
   start_utc:'2026-10-10T17:00:00.000Z',end_utc:'2026-10-11T17:00:00.000Z',
   label:'2026-10-11 → 2026-10-11',total_orders:753,paid_orders:621,voided_orders:12,
   refunded_orders:5,pending_orders:115,total_units_sold:1510,gross_vnd:28000000,
   products:[{product_id:'bm-thit',name:'Bánh mì thịt nguội',category:'Bánh mì',units_sold:1260,gross_vnd:21000000},
    {product_id:'banh-bao',name:'Bánh bao',category:'Bánh bao',units_sold:250,gross_vnd:7000000}],
   categories:[{category:'Bánh mì',units_sold:1260,gross_vnd:21000000},
    {category:'Bánh bao',units_sold:250,gross_vnd:7000000}],
   sales_definition:'PAID_ONLY_BY_ORDER_CREATED_AT'};

  else if(pathname==='/v1/owner/products'&&method==='GET')body={version:1,enabled_payment_methods:['CASH','BANK'],products};
  else if(pathname==='/v1/owner/products'&&method==='POST'){
   const input=JSON.parse(route.request().postData()||'{}');
   created.push(input);
   const item={id:'new-item-001',...input};
   products.push(item);
   body=item;
  }
  else if(pathname==='/v1/owner/employees')body=[];
  else if(pathname==='/v1/owner/devices')body=[];
  else if(pathname==='/v1/owner/bank-exceptions')body=[];
  else if(pathname==='/v1/orders/history')body={items:[],next_cursor:null};
  else{status=404;body={code:'NOT_MOCKED',message:'Unexpected API request '+pathname};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 return {created,setRevenue:(amount:number)=>{revenue=amount},setToday:(count:number)=>{todayCount=count}};
}
async function assertNoOverflow(page:Page,width:number){
 const size=await page.evaluate(()=>({
  viewport:window.innerWidth,
  doc:document.documentElement.scrollWidth,
  body:document.body.scrollWidth,
 }));
 expect(size.viewport).toBe(width);
 expect(size.doc,'Owner viewport overflow '+JSON.stringify(size)).toBeLessThanOrEqual(width+1);
 expect(size.body,'Owner body overflow '+JSON.stringify(size)).toBeLessThanOrEqual(width+1);
}
async function startOwner(page:Page){
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push('pageerror: '+(e.stack||e.message)));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
 const response=await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(250);
 if(errors.length||!(await page.getByLabel('Mã PIN chủ tiệm').count()))
  throw new Error('Owner boot failed: HTTP '+response?.status()+' errors='+JSON.stringify(errors)+' body='+JSON.stringify((await page.locator('body').innerText()).slice(0,600)));
 await page.getByLabel('Mã PIN chủ tiệm').fill('owner-pin-for-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toBeVisible();
}
for(const width of [320,390,768,1366]){
 test('Owner dashboard metrics fit '+width+'px viewport',async({page})=>{
  await page.setViewportSize({width,height:width===320?568:width===390?844:768});
  await mockOwner(page);
  await startOwner(page);
  await expect(page.getByText('1.234.567đ')).toBeVisible();
  await expect(page.getByText('Chuyển khoản xác nhận')).toBeVisible();
  await assertNoOverflow(page,width);
 });
}
for(const width of [320,1366]){
 test('Owner can CREATE a menu item via POST at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:width===320?568:768});
  const {created}=await mockOwner(page);
  await startOwner(page);
  await page.getByRole('button',{name:'Sản phẩm'}).click();
  await page.getByRole('button',{name:/Thêm món/}).click();
  const dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên món').fill('Bánh mì QA mới');
  await dialog.getByLabel('Nhóm món').fill('Bánh mì');
  await dialog.getByLabel('Giá bán (VNĐ)').fill('45000');
  await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Bánh mì QA mới')).toBeVisible();
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({name:'Bánh mì QA mới',price_vnd:45000,category:'Bánh mì',is_active:true});

  await assertNoOverflow(page,width);
 });
}

test('Owner local create can intentionally keep a new item hidden',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 const {created}=await mockOwner(page);
 await startOwner(page);
 await page.getByRole('button',{name:'Sản phẩm'}).click();
 await page.getByRole('button',{name:/Thêm món/}).click();
 const modal=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await modal.getByLabel('Tên món').fill('Món chưa mở bán');
 await modal.getByLabel('Nhóm món').fill('Bánh mì');
 await modal.getByLabel('Giá bán (VNĐ)').fill('35000');
 await modal.getByRole('checkbox',{name:'Đang bán'}).uncheck();
 await modal.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(modal).toHaveCount(0);
 expect(created).toHaveLength(1);
 expect(created[0]).toMatchObject({name:'Món chưa mở bán',is_active:false,price_vnd:35000});
 await assertNoOverflow(page,320);
});

test('Owner preserves idempotency key when Cloud/POS committed but response was lost across page reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const {created}=await mockOwner(page);
 const keys:string[]=[];
 let attempts=0;
 await page.route('**/v1/owner/products',async route=>{
  if(route.request().method()!=='POST'){await route.fallback();return}
  attempts++;
  keys.push(route.request().headers()['idempotency-key']||'');
  const input=JSON.parse(route.request().postData()||'{}');
  if(attempts===1){
   created.push(input); // Simulate server COMMIT followed by a lost ACK.
   await route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({code:'SERVER_UNAVAILABLE',message:'ACK disappeared'})});
  }else{
   await route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({id:'bmc-new-once',...input})});
  }
 });
 await startOwner(page);
 await page.getByRole('button',{name:'Sản phẩm'}).click();
 await page.getByRole('button',{name:/Thêm món/}).click();
 let dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await dialog.getByLabel('Tên món').fill('Chưa chắc đã lưu');
 await dialog.getByLabel('Nhóm món').fill('Bánh mì');
 await dialog.getByLabel('Giá bán (VNĐ)').fill('42000');
 await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dialog.getByRole('alert')).toContainText('mã chống trùng được giữ nguyên');
 expect(keys).toHaveLength(1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByLabel('Mã PIN chủ tiệm').fill('owner-pin-for-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Tên món')).toHaveValue('Chưa chắc đã lưu');
 await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dialog).toHaveCount(0);
 expect(attempts).toBe(2);
 expect(keys[0].length).toBeGreaterThanOrEqual(8);
 expect(keys[1]).toBe(keys[0]);
 expect(created).toHaveLength(1,'server-side once-only create when key is unchanged');
 await assertNoOverflow(page,390);
});

for(const width of [320,390,768,1366]){
 test('Owner order count and production statistics at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:width<=390?844:768});
  await mockOwner(page);
  await startOwner(page);
  await expect(page.getByText('753', {exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Xem số bánh bán theo loại'}).click();
  await expect(page.getByRole('heading',{name:'Thống kê số bánh đã bán'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Số lượng bán theo từng món'}).getByText('1.260 bánh')).toBeVisible();
  for(const period of ['Tuần','Tháng','Quý','Năm','Ngày']){
   await page.getByRole('button',{name:period,exact:true}).click();
   await expect(page.getByRole('button',{name:period,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await assertNoOverflow(page,width);
 });
}


test('OR-08a: Catalog dialog moves focus inside, traps Shift+Tab/Tab and returns focus on Escape',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await mockOwner(page);await startOwner(page);
 await page.getByRole('button',{name:'Sản phẩm'}).click();
 const opener=page.getByRole('button',{name:/Thêm món/});
 await opener.click();
 const dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Tên món')).toBeFocused();
 // Disabled submit is intentionally skipped by keyboard. Enable it before
 // verifying wrap-around between first and last focusable controls.
 await dialog.getByLabel('Tên món').fill('Bánh mì kiểm thử focus');
 await dialog.getByLabel('Giá bán (VNĐ)').fill('43000');
 await dialog.getByLabel('Tên món').focus();
 const close=dialog.getByRole('button',{name:'Đóng'});
 const submit=dialog.getByRole('button',{name:'Lưu sản phẩm'});
 await expect(submit).toBeEnabled();
 await page.keyboard.press('Shift+Tab');
 await expect(close).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(submit).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(close).toBeFocused();
 const bounds=await close.boundingBox();
 expect(bounds?.height).toBeGreaterThanOrEqual(44);
 expect(bounds?.width).toBeGreaterThanOrEqual(44);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(opener).toBeFocused();
});
test('OR-08a: 320px dialog stays keyboard-contained and returns focus after confirmed save',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 const {created}=await mockOwner(page);await startOwner(page);
 await page.getByRole('button',{name:'Sản phẩm'}).click();
 const opener=page.getByRole('button',{name:/Thêm món/});
 await opener.click();
 const dialog=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
 await expect(dialog.getByLabel('Tên món')).toBeFocused();
 for(let i=0;i<12;i++){
  await page.keyboard.press('Tab');
  const contained=await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]')));
  expect(contained,'Tab must never escape the open editor').toBe(true);
 }
 await dialog.getByLabel('Tên món').fill('Bánh mì keyboard QA');
 await dialog.getByLabel('Nhóm món').fill('Bánh mì');
 await dialog.getByLabel('Giá bán (VNĐ)').fill('43000');
 await dialog.getByRole('button',{name:'Lưu sản phẩm'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(opener).toBeFocused();
 expect(created).toHaveLength(1);
 expect(created[0]).toMatchObject({name:'Bánh mì keyboard QA',price_vnd:43000});
 await assertNoOverflow(page,320);
});


test('OR-10a: React Profiler proves only the changed KPI subtree commits after independent query updates',async({page})=>{
 await page.clock.install({time:new Date('2026-10-12T10:00:00.000Z')});
 await page.addInitScript(()=>{
  (window as Window&{__BMC_OWNER_RENDER_COMMITS__?:{id:string;phase:string}[]}).__BMC_OWNER_RENDER_COMMITS__=[];
 });
 const f=await mockOwner(page);
 await startOwner(page);
 await expect(page.getByText('1.234.567đ')).toBeVisible();
 await expect(page.getByLabel('Tổng số đơn hôm nay')).toHaveText('753');
 const reset=()=>page.evaluate(()=>{
  (window as Window&{__BMC_OWNER_RENDER_COMMITS__?:{id:string;phase:string}[]}).__BMC_OWNER_RENDER_COMMITS__=[];
 });
 const commits=()=>page.evaluate(()=>
  (window as Window&{__BMC_OWNER_RENDER_COMMITS__?:{id:string;phase:string}[]}).__BMC_OWNER_RENDER_COMMITS__??[]
 );
 await reset();
 f.setRevenue(1_400_000);
 await page.clock.fastForward(11_000);
 await expect(page.getByText('1.400.000đ')).toBeVisible();
 const revenueEvents=await commits();
 expect(revenueEvents.filter(c=>c.id==='revenue').length,'Revenue component must commit for changed revenue').toBeGreaterThan(0);
 expect(revenueEvents.filter(c=>c.id==='today-orders')).toHaveLength(0);
 expect(revenueEvents.filter(c=>c.id==='cash')).toHaveLength(0);
 await reset();
 f.setToday(906);
 await page.clock.fastForward(11_000);
 await expect(page.getByLabel('Tổng số đơn hôm nay')).toHaveText('906');
 const countEvents=await commits();
 expect(countEvents.filter(c=>c.id==='today-orders').length,'Today count component must commit for new count').toBeGreaterThan(0);
 expect(countEvents.filter(c=>c.id==='revenue')).toHaveLength(0);
 expect(countEvents.filter(c=>c.id==='cash')).toHaveLength(0);
});


/**
 * Root text-resize smoke across key mobile journeys.
 * This is not browser zoom or screen-reader certification; it catches horizontal
 * clipping and broken primary actions when browser text scaling is increased.
 */
for(const width of [320,390]){
 test('OR-08d: Owner root text at 200% remains usable at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:844});
  await mockOwner(page);await startOwner(page);
  await page.addStyleTag({content:':root{font-size:200%!important}'});
  const rootPx=await page.evaluate(()=>Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(rootPx).toBeGreaterThanOrEqual(32);
  await expect(page.getByText('1.234.567đ')).toBeVisible();
  await assertNoOverflow(page,width);
  await page.getByRole('button',{name:'Sản phẩm'}).click();
  const add=page.getByRole('button',{name:/Thêm món/});
  await expect(add).toBeVisible();
  await add.click();
  const dlg=page.getByRole('dialog',{name:'Chỉnh sản phẩm'});
  await expect(dlg.getByLabel('Tên món')).toBeFocused();
  await dlg.getByLabel('Tên món').fill('Bánh mì chữ lớn');
  await dlg.getByLabel('Giá bán (VNĐ)').fill('33000');
  await dlg.getByRole('button',{name:'Lưu sản phẩm'}).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText('Bánh mì chữ lớn')).toBeVisible();
  await assertNoOverflow(page,width);
 });
}
