import {test,expect} from '@playwright/test';

const accent='#a84f10',secondary='#5d6760';
function contrast(a:string,b:string){
 const channel=(n:number)=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
 const lum=(hex:string)=>{const bytes=[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16));return .2126*channel(bytes[0])+.7152*channel(bytes[1])+.0722*channel(bytes[2])};
 const first=lum(a),second=lum(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
test('UI-00: Owner and cashier both load semantic CSS tokens without Google Font CDN',async({page})=>{
 const thirdParty:string[]=[];
 page.on('request',request=>{if(/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url()))thirdParty.push(request.url())});
 for(const origin of ['http://127.0.0.1:5174/','http://127.0.0.1:5173/']){
  await page.goto(origin);
  const result=await page.evaluate(()=>{
   const cs=getComputedStyle(document.documentElement);
   return {accent:cs.getPropertyValue('--bmc-accent').trim().toLowerCase(),
    muted:cs.getPropertyValue('--bmc-muted').trim().toLowerCase(),
    font:cs.fontFamily.toLowerCase(),bodyWidth:document.documentElement.scrollWidth};
  });
  expect(result.accent).toBe(accent);
  expect(result.muted).toBe(secondary);
  expect(result.font).not.toContain('be vietnam pro');
  expect(result.bodyWidth).toBeLessThanOrEqual(1280);
 }
 expect(thirdParty).toEqual([]);
 expect(contrast(secondary,'#ffffff')).toBeGreaterThanOrEqual(4.5);
 expect(contrast(accent,'#ffffff')).toBeGreaterThanOrEqual(4.5);
});
test('UI-00: Owner six-tab mobile navigation keeps readable hit targets with no page overflow',async({page})=>{
 await page.setViewportSize({width:320,height:568});
 await page.route('**/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=path==='/v1/auth/login'?
   {token:'ui-design-owner-token',user:{id:'owner',role:'OWNER',name:'Chủ tiệm'}}:
   path==='/v1/owner/dashboard'?
   {paid_orders:0,net_revenue_vnd:0,cash_vnd:0,bank_vnd:0,pending_orders:0,bank_pending:0,shift:null,last_synced_at:null}:
   path==='/v1/owner/analytics/today'?
   {total_orders:0,paid_orders:0,pending_orders:0,refunded_orders:0,voided_orders:0}:{};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:5174/');
 await page.getByLabel('Mã PIN chủ tiệm').fill('owner-design-pin');
 const loginButton=page.getByRole('button',{name:'Đăng nhập'});
 const loginBox=await loginButton.boundingBox();expect(loginBox!.height).toBeGreaterThanOrEqual(48);
 await loginButton.click();
 await expect(page.locator('.bottomnav button')).toHaveCount(6);
 const metrics=await page.evaluate(()=>{
  const nav=document.querySelector('.bottomnav') as HTMLElement;
  const buttons=[...nav.querySelectorAll('button')];
  return {outer:document.documentElement.scrollWidth,viewport:innerWidth,
   navCanScroll:nav.scrollWidth>nav.clientWidth,
   minTap:Math.min(...buttons.map(x=>x.getBoundingClientRect().height)),
   minText:Math.min(...buttons.map(x=>Number.parseFloat(getComputedStyle(x.querySelector('small')!).fontSize)))};
 });
 expect(metrics.outer).toBeLessThanOrEqual(metrics.viewport+1);
 expect(metrics.navCanScroll).toBe(true);
 expect(metrics.minTap).toBeGreaterThanOrEqual(48);
 expect(metrics.minText).toBeGreaterThanOrEqual(11);
});
test('UI-00: cashier login has visible money-safe focus and 48px+ submit',async({page})=>{
 await page.setViewportSize({width:1024,height:768});
 await page.goto('http://127.0.0.1:5173/');
 const login=page.getByRole('button',{name:'Đăng nhập'});
 await expect(login).toBeVisible();
 const b=await login.boundingBox();
 expect(b!.height).toBeGreaterThanOrEqual(48);
 await page.getByLabel('Mã PIN thu ngân').focus();
 const outline=await page.getByLabel('Mã PIN thu ngân').evaluate(el=>getComputedStyle(el).outlineWidth);
 expect(Number.parseFloat(outline)).toBeGreaterThanOrEqual(2);
});

test('UI-01: mobile design tokens, legible inputs and reduced motion in Owner and POS',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const origin of ['http://127.0.0.1:5174/','http://127.0.0.1:5173/']){
  await page.goto(origin);
  const design=await page.evaluate(()=>{
   const root=getComputedStyle(document.documentElement);
   const input=document.querySelector('input')!;
   const inputStyle=getComputedStyle(input);
   return {
    space:root.getPropertyValue('--bmc-space-4').trim(),
    dialogRadius:root.getPropertyValue('--bmc-radius-dialog').trim(),
    fastMotion:root.getPropertyValue('--bmc-motion-fast').trim(),
    inputPx:Number.parseFloat(inputStyle.fontSize),
    reducedDuration:getComputedStyle(document.body).transitionDuration,
   };
  });
  expect(design.space).toBe('16px');
  expect(design.dialogRadius).toBe('20px');
  expect(design.fastMotion).toBe('120ms');
  expect(design.inputPx).toBeGreaterThanOrEqual(16);
  expect(design.reducedDuration).not.toBe('180ms');
 }
});
