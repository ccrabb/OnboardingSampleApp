// @ts-check
const { test, expect } = require('@playwright/test');

async function openTenantSetup(page, customerId) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tenant Setup' }).click();
  await page.getByLabel('Customer').selectOption(customerId);
}

test.describe('Tenant Setup', () => {
  // Server data is in memory and shared by every test, so run these one at a time
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ request }) => {
    // Restore the seed data and cancel any provisioning still in flight
    const res = await request.post('/api/__reset');
    expect(res.status()).toBe(204);
  });

  test('should provision a tenant and complete the onboarding step', async ({ page }) => {
    await openTenantSetup(page, 'cust_001');
    await expect(page.getByTestId('tenant-status')).toHaveText('Pending');

    // Keep the values pre-filled from the customer record
    await expect(page.getByLabel('Subdomain')).toHaveValue('acme-corporation');
    await expect(page.getByLabel('Admin email')).toHaveValue('onboarding@acme.example.com');

    await page.getByRole('button', { name: 'Provision tenant' }).click();
    await expect(page.getByTestId('tenant-status')).toHaveText('Provisioning');
    // The server finishes provisioning about 2 seconds after the request
    await expect(page.getByTestId('tenant-status')).toHaveText('Active', { timeout: 10_000 });

    // Verify the dashboard picks up the completed step
    await page.getByRole('button', { name: 'Dashboard' }).click();
    const acmeCard = page.locator('.customer-card').filter({ hasText: 'Acme Corporation' });
    await expect(acmeCard.locator('.progress-bar')).toHaveText('25%');
    await expect(
      acmeCard.locator('.checklist li').filter({ hasText: 'Tenant Setup' })
    ).toContainText('completed');
  });

  test('should reject an invalid subdomain', async ({ page, request }) => {
    await openTenantSetup(page, 'cust_001');
    await expect(page.getByTestId('tenant-status')).toHaveText('Pending');
    // Wait for the pre-fill so it can't overwrite the value typed below
    await expect(page.getByLabel('Subdomain')).toHaveValue('acme-corporation');

    await page.getByLabel('Subdomain').fill('Bad Subdomain!');
    await page.getByRole('button', { name: 'Provision tenant' }).click();

    await expect(page.getByTestId('error-subdomain')).toBeVisible();
    await expect(page.getByTestId('tenant-status')).not.toHaveText('Provisioning');

    // Verify the server never started provisioning either
    const res = await request.get('/api/tenants/cust_001');
    expect((await res.json()).status).toBe('pending');
  });

  test('should reject a subdomain already used by another tenant', async ({ page }) => {
    await openTenantSetup(page, 'cust_001');
    await expect(page.getByLabel('Subdomain')).toHaveValue('acme-corporation');
    await page.getByLabel('Subdomain').fill('acme');
    await page.getByRole('button', { name: 'Provision tenant' }).click();
    await expect(page.getByTestId('tenant-status')).toHaveText('Active', { timeout: 10_000 });

    await page.getByLabel('Customer').selectOption('cust_002');
    await expect(page.getByTestId('tenant-status')).toHaveText('No tenant yet');
    // Wait for the pre-fill so it can't overwrite the value typed below
    await expect(page.getByLabel('Subdomain')).toHaveValue('abc-accounting');

    await page.getByLabel('Subdomain').fill('acme');
    await page.getByRole('button', { name: 'Provision tenant' }).click();

    await expect(page.getByTestId('error-subdomain')).toBeVisible();
    await expect(page.getByTestId('tenant-status')).not.toHaveText('Provisioning');
  });
});
