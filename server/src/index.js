const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const { provisionTenant, cancelPendingProvisioning } = require('./services/provisioning');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();
  
  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || ''
    };
  });
  
  res.json(dashboard);
});

// Get all tenants
app.get('/api/tenants', (req, res) => {
  res.json(store.getTenants());
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Start provisioning a tenant (completes asynchronously)
app.post('/api/tenants/:customerId/provision', (req, res) => {
  const result = provisionTenant(req.params.customerId, req.body);
  if (result.ok) {
    return res.status(202).json(result.tenant);
  }
  switch (result.reason) {
    case 'not_found':
      return res.status(404).json({ error: 'Customer not found' });
    case 'conflict':
      return res.status(409).json({ error: result.error });
    default:
      return res.status(400).json({ errors: result.errors });
  }
});

// Restore seed data and cancel pending provisioning (used by e2e tests)
app.post('/api/__reset', (req, res) => {
  cancelPendingProvisioning();
  store.reset();
  res.status(204).end();
});

// Start server when run directly (tests import the app and listen on their own port)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
