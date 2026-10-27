const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const app = require('../index');

const validConfig = {
  plan: 'starter',
  region: 'apac',
  subdomain: 'acme-corp',
  adminEmail: 'admin@acme.example.com',
  currency: 'USD'
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('Tenant API', () => {
  let server;
  let baseUrl;

  const request = (path, { method = 'GET', body } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  const provision = (customerId, body) =>
    request(`/api/tenants/${customerId}/provision`, { method: 'POST', body });

  async function waitForTenantStatus(customerId, status) {
    for (let i = 0; i < 100; i++) {
      const tenant = await (await request(`/api/tenants/${customerId}`)).json();
      if (tenant.status === status) return tenant;
      await wait(5);
    }
    assert.fail(`tenant for ${customerId} never became ${status}`);
  }

  before(async () => {
    process.env.PROVISION_DELAY_MS = '5';
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    await request('/api/__reset', { method: 'POST' });
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(async () => {
    process.env.PROVISION_DELAY_MS = '5';
    const res = await request('/api/__reset', { method: 'POST' });
    assert.strictEqual(res.status, 204);
  });

  it('GET /api/tenants should list tenants', async () => {
    const res = await request('/api/tenants');
    const tenants = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(tenants.length, 1);
    assert.strictEqual(tenants[0].customerId, 'cust_001');
    assert.strictEqual(tenants[0].currency, 'USD');
    assert.strictEqual(tenants[0].error, null);
  });

  it('GET /api/tenants/:customerId should 404 for a customer without a tenant', async () => {
    const res = await request('/api/tenants/cust_002');
    assert.strictEqual(res.status, 404);
  });

  it('should provision a tenant through to active and update onboarding progress', async () => {
    const res = await provision('cust_001', validConfig);
    const tenant = await res.json();

    assert.strictEqual(res.status, 202);
    assert.strictEqual(tenant.status, 'provisioning');
    assert.strictEqual(tenant.region, 'apac');

    const active = await waitForTenantStatus('cust_001', 'active');
    assert.ok(active.provisionedAt);
    assert.strictEqual(active.error, null);

    const dashboard = await (await request('/api/onboarding')).json();
    const acme = dashboard.find(s => s.customerId === 'cust_001');
    assert.strictEqual(acme.progressPercent, 25);
    assert.strictEqual(acme.steps.find(s => s.id === 'step_3').status, 'completed');
  });

  it('should create a tenant for a customer that has none', async () => {
    const res = await provision('cust_004', { ...validConfig, subdomain: 'premier', currency: 'GBP' });

    assert.strictEqual(res.status, 202);
    assert.strictEqual((await res.json()).customerId, 'cust_004');
    await waitForTenantStatus('cust_004', 'active');
    assert.strictEqual((await (await request('/api/tenants')).json()).length, 2);
  });

  it('should 400 with an error per invalid field', async () => {
    const cases = [
      [{ plan: 'gold' }, 'plan'],
      [{ region: 'mars' }, 'region'],
      [{ subdomain: 'No Spaces' }, 'subdomain'],
      [{ adminEmail: 'nope' }, 'adminEmail'],
      [{ currency: 'JPY' }, 'currency']
    ];
    for (const [override, field] of cases) {
      const res = await provision('cust_001', { ...validConfig, ...override });
      const body = await res.json();

      assert.strictEqual(res.status, 400, `expected 400 for ${field}`);
      assert.deepStrictEqual(Object.keys(body.errors), [field]);
      assert.strictEqual(typeof body.errors[field], 'string');
    }
  });

  it('should 400 for every missing field when the body is empty', async () => {
    const res = await request('/api/tenants/cust_001/provision', { method: 'POST' });
    const body = await res.json();

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(Object.keys(body.errors).sort(), ['adminEmail', 'currency', 'plan', 'region', 'subdomain']);
  });

  it("should 400 for a subdomain already used by another customer's tenant", async () => {
    assert.strictEqual((await provision('cust_001', validConfig)).status, 202);

    const res = await provision('cust_002', validConfig);
    const body = await res.json();

    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(body, { errors: { subdomain: 'Subdomain is already in use' } });
  });

  it('should 404 for an unknown customer', async () => {
    const res = await provision('cust_999', validConfig);

    assert.strictEqual(res.status, 404);
    assert.ok((await res.json()).error);
  });

  it('should 409 while provisioning and once active', async () => {
    process.env.PROVISION_DELAY_MS = '200';
    assert.strictEqual((await provision('cust_001', validConfig)).status, 202);

    const whileProvisioning = await provision('cust_001', validConfig);
    assert.strictEqual(whileProvisioning.status, 409);
    assert.ok((await whileProvisioning.json()).error);

    await waitForTenantStatus('cust_001', 'active');

    const whileActive = await provision('cust_001', validConfig);
    assert.strictEqual(whileActive.status, 409);
    assert.ok((await whileActive.json()).error);
  });

  it('POST /api/__reset should restore the seed and cancel pending provisioning', async () => {
    process.env.PROVISION_DELAY_MS = '20';
    await provision('cust_001', validConfig);
    await provision('cust_002', { ...validConfig, subdomain: 'abc-accounting' });

    const res = await request('/api/__reset', { method: 'POST' });
    assert.strictEqual(res.status, 204);

    await wait(50);
    const tenants = await (await request('/api/tenants')).json();
    assert.strictEqual(tenants.length, 1);
    assert.strictEqual(tenants[0].status, 'pending');

    const dashboard = await (await request('/api/onboarding')).json();
    assert.strictEqual(dashboard.length, 4);
    assert.ok(dashboard.every(s => s.progressPercent === 0));
  });
});
