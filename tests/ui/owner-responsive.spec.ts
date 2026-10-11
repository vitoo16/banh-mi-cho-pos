import {test,expect,type Page} from '@playwright/test';

const summary={
 paid_orders:23,net_revenue_vnd:1234567,cash_vnd:1100000,bank_vnd:134567,
 pending_orders:4,bank_pending:2,last_synced_at:null,shift:null,
};
async function mockOwner(page:Page){
 const products:Array<{id:string;name:string;category:string;price_vnd:number;is_active:boolean}>=[];
 const created:unknown[]=[];
 await page.route('**/v1/**',async route=>{
  const {pathname}=new URL(route.request().url()),method=route.request().method();
  let body:unknown={},status=200;
  if(pathname==='/v1/auth/login')body={token:'test-owner',user:{id:'owner',role:'OWNER',name:'Chủ tiệm'}};
  else if(pathname==='/v1/owner/dashboard')body=summary;
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
 return {created};
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
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded'});
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
