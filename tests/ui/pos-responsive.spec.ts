import {test,expect,type Page} from '@playwright/test';
const order={order_id:'11111111-1111-4111-8111-111111111111',display_code:'B00042',created_at:'2026-10-11T03:20:00.000Z',created_by:'staff',status:'COMMITTED',payment_status:'UNPAID',requested_payment_method:'CASH',total_vnd:90000,version:1,note:'',items:[{product_id:'bm-thit',name_snapshot:'Bánh mì thịt nguội cực kỳ đặc biệt nhiều nguyên liệu',qty:2,unit_price_vnd:45000,line_total_vnd:90000,note:'Ít rau'}]};
const shift={id:'sh-001',cashier_id:'cashier',opening_float_vnd:1000000,status:'OPEN',opened_at:'2026-10-11T02:00:00.000Z',expected_cash_vnd:1000000};
async function mockHub(page:Page){
 await page.route('**/v1/**',route=>{
  const url=new URL(route.request().url());
  let result:unknown={},code=200;
  if(url.pathname==='/v1/auth/login')result={token:'test-only-session',user:{id:'cashier',name:'Thu ngân',role:'CASHIER'}};
  else if(url.pathname==='/v1/orders')result=[order];
  else if(url.pathname==='/v1/cash-shifts/current')result=shift;
  else if(url.pathname.includes('/receipts'))result=[];
  else{code=404;result={code:'MOCK_NOT_FOUND',message:'Only stubbed endpoints allowed'}}
  return route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(result)});
 });
}
for(const width of [320,390,1024,1366]){
 test('POS touch checkout remains usable without X overflow at '+width,async({page})=>{
  await page.setViewportSize({width,height:width===320?640:width===390?844:768});
  await mockHub(page);await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Mã PIN thu ngân').fill('cashier-test-secret');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByText('#B00042').first()).toBeVisible();
  await page.getByRole('button',{name:/#B00042/}).click();
  await expect(page.getByText('TỔNG CẦN THU')).toBeVisible();
  const cash=page.getByLabel('Khách đưa (VNĐ)');await cash.fill('100000');
  await expect(page.getByText('10.000đ')).toBeVisible();
  const confirm=page.getByRole('button',{name:'Xác nhận đã nhận tiền'});
  await expect(confirm).toBeEnabled();
  const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(width+1);
  const box=await confirm.boundingBox();expect(box).not.toBeNull();
  expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
 });
}
