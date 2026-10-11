import {test,expect,type Page} from '@playwright/test';

const order={
 order_id:'11111111-1111-4111-8111-111111111111',
 display_code:'B00042',created_at:'2026-10-11T03:20:00.000Z',
 created_by:'staff',status:'COMMITTED',payment_status:'UNPAID',
 requested_payment_method:'CASH',total_vnd:90000,version:1,note:'',
 items:[{
  product_id:'bm-thit',name_snapshot:'Bánh mì thịt nguội cực kỳ đặc biệt nhiều nguyên liệu',
  qty:2,unit_price_vnd:45000,line_total_vnd:90000,note:'Ít rau',
 }],
};
const shift={
 id:'sh-001',cashier_id:'cashier',opening_float_vnd:1000000,
 status:'OPEN',opened_at:'2026-10-11T02:00:00.000Z',expected_cash_vnd:1000000,
};
const operational={
 printer:{driver_configured:false,waiting_copies:0,unknown_copies:0,unknown_receipts:[]},
 cloud_sync:{configured:false,pending_events:0,last_delivered_at:null},
};
async function mockHub(page:Page){
 const captures:string[]=[];
 await page.route('**/v1/**',async route=>{
  const {pathname}=new URL(route.request().url()),method=route.request().method();
  let result:unknown={},status=200;
  if(pathname==='/v1/auth/login')result={token:'test-only-session',user:{id:'cashier',name:'Thu ngân',role:'CASHIER'}};
  else if(pathname==='/v1/orders'&&method==='GET')result=[order];
  else if(pathname==='/v1/cash-shifts/current')result=shift;
  else if(pathname==='/v1/cashier/operational-status')result=operational;
  else if(pathname.endsWith('/receipts'))result=[];
  else if(pathname.endsWith('/payments/bank-intent'))result={status:'PENDING',reference:'BMC1234567890ABC',amount_vnd:90000,bank_code:'970415',account_number:'123456789'};
  else if(pathname.endsWith('/payments/cash')){captures.push(route.request().postData()||'');status=500;result={code:'MOCK_REJECTED',message:'Never capture in layout test'};}
  else{status=404;result={code:'NOT_MOCKED',message:'Route deliberately not mocked'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
 });
 return {captures};
}
async function assertNoViewportOverflow(page:Page,width:number){
 const metrics=await page.evaluate(()=>({
  root:document.documentElement.scrollWidth,
  body:document.body.scrollWidth,
  viewport:window.innerWidth,
 }));
 expect(metrics.viewport).toBe(width);
 expect(metrics.root,'Root horizontal overflow: '+JSON.stringify(metrics)).toBeLessThanOrEqual(width+1);
 expect(metrics.body,'Body horizontal overflow: '+JSON.stringify(metrics)).toBeLessThanOrEqual(width+1);
}
async function startCashier(page:Page){
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Mã PIN thu ngân').fill('cashier-test-secret');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('#B00042').first()).toBeVisible();
}
for(const width of [320,390,1024,1366]){
 test('POS order checkout at '+width+'px has no viewport overflow or accidental payment',async({page})=>{
  await page.setViewportSize({width,height:width===320?640:width===390?844:768});
  const {captures}=await mockHub(page);
  await startCashier(page);
  await page.getByRole('button',{name:/B00042/}).click();
  await expect(page.getByText('TỔNG CẦN THU')).toBeVisible();
  await expect(page.getByText('90.000đ').last()).toBeVisible();
  const cash=page.getByLabel('Khách đưa (VNĐ)');
  await cash.fill('100000');
  await expect(page.getByText('10.000đ')).toBeVisible();
  const confirm=page.getByRole('button',{name:'Xác nhận đã nhận tiền'});
  await expect(confirm).toBeEnabled();
  await confirm.scrollIntoViewIfNeeded();
  const box=await confirm.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
  await assertNoViewportOverflow(page,width);
  expect(captures).toHaveLength(0);
 });
}
test('BANK requested is never displayed as verified PAID on cashier screen',async({page})=>{
 await page.route('https://vietqr.app/img**',route=>route.fulfill({status:200,contentType:'image/svg+xml',
  body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256"/></svg>'}));
 await page.setViewportSize({width:390,height:844});
 const {captures}=await mockHub(page);
 await startCashier(page);
 await page.getByRole('button',{name:/B00042/}).click();
 await page.getByRole('button',{name:/Chuyển khoản/}).click();
 await page.getByRole('button',{name:'Tạo yêu cầu chuyển khoản'}).click();
 await expect(page.getByText('Đang chờ xác nhận ngân hàng')).toBeVisible();
 await expect(page.getByText('BMC1234567890ABC')).toBeVisible();
 const qr=page.getByRole('img',{name:/VietQR chuyển khoản/});
 await expect(qr).toBeVisible();
 const src=await qr.getAttribute('src');
 expect(src).not.toBeNull();
 const url=new URL(src!);
 expect(url.origin).toBe('https://vietqr.app');
 expect(url.searchParams.get('acc')).toBe('123456789');
 expect(url.searchParams.get('bank')).toBe('970415');
 expect(url.searchParams.get('amount')).toBe('90000');
 expect(url.searchParams.get('des')).toBe('BMC1234567890ABC');

 await expect(page.getByText('Đã ghi nhận thanh toán')).toHaveCount(0);
 await expect(page.getByText('Chưa thanh toán').first()).toBeVisible();
 expect(captures).toHaveLength(0);
 await assertNoViewportOverflow(page,390);
});

test('BANK QR network failure keeps verified transfer details and never claims PAID',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await page.route('https://vietqr.app/img**',route=>route.fulfill({status:503,body:'Unavailable'}));
 const {captures}=await mockHub(page);
 await startCashier(page);
 await page.getByRole('button',{name:/B00042/}).click();
 await page.getByRole('button',{name:/Chuyển khoản/}).click();
 await page.getByRole('button',{name:'Tạo yêu cầu chuyển khoản'}).click();
 await expect(page.getByRole('status').filter({hasText:'Không tải được QR'})).toBeVisible();
 await expect(page.getByText('123456789',{exact:true})).toBeVisible();
 await expect(page.getByText('BMC1234567890ABC')).toBeVisible();
 await expect(page.getByText('Đã ghi nhận thanh toán')).toHaveCount(0);
 await assertNoViewportOverflow(page,320);
 expect(captures).toHaveLength(0);
});
