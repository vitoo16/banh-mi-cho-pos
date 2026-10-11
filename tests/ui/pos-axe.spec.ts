import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Minimal cashier contract mock. Never registers a capture-success response. */
async function mockCashier(page:Page){
 const fixture={
  order_id:'11111111-1111-4111-8111-111111111111',
  display_code:'B00042',created_at:'2026-10-11T03:20:00.000Z',
  created_by:'staff',status:'COMMITTED',payment_status:'UNPAID',
  requested_payment_method:'CASH',total_vnd:90000,version:1,note:'',
  items:[{product_id:'bm-thit',name_snapshot:'Bánh mì thịt nguội',
   qty:2,unit_price_vnd:45000,line_total_vnd:90000,note:''}],
 };
 const writes:string[]=[];
 await page.route('**/v1/**',async route=>{
  const {pathname}=new URL(route.request().url());
  const method=route.request().method();
  if(!['GET','HEAD'].includes(method)&&pathname!=='/v1/auth/login')writes.push(pathname);
  let status=200;
  let body:unknown={};
  if(pathname==='/v1/auth/login')body={token:'test-only-session',user:{id:'cashier',name:'Thu ngân',role:'CASHIER'}};
  else if(pathname==='/v1/orders')body=[fixture];
  else if(pathname==='/v1/cash-shifts/current')body={
   id:'shift-a11y',cashier_id:'cashier',opening_float_vnd:1000000,
   status:'OPEN',opened_at:'2026-10-11T02:00:00.000Z',expected_cash_vnd:1000000,
  };
  else if(pathname==='/v1/cashier/operational-status')body={
   printer:{driver_configured:false,waiting_copies:0,unknown_copies:0,unknown_receipts:[]},
   cloud_sync:{configured:false,pending_events:0,last_delivered_at:null},
  };
  else if(pathname.endsWith('/receipts'))body=[];
  else{status=404;body={code:'NOT_MOCKED',message:'A11y fixture did not mock '+pathname}}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 return writes;
}
async function audit(page:Page){
 const report=await new AxeBuilder({page})
  .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 expect(report.violations.map(v=>({
  rule:v.id,impact:v.impact,
  nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})),
 }))).toEqual([]);
}
test('POS WCAG automated smoke: cashier PIN login and orders queue at 1024px',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 const writes=await mockCashier(page);
 await page.goto('/');
 await expect(page.getByLabel('Mã PIN thu ngân')).toBeVisible();
 await audit(page);
 await page.getByLabel('Mã PIN thu ngân').fill('cashier-test-secret');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('#B00042').first()).toBeVisible();
 await audit(page);
 expect(writes).toEqual([]);
});
test('POS WCAG automated smoke: shift and cash till forms at 1024px',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 const writes=await mockCashier(page);
 await page.goto('/');
 await page.getByLabel('Mã PIN thu ngân').fill('cashier-test-secret');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('#B00042').first()).toBeVisible();
 await page.getByRole('button',{name:'Sổ quỹ & chốt ca'}).click();
 await expect(page.getByRole('heading',{name:'Ca thu ngân'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Số tiền (VNĐ)'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Lý do'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Tiền thực đếm (VNĐ)'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Giải trình (bắt buộc nếu lệch)'})).toBeVisible();
 await audit(page);
 expect(writes).toEqual([]);
});
