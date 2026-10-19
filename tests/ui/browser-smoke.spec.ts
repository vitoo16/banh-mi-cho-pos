import {test,expect} from '@playwright/test';

/** Cross-engine screen smoke. Images are unapproved review candidates, NOT golden baselines. */
const queueOrder={
 order_id:'11111111-1111-4111-8111-111111111111',
 display_code:'B00042',created_at:'2026-10-11T03:20:00.000Z',
 created_by:'staff',status:'COMMITTED',payment_status:'UNPAID',
 requested_payment_method:'CASH',total_vnd:90000,version:1,note:'',
 items:[{product_id:'bm',name_snapshot:'Bánh mì đặc biệt',qty:2,unit_price_vnd:45000,line_total_vnd:90000,note:''}],
};
const shift={id:'sh-001',cashier_id:'cashier',opening_float_vnd:1000000,status:'OPEN',opened_at:'2026-10-11T02:00:00Z',expected_cash_vnd:1000000};
async function assertNoXScroll(page:import('@playwright/test').Page){
 const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width+1);
}
test('POS 1024px queue/cash visual candidate with bundled Vietnamese font',async({page},testInfo)=>{
 await page.setViewportSize({width:1024,height:768});
 await page.route('**/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const body=path==='/v1/auth/login'?{token:'screen-test',user:{id:'cashier',name:'Thu ngân',role:'CASHIER'}}:
   path==='/v1/orders'?[queueOrder]:
   path==='/v1/cash-shifts/current'?shift:
   path==='/v1/cashier/operational-status'?{printer:{driver_configured:false,waiting_copies:0,unknown_copies:0,unknown_receipts:[]},cloud_sync:{configured:false,pending_events:0,last_delivered_at:null}}:
   path.endsWith('/receipts')?[]:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5173/');
 await page.getByLabel('Mã PIN thu ngân').fill('screen-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('#B00042').first()).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.fonts.check('400 16px "Be Vietnam Pro"'))).toBe(true);
 await assertNoXScroll(page);
 await page.screenshot({path:testInfo.outputPath('pos-queue-1024.png'),fullPage:true});
 await page.getByRole('button',{name:/B00042/}).click();
 await page.getByLabel('Khách đưa (VNĐ)').fill('100000');
 await expect(page.getByText('10.000đ')).toBeVisible();
 await assertNoXScroll(page);
 await page.screenshot({path:testInfo.outputPath('pos-cash-1024.png'),fullPage:true});
});
test('Owner 390px dashboard/catalog visual candidate with route links',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const body=path==='/v1/auth/login'?{token:'owner-screen',user:{id:'owner',name:'Chủ tiệm',role:'OWNER'}}:
   path==='/v1/owner/dashboard'?{paid_orders:5,net_revenue_vnd:250000,cash_vnd:175000,bank_vnd:75000,pending_orders:2,bank_pending:1,shift:null,last_synced_at:null}:
   path==='/v1/owner/analytics/today'?{total_orders:18,paid_orders:5,voided_orders:0,refunded_orders:0,pending_orders:13}:
   path==='/v1/owner/products'?{version:1,enabled_payment_methods:['CASH','BANK'],products:[{id:'bm1',name:'Bánh mì đặc biệt',category:'Bánh mì',price_vnd:45000,is_active:true}]}:
   path==='/v1/owner/remote-product-commands'?[]:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:5174/');
 await page.getByLabel('Mã PIN chủ tiệm').fill('screen-test');
 await page.getByRole('button',{name:'Đăng nhập'}).click();
 await expect(page.getByText('250.000đ')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await assertNoXScroll(page);
 await page.screenshot({path:testInfo.outputPath('owner-dashboard-390.png'),fullPage:true});
 const link=page.getByRole('link',{name:'Sản phẩm'});
 await expect(link).toHaveAttribute('href','/catalog');
 await link.click();
 await expect(page.getByText('Bánh mì đặc biệt')).toBeVisible();
 await assertNoXScroll(page);
 await page.screenshot({path:testInfo.outputPath('owner-catalog-390.png'),fullPage:true});
});
