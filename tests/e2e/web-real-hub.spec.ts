import { test, expect } from '@playwright/test';

const CASHIER_PIN = 'e2e-pw-cashier-pin-8888';
const OWNER_PIN = 'e2e-pw-owner-pin-9999';
const STAFF_PIN = 'e2e-pw-staff-pin-7777';
const HUB_URL = 'http://127.0.0.1:4400';

async function createStaffOrder() {
  const loginRes = await fetch(`${HUB_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'staff', pin: STAFF_PIN })
  });
  const { token } = await loginRes.json();

  const catRes = await fetch(`${HUB_URL}/v1/catalog`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const cat = await catRes.json();
  const prod = cat.products[0];

  const orderRes = await fetch(`${HUB_URL}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Idempotency-Key': `e2e-pw-staff-${Date.now()}-${Math.random()}`
    },
    body: JSON.stringify({
      catalog_version: cat.version,
      requested_payment_method: 'CASH',
      items: [{ product_id: prod.id, qty: 1, note: 'Khách yêu cầu giòn' }]
    })
  });
  return orderRes.json();
}

test.describe('E2E Real Store Hub & Web Frontend Integration', () => {

  test('POS E2E: Cashier logs in, opens shift, views live staff order, and settles cash payment', async ({ page }) => {
    // 1. Visit Web POS on port 5173
    await page.goto('http://127.0.0.1:5173');
    await expect(page.locator('h1')).toContainText('Quầy thu ngân');

    // 2. Log in as Cashier
    await page.locator('#pin').fill(CASHIER_PIN);
    await page.locator('button.primary').click();

    // 3. Verify logged-in shell
    await expect(page.locator('.brand b')).toContainText('Bánh Mì Chợ');
    await expect(page.locator('.network')).toContainText('Store Hub');

    // 4. Open cash shift if not open
    const shiftPill = page.locator('.pill');
    const pillText = await shiftPill.textContent();
    if (pillText?.includes('Chưa mở')) {
      await page.locator('button:has-text("Sổ quỹ & chốt ca")').click();
      await expect(page.locator('h1')).toContainText('Ca thu ngân');
      await page.locator('#shift-opening-float').fill('500000');
      await page.locator('button:has-text("Mở ca thu ngân")').click();
      await expect(page.locator('.stats')).toBeVisible({ timeout: 5000 });
      await page.locator('button:has-text("Đơn hàng")').click();
    }

    // 5. Submit an order to real Hub via Staff API
    const order = await createStaffOrder();
    expect(order.display_code).toBeTruthy();

    // 6. Refresh queue and wait for the order tile to appear
    await page.locator('button[aria-label="Tải lại đơn"]').click();
    const orderTile = page.locator(`.order-tile:has-text("#${order.display_code}")`);
    await expect(orderTile).toBeVisible({ timeout: 10000 });

    // 7. Click to open order in Checkout panel
    await orderTile.click();
    await expect(page.locator('.checkout-pane h1')).toContainText(order.display_code);

    // 8. Cash tender & settle
    const tenderInput = page.locator('#tender');
    await tenderInput.fill('100000');

    const confirmBtn = page.locator('button:has-text("Xác nhận đã nhận tiền")');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 9. Payment confirmed status
    await expect(page.locator('.checkout-content')).toContainText('Đã ghi nhận thanh toán', { timeout: 10000 });
  });

  test('Owner Web E2E: Owner logs in, inspects dashboard and catalog on real Hub', async ({ page }) => {
    // 1. Visit Web Owner on port 5174
    await page.goto('http://127.0.0.1:5174');
    await expect(page.locator('h1')).toContainText('Dành cho chủ tiệm');

    // 2. Log in as Owner
    await page.locator('#owner-pin').fill(OWNER_PIN);
    await page.locator('button.primary').click();

    // 3. Verify Owner dashboard layout
    await expect(page.locator('.sidebar .brand b')).toContainText('Bánh Mì Chợ');
    await expect(page.locator('.header h1')).toContainText('Tổng quan');

    // 4. Navigate to Catalog ("Sản phẩm")
    await page.locator('nav.navlinks a[href="/catalog"]').click();
    await expect(page.locator('.header h1')).toContainText('Sản phẩm');
    await expect(page.locator('.owner-catalog')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h2:has-text("Menu và giá bán")')).toBeVisible();
  });

});
