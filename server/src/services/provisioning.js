/**
 * Tenant Provisioning Service
 * Simulates async provisioning: the tenant goes to 'provisioning' immediately
 * and is marked 'active' after a delay.
 */

const store = require('../data/store');
const { createTenant, validateTenantConfig, calculateProgress } = require('../models');

const DEFAULT_PROVISION_DELAY_MS = 2000;
const TENANT_SETUP_STEP_ID = 'step_3';

// Pending completion timers, keyed by customer ID, so they can be cancelled on reset
const pendingTimers = new Map();

function getDefaultDelayMs() {
  const raw = process.env.PROVISION_DELAY_MS;
  const parsed = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PROVISION_DELAY_MS;
  }
  return parsed;
}

function nextTenantId() {
  return `tenant_${String(store.getTenants().length + 1).padStart(3, '0')}`;
}

function completeProvisioning(customerId) {
  const tenant = store.getTenantByCustomerId(customerId);
  if (!tenant || tenant.status !== 'provisioning') return;

  store.updateTenant(customerId, {
    status: 'active',
    error: null,
    provisionedAt: new Date().toISOString()
  });

  const state = store.getOnboardingState(customerId);
  if (state) {
    const steps = state.steps.map(step =>
      step.id === TENANT_SETUP_STEP_ID ? { ...step, status: 'completed' } : step
    );
    store.updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
  }
}

/**
 * Starts provisioning a tenant for a customer
 * @param {string} customerId
 * @param {Object} config - { plan, region, subdomain, adminEmail, currency }
 * @param {{ delayMs?: number }} [options] - delayMs defaults to PROVISION_DELAY_MS or 2000
 * @returns {{ ok: true, tenant: Object }
 *   | { ok: false, reason: 'not_found' }
 *   | { ok: false, reason: 'conflict', error: string }
 *   | { ok: false, reason: 'invalid', errors: Object<string, string> }}
 */
function provisionTenant(customerId, config, { delayMs = getDefaultDelayMs() } = {}) {
  if (!store.getCustomerById(customerId)) {
    return { ok: false, reason: 'not_found' };
  }

  const existing = store.getTenantByCustomerId(customerId);
  if (existing && (existing.status === 'provisioning' || existing.status === 'active')) {
    return { ok: false, reason: 'conflict', error: `Tenant is already ${existing.status}` };
  }

  const errors = validateTenantConfig(config, store.getTenants(), customerId);
  if (Object.keys(errors).length > 0) {
    return { ok: false, reason: 'invalid', errors };
  }

  const { plan, region, subdomain, adminEmail, currency } = config;
  const updates = {
    plan,
    region,
    subdomain,
    adminEmail,
    currency,
    status: 'provisioning',
    error: null,
    provisionedAt: null
  };

  const tenant = existing
    ? store.updateTenant(customerId, updates)
    : store.addTenant(createTenant({ id: nextTenantId(), customerId, ...updates }));

  clearTimeout(pendingTimers.get(customerId));
  pendingTimers.set(customerId, setTimeout(() => {
    pendingTimers.delete(customerId);
    completeProvisioning(customerId);
  }, delayMs));

  return { ok: true, tenant };
}

// Cancels all scheduled completions (used alongside store.reset())
function cancelPendingProvisioning() {
  pendingTimers.forEach(timer => clearTimeout(timer));
  pendingTimers.clear();
}

module.exports = {
  provisionTenant,
  cancelPendingProvisioning
};
