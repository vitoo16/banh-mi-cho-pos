import {test,expect,type Page} from '@playwright/test';
const summary={paid_orders:23,net_revenue_vnd:1234567,cash_vnd:1100000,bank_vnd:134567,pending_orders:4,bank_pending:2,last_synced_at:'2026-10-11T02:00:00.000Z',shift:null};
async function mockOwner(page:Page){
 await page.route('**/v1/**',route=>{
  const url=new URL(route.request().url());let body:unknown={},status=200;
  switch(url.pathname){
   case '/v1/auth/login':body={token:'test-owner',user:{id:'owner',role:'OWNER',name:'Chủ tiệm'}};break;
   case '/v1/owner/dashboard':body=summary;break;
   case '/v1/owner/products':body={version:1,enabled_payment_methods:['CASH','BANK'],products:[]};break;
   case '/v1/owner/employees':body=[];break;
   case '/v1/orders/history':body={items:[],next_cursor:null};break;
   default:body={code:'UNKNOWN',message:'Not mocked'};status=404;
  }
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
}
for(const width of [320,390,768,1366]){
 test('Owner dashboard legible no overflow at '+width,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:width===390?844:768});await mockOwner(page);
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('textbox').count();await page.locator('input[type=password]').fill('owner-pin-for-test');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByText('DOANH THU ĐÃ XÁC NHẬN')).toBeVisible();
  await expect(page.getByText('1.234.567đ')).toBeVisible();
  const x=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(x).toBeLessThanOrEqual(width+1);
  const day=page.locator('#report-day');await expect(day).toBeVisible();
 });
}
