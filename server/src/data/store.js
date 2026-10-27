/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const { createCustomer, createTenant, createDefaultOnboardingSteps } = require('../models');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: []
};

// Seed with example data
function seedData() {
  // Example customer - Acme Corporation
  const exampleCustomer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example tenant for Acme
  const exampleTenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example onboarding state - just started, nothing completed
  const exampleOnboardingState = {
    customerId: 'cust_001',
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  };

  store.customers.push(exampleCustomer);
  store.tenants.push(exampleTenant);
  store.onboardingStates.push(exampleOnboardingState);

  // Sample-data customers (see /sample-data) - not yet provisioned, so no tenant
  const sampleCustomers = [
    {
      id: 'cust_002',
      name: 'ABC Accounting',
      industry: 'Accounting',
      region: 'North America',
      contactEmail: 'onboarding@abcaccounting.example.com',
      createdAt: '2025-02-03T09:00:00Z'
    },
    {
      id: 'cust_003',
      name: 'XYZ Financial Services',
      industry: 'Financial Services',
      region: 'North America',
      contactEmail: 'onboarding@xyzfinancial.example.com',
      createdAt: '2025-02-10T14:30:00Z'
    },
    {
      id: 'cust_004',
      name: 'Premier Bookkeeping',
      industry: 'Bookkeeping',
      region: 'United Kingdom',
      contactEmail: 'onboarding@premierbookkeeping.example.co.uk',
      createdAt: '2025-02-17T11:15:00Z'
    }
  ];

  sampleCustomers.forEach(data => {
    store.customers.push(createCustomer(data));
    store.onboardingStates.push({
      customerId: data.id,
      steps: createDefaultOnboardingSteps(),
      progressPercent: 0
    });
  });
}

// Initialize with seed data
seedData();

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  store.customers.push(customer);
  return customer;
}

function getTenants() {
  return [...store.tenants];
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function updateTenant(customerId, updates) {
  const index = store.tenants.findIndex(t => t.customerId === customerId);
  if (index !== -1) {
    store.tenants[index] = { ...store.tenants[index], ...updates };
    return store.tenants[index];
  }
  return null;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

// Clears all data and restores the seed (used by tests via POST /api/__reset)
function reset() {
  store.customers = [];
  store.tenants = [];
  store.onboardingStates = [];
  seedData();
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  updateTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState,
  reset
};
