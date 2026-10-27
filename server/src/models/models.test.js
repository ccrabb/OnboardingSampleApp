const { describe, it } = require('node:test');
const assert = require('node:assert');
const { 
  createCustomer, 
  createTenant, 
  validateTenantConfig,
  createDefaultOnboardingSteps, 
  calculateProgress 
} = require('./index');

describe('Domain Models', () => {
  describe('createCustomer', () => {
    it('should create a customer with provided data', () => {
      const customer = createCustomer({
        id: 'test_123',
        name: 'Test Corp',
        industry: 'Tech',
        region: 'EMEA'
      });

      assert.strictEqual(customer.id, 'test_123');
      assert.strictEqual(customer.name, 'Test Corp');
      assert.strictEqual(customer.industry, 'Tech');
      assert.strictEqual(customer.region, 'EMEA');
    });

    it('should generate default values for missing fields', () => {
      const customer = createCustomer({});

      assert.ok(customer.id.startsWith('cust_'));
      assert.strictEqual(customer.name, '');
      assert.ok(customer.createdAt);
    });
  });

  describe('createTenant', () => {
    it('should keep existing defaults and default the new fields', () => {
      const tenant = createTenant({ customerId: 'cust_001' });

      assert.ok(tenant.id.startsWith('tenant_'));
      assert.strictEqual(tenant.customerId, 'cust_001');
      assert.strictEqual(tenant.status, 'pending');
      assert.strictEqual(tenant.plan, 'starter');
      assert.strictEqual(tenant.region, 'us');
      assert.strictEqual(tenant.subdomain, '');
      assert.strictEqual(tenant.adminEmail, '');
      assert.strictEqual(tenant.currency, 'USD');
      assert.strictEqual(tenant.error, null);
      assert.strictEqual(tenant.provisionedAt, null);
      assert.ok(tenant.createdAt);
    });

    it('should use provided provisioning fields', () => {
      const tenant = createTenant({
        region: 'eu',
        subdomain: 'acme',
        adminEmail: 'admin@acme.example.com',
        currency: 'EUR',
        error: 'Timed out',
        provisionedAt: '2025-01-16T10:00:00Z'
      });

      assert.strictEqual(tenant.region, 'eu');
      assert.strictEqual(tenant.subdomain, 'acme');
      assert.strictEqual(tenant.adminEmail, 'admin@acme.example.com');
      assert.strictEqual(tenant.currency, 'EUR');
      assert.strictEqual(tenant.error, 'Timed out');
      assert.strictEqual(tenant.provisionedAt, '2025-01-16T10:00:00Z');
    });
  });

  describe('validateTenantConfig', () => {
    const validConfig = {
      plan: 'professional',
      region: 'us',
      subdomain: 'acme-corp',
      adminEmail: 'admin@acme.example.com',
      currency: 'USD'
    };

    it('should return no errors for a valid config', () => {
      assert.deepStrictEqual(validateTenantConfig(validConfig, [], 'cust_001'), {});
    });

    it('should require every field', () => {
      const errors = validateTenantConfig({}, [], 'cust_001');

      assert.deepStrictEqual(Object.keys(errors).sort(), ['adminEmail', 'currency', 'plan', 'region', 'subdomain']);
    });

    it('should handle a missing config', () => {
      assert.strictEqual(Object.keys(validateTenantConfig(undefined, [], 'cust_001')).length, 5);
    });

    it('should reject an unknown plan', () => {
      const errors = validateTenantConfig({ ...validConfig, plan: 'gold' }, [], 'cust_001');
      assert.deepStrictEqual(Object.keys(errors), ['plan']);
    });

    it('should reject an unknown region', () => {
      const errors = validateTenantConfig({ ...validConfig, region: 'mars' }, [], 'cust_001');
      assert.deepStrictEqual(Object.keys(errors), ['region']);
    });

    it('should reject an unknown currency', () => {
      const errors = validateTenantConfig({ ...validConfig, currency: 'JPY' }, [], 'cust_001');
      assert.deepStrictEqual(Object.keys(errors), ['currency']);
    });

    it('should reject an invalid admin email', () => {
      ['not-an-email', 'a@b', 'a b@c.com', 42].forEach(adminEmail => {
        const errors = validateTenantConfig({ ...validConfig, adminEmail }, [], 'cust_001');
        assert.deepStrictEqual(Object.keys(errors), ['adminEmail'], `expected ${adminEmail} to be rejected`);
      });
    });

    it('should reject subdomains that do not match the pattern', () => {
      ['ab', 'a'.repeat(31), 'Acme', 'acme_corp', 'acme.corp', ' acme', 123].forEach(subdomain => {
        const errors = validateTenantConfig({ ...validConfig, subdomain }, [], 'cust_001');
        assert.deepStrictEqual(Object.keys(errors), ['subdomain'], `expected ${subdomain} to be rejected`);
      });
    });

    it('should accept subdomains at the length limits', () => {
      ['abc', 'a'.repeat(30), '123-abc'].forEach(subdomain => {
        assert.deepStrictEqual(validateTenantConfig({ ...validConfig, subdomain }, [], 'cust_001'), {});
      });
    });

    it("should reject a subdomain used by another customer's tenant", () => {
      const existing = [{ customerId: 'cust_002', subdomain: 'acme-corp' }];
      const errors = validateTenantConfig(validConfig, existing, 'cust_001');

      assert.deepStrictEqual(errors, { subdomain: 'Subdomain is already in use' });
    });

    it("should allow a customer to reuse its own tenant's subdomain", () => {
      const existing = [{ customerId: 'cust_001', subdomain: 'acme-corp' }];
      assert.deepStrictEqual(validateTenantConfig(validConfig, existing, 'cust_001'), {});
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for empty steps', () => {
      assert.strictEqual(calculateProgress([]), 0);
      assert.strictEqual(calculateProgress(null), 0);
    });

    it('should calculate correct percentage', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'pending' },
        { status: 'pending' }
      ];
      assert.strictEqual(calculateProgress(steps), 50);
    });

    it('should return 100 when all steps completed', () => {
      const steps = [
        { status: 'completed' },
        { status: 'completed' }
      ];
      assert.strictEqual(calculateProgress(steps), 100);
    });
  });

  describe('createDefaultOnboardingSteps', () => {
    it('should create 4 default steps', () => {
      const steps = createDefaultOnboardingSteps();
      
      assert.strictEqual(steps.length, 4);
      assert.strictEqual(steps[0].name, 'Customer Info');
      assert.strictEqual(steps[3].name, 'Import');
    });

    it('should set all steps to pending status', () => {
      const steps = createDefaultOnboardingSteps();
      
      steps.forEach(step => {
        assert.strictEqual(step.status, 'pending');
      });
    });
  });
});
