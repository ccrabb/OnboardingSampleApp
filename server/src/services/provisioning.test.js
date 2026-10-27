const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const store = require('../data/store');
const { provisionTenant, cancelPendingProvisioning } = require('./provisioning');

const validConfig = {
  plan: 'enterprise',
  region: 'eu',
  subdomain: 'acme-corp',
  adminEmail: 'admin@acme.example.com',
  currency: 'EUR'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForStatus(customerId, status) {
  for (let i = 0; i < 100; i++) {
    if (store.getTenantByCustomerId(customerId)?.status === status) return;
    await wait(5);
  }
  assert.fail(`tenant for ${customerId} never became ${status}`);
}

describe('Provisioning Service', () => {
  beforeEach(() => {
    store.reset();
  });

  afterEach(() => {
    cancelPendingProvisioning();
  });

  it('should provision an existing tenant and complete Tenant Setup', async () => {
    const result = provisionTenant('cust_001', validConfig, { delayMs: 0 });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tenant.id, 'tenant_001');
    assert.strictEqual(result.tenant.status, 'provisioning');
    assert.strictEqual(result.tenant.subdomain, 'acme-corp');
    assert.strictEqual(result.tenant.plan, 'enterprise');
    assert.strictEqual(result.tenant.provisionedAt, null);

    await waitForStatus('cust_001', 'active');

    const tenant = store.getTenantByCustomerId('cust_001');
    assert.ok(tenant.provisionedAt);
    assert.strictEqual(tenant.error, null);

    const state = store.getOnboardingState('cust_001');
    assert.strictEqual(state.steps.find(s => s.id === 'step_3').status, 'completed');
    assert.strictEqual(state.progressPercent, 25);
    assert.strictEqual(state.steps.filter(s => s.status === 'completed').length, 1);
  });

  it('should create a tenant for a customer without one', async () => {
    const result = provisionTenant('cust_002', { ...validConfig, subdomain: 'abc-accounting' }, { delayMs: 0 });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tenant.customerId, 'cust_002');
    assert.strictEqual(result.tenant.id, 'tenant_002');
    assert.strictEqual(store.getTenants().length, 2);

    await waitForStatus('cust_002', 'active');
    assert.strictEqual(store.getOnboardingState('cust_002').progressPercent, 25);
  });

  it('should stay provisioning until the delay elapses', async () => {
    provisionTenant('cust_001', validConfig, { delayMs: 50 });

    await wait(10);
    assert.strictEqual(store.getTenantByCustomerId('cust_001').status, 'provisioning');
    assert.strictEqual(store.getOnboardingState('cust_001').progressPercent, 0);

    await waitForStatus('cust_001', 'active');
  });

  it('should return not_found for an unknown customer', () => {
    assert.deepStrictEqual(provisionTenant('cust_999', validConfig, { delayMs: 0 }), { ok: false, reason: 'not_found' });
  });

  it('should return field errors and leave the tenant untouched when invalid', () => {
    const result = provisionTenant('cust_001', { ...validConfig, subdomain: 'NO', currency: 'JPY' }, { delayMs: 0 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'invalid');
    assert.deepStrictEqual(Object.keys(result.errors).sort(), ['currency', 'subdomain']);
    assert.strictEqual(store.getTenantByCustomerId('cust_001').status, 'pending');
  });

  it("should reject a subdomain already used by another customer's tenant", () => {
    provisionTenant('cust_001', validConfig, { delayMs: 0 });
    const result = provisionTenant('cust_002', validConfig, { delayMs: 0 });

    assert.strictEqual(result.reason, 'invalid');
    assert.deepStrictEqual(result.errors, { subdomain: 'Subdomain is already in use' });
    assert.strictEqual(store.getTenantByCustomerId('cust_002'), undefined);
  });

  it('should return conflict while provisioning or once active', async () => {
    provisionTenant('cust_001', validConfig, { delayMs: 20 });

    const whileProvisioning = provisionTenant('cust_001', validConfig, { delayMs: 0 });
    assert.strictEqual(whileProvisioning.reason, 'conflict');
    assert.match(whileProvisioning.error, /provisioning/);

    await waitForStatus('cust_001', 'active');

    const whileActive = provisionTenant('cust_001', validConfig, { delayMs: 0 });
    assert.strictEqual(whileActive.reason, 'conflict');
    assert.match(whileActive.error, /active/);
  });

  it('should allow a failed tenant to be provisioned again', async () => {
    store.updateTenant('cust_001', { status: 'failed', error: 'Region unavailable' });

    const result = provisionTenant('cust_001', validConfig, { delayMs: 0 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tenant.error, null);

    await waitForStatus('cust_001', 'active');
  });

  it('should not complete provisioning after it is cancelled', async () => {
    provisionTenant('cust_001', validConfig, { delayMs: 10 });

    cancelPendingProvisioning();
    store.reset();
    await wait(30);

    assert.strictEqual(store.getTenantByCustomerId('cust_001').status, 'pending');
    assert.strictEqual(store.getOnboardingState('cust_001').progressPercent, 0);
  });

  it('should use PROVISION_DELAY_MS when no delay is given', async () => {
    const original = process.env.PROVISION_DELAY_MS;
    process.env.PROVISION_DELAY_MS = '0';
    try {
      provisionTenant('cust_001', validConfig);
      await waitForStatus('cust_001', 'active');
    } finally {
      if (original === undefined) delete process.env.PROVISION_DELAY_MS;
      else process.env.PROVISION_DELAY_MS = original;
    }
  });
});
