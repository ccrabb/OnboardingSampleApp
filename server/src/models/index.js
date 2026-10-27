/**
 * Domain Models for Customer Onboarding
 */

/**
 * @typedef {Object} Customer
 * @property {string} id - Unique customer identifier
 * @property {string} name - Customer/company name
 * @property {string} industry - Industry vertical
 * @property {string} region - Geographic region
 * @property {string} contactEmail - Primary contact email
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} Tenant
 * @property {string} id - Unique tenant identifier
 * @property {string} customerId - Associated customer ID
 * @property {string} status - 'pending' | 'provisioning' | 'active' | 'failed'
 * @property {string} plan - 'starter' | 'professional' | 'enterprise'
 * @property {string} region - 'us' | 'eu' | 'apac'
 * @property {string} subdomain - Unique tenant subdomain
 * @property {string} adminEmail - Tenant administrator email
 * @property {string} currency - 'USD' | 'GBP' | 'EUR'
 * @property {string|null} error - Last provisioning error, if any
 * @property {string|null} provisionedAt - ISO timestamp, set when provisioning completes
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} OnboardingStep
 * @property {string} id - Step identifier
 * @property {string} name - Human-readable step name
 * @property {string} status - 'pending' | 'in_progress' | 'completed' | 'failed'
 * @property {number} order - Step sequence number
 */

/**
 * @typedef {Object} OnboardingState
 * @property {string} customerId - Associated customer ID
 * @property {OnboardingStep[]} steps - Array of onboarding steps
 * @property {number} progressPercent - Overall progress (0-100)
 */

/**
 * Creates a new Customer object
 * @param {Partial<Customer>} data 
 * @returns {Customer}
 */
function createCustomer(data) {
  return {
    id: data.id || `cust_${Date.now()}`,
    name: data.name || '',
    industry: data.industry || '',
    region: data.region || '',
    contactEmail: data.contactEmail || '',
    createdAt: data.createdAt || new Date().toISOString()
  };
}

/**
 * Creates a new Tenant object
 * @param {Partial<Tenant>} data 
 * @returns {Tenant}
 */
function createTenant(data) {
  return {
    id: data.id || `tenant_${Date.now()}`,
    customerId: data.customerId || '',
    status: data.status || 'pending',
    plan: data.plan || 'starter',
    region: data.region || 'us',
    subdomain: data.subdomain || '',
    adminEmail: data.adminEmail || '',
    currency: data.currency || 'USD',
    error: data.error || null,
    provisionedAt: data.provisionedAt || null,
    createdAt: data.createdAt || new Date().toISOString()
  };
}

const TENANT_PLANS = ['starter', 'professional', 'enterprise'];
const TENANT_REGIONS = ['us', 'eu', 'apac'];
const TENANT_CURRENCIES = ['USD', 'GBP', 'EUR'];
const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a tenant provisioning config
 * @param {Object} config - { plan, region, subdomain, adminEmail, currency }
 * @param {Tenant[]} existingTenants - Used to check subdomain uniqueness
 * @param {string} customerId - Customer being provisioned; its own tenant may keep its subdomain
 * @returns {Object<string, string>} Errors keyed by field, empty when valid
 */
function validateTenantConfig(config, existingTenants, customerId) {
  const { plan, region, subdomain, adminEmail, currency } = config || {};
  const errors = {};

  if (!plan) {
    errors.plan = 'Plan is required';
  } else if (!TENANT_PLANS.includes(plan)) {
    errors.plan = `Plan must be one of: ${TENANT_PLANS.join(', ')}`;
  }

  if (!region) {
    errors.region = 'Region is required';
  } else if (!TENANT_REGIONS.includes(region)) {
    errors.region = `Region must be one of: ${TENANT_REGIONS.join(', ')}`;
  }

  if (!subdomain) {
    errors.subdomain = 'Subdomain is required';
  } else if (typeof subdomain !== 'string' || !SUBDOMAIN_PATTERN.test(subdomain)) {
    errors.subdomain = 'Subdomain must be 3-30 characters: lowercase letters, numbers and hyphens';
  } else if ((existingTenants || []).some(t => t.subdomain === subdomain && t.customerId !== customerId)) {
    errors.subdomain = 'Subdomain is already in use';
  }

  if (!adminEmail) {
    errors.adminEmail = 'Admin email is required';
  } else if (typeof adminEmail !== 'string' || !EMAIL_PATTERN.test(adminEmail)) {
    errors.adminEmail = 'Admin email must be a valid email address';
  }

  if (!currency) {
    errors.currency = 'Currency is required';
  } else if (!TENANT_CURRENCIES.includes(currency)) {
    errors.currency = `Currency must be one of: ${TENANT_CURRENCIES.join(', ')}`;
  }

  return errors;
}

/**
 * Creates default onboarding steps
 * @returns {OnboardingStep[]}
 */
function createDefaultOnboardingSteps() {
  return [
    { id: 'step_1', name: 'Customer Info', status: 'pending', order: 1 },
    { id: 'step_2', name: 'Data Mapping', status: 'pending', order: 2 },
    { id: 'step_3', name: 'Tenant Setup', status: 'pending', order: 3 },
    { id: 'step_4', name: 'Import', status: 'pending', order: 4 }
  ];
}

/**
 * Calculates progress percentage from steps
 * @param {OnboardingStep[]} steps 
 * @returns {number}
 */
function calculateProgress(steps) {
  if (!steps || steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed').length;
  return Math.round((completed / steps.length) * 100);
}

module.exports = {
  createCustomer,
  createTenant,
  validateTenantConfig,
  createDefaultOnboardingSteps,
  calculateProgress
};
