const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const store = require('./store');

describe('Data Store', () => {
  beforeEach(() => {
    store.reset();
  });

  describe('seed data', () => {
    it('should seed four customers, each with an onboarding state', () => {
      const ids = store.getCustomers().map(c => c.id);

      assert.deepStrictEqual(ids, ['cust_001', 'cust_002', 'cust_003', 'cust_004']);
      ids.forEach(id => {
        const state = store.getOnboardingState(id);
        assert.strictEqual(state.steps.length, 4);
        assert.strictEqual(state.progressPercent, 0);
      });
    });

    it('should only give Acme a tenant', () => {
      const tenants = store.getTenants();

      assert.strictEqual(tenants.length, 1);
      assert.strictEqual(tenants[0].id, 'tenant_001');
      assert.strictEqual(tenants[0].customerId, 'cust_001');
      assert.strictEqual(tenants[0].status, 'pending');
      assert.strictEqual(tenants[0].plan, 'professional');
    });

    it('should seed the sample-data customers with their regions', () => {
      assert.strictEqual(store.getCustomerById('cust_002').name, 'ABC Accounting');
      assert.strictEqual(store.getCustomerById('cust_003').name, 'XYZ Financial Services');
      assert.strictEqual(store.getCustomerById('cust_004').name, 'Premier Bookkeeping');
      assert.strictEqual(store.getCustomerById('cust_004').region, 'United Kingdom');
    });
  });

  describe('updateTenant', () => {
    it('should merge updates into the tenant', () => {
      const updated = store.updateTenant('cust_001', { status: 'provisioning', subdomain: 'acme' });

      assert.strictEqual(updated.status, 'provisioning');
      assert.strictEqual(updated.subdomain, 'acme');
      assert.strictEqual(updated.plan, 'professional');
      assert.deepStrictEqual(store.getTenantByCustomerId('cust_001'), updated);
    });

    it('should return null for a customer without a tenant', () => {
      assert.strictEqual(store.updateTenant('cust_002', { status: 'active' }), null);
    });
  });

  describe('reset', () => {
    it('should discard changes and restore the seed', () => {
      store.updateTenant('cust_001', { status: 'active' });
      store.addTenant({ id: 'tenant_002', customerId: 'cust_002', status: 'active' });
      store.addCustomer({ id: 'cust_999', name: 'Extra' });
      store.getOnboardingState('cust_001').steps[0].status = 'completed';

      store.reset();

      assert.strictEqual(store.getCustomers().length, 4);
      assert.strictEqual(store.getTenants().length, 1);
      assert.strictEqual(store.getTenantByCustomerId('cust_001').status, 'pending');
      assert.strictEqual(store.getOnboardingState('cust_001').steps[0].status, 'pending');
    });
  });
});
