import React, { useState, useEffect } from 'react';

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' }
];

const REGIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
  { value: 'apac', label: 'APAC' }
];

const CURRENCIES = ['USD', 'GBP', 'EUR'];

// Tenant region and billing currency suggested for each customer region
const REGION_DEFAULTS = {
  'North America': { region: 'us', currency: 'USD' },
  'United Kingdom': { region: 'eu', currency: 'GBP' },
  'Europe': { region: 'eu', currency: 'EUR' }
};
const FALLBACK_REGION = { region: 'us', currency: 'USD' };

const STATUS_LABELS = {
  pending: 'Pending',
  provisioning: 'Provisioning',
  active: 'Active',
  failed: 'Failed'
};

// Tenant status -> existing .step-status colour variant
const STATUS_CLASSES = {
  pending: 'pending',
  provisioning: 'in_progress',
  active: 'completed',
  failed: 'failed'
};

const FORM_FIELDS = ['plan', 'region', 'subdomain', 'adminEmail', 'currency'];

const POLL_INTERVAL_MS = 1000;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
}

function initialForm(customer) {
  const { region, currency } = REGION_DEFAULTS[customer.region] || FALLBACK_REGION;
  return {
    plan: 'starter',
    region,
    subdomain: slugify(customer.name),
    adminEmail: customer.contactEmail,
    currency
  };
}

// Resolves to the customer's tenant, or null when they don't have one yet
function fetchTenant(customerId) {
  return fetch(`/api/tenants/${customerId}`).then(async (res) => {
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

function TenantSetup() {
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/customers')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setCustomers(data);
        setSelectedId(data[0]?.id || '');
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch customers:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load customers</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (customers.length === 0) {
    return <div className="placeholder"><p>No customers to set up</p></div>;
  }

  const customer = customers.find(c => c.id === selectedId);

  return (
    <div>
      <h2>Tenant Setup</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Provision and configure customer tenant
      </p>

      <div className="form-field customer-picker">
        <label htmlFor="tenant-customer">Customer</label>
        <select
          id="tenant-customer"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
        >
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Keyed by customer so form state, requests and polling reset on every switch */}
      {customer && <TenantForm key={customer.id} customer={customer} />}
    </div>
  );
}

function TenantForm({ customer }) {
  // undefined while loading, null when the customer has no tenant yet
  const [tenant, setTenant] = useState(undefined);
  const [form, setForm] = useState(() => initialForm(customer));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const status = tenant?.status;

  useEffect(() => {
    let ignore = false;
    fetchTenant(customer.id)
      .then(data => {
        if (ignore) return;
        setTenant(data);
        if (data?.plan) setForm(f => ({ ...f, plan: data.plan }));
      })
      .catch(err => {
        if (ignore) return;
        console.error('Failed to fetch tenant:', err);
        setFormError(`Failed to load tenant: ${err.message}`);
      });
    return () => { ignore = true; };
  }, [customer.id]);

  // Poll while provisioning; the cleanup stops it once the status settles,
  // when another customer is picked, and when the tab is closed
  useEffect(() => {
    if (status !== 'provisioning') return;
    let ignore = false;
    const timer = setInterval(() => {
      fetchTenant(customer.id)
        .then(data => {
          if (!ignore) setTenant(data);
        })
        .catch(err => console.error('Failed to poll tenant:', err));
    }, POLL_INTERVAL_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [customer.id, status]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const res = await fetch(`/api/tenants/${customer.id}/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setTenant(body);
      } else if (res.status === 400 && body.errors) {
        setFieldErrors(body.errors);
      } else {
        setFormError(`Could not provision tenant: ${body.error || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      console.error('Failed to provision tenant:', err);
      setFormError(`Could not provision tenant: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const canProvision = !submitting && status !== 'provisioning' && status !== 'active';
  const otherErrors = Object.entries(fieldErrors).filter(([field]) => !FORM_FIELDS.includes(field));

  return (
    <div className="tenant-setup">
      {tenant !== undefined && (
        <p className="tenant-status-row">
          <span>Status</span>
          <span
            data-testid="tenant-status"
            className={`step-status tenant-status ${tenant ? STATUS_CLASSES[tenant.status] : 'pending'}`}
          >
            {tenant ? STATUS_LABELS[tenant.status] || tenant.status : 'No tenant yet'}
          </span>
        </p>
      )}
      {status === 'failed' && tenant.error && (
        <p className="form-error">⚠️ {tenant.error}</p>
      )}

      <form className="tenant-form" onSubmit={handleSubmit} noValidate>
        <Field id="tenant-plan" label="Plan" field="plan" errors={fieldErrors}>
          <select id="tenant-plan" name="plan" value={form.plan} onChange={handleChange}>
            {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>

        <Field id="tenant-region" label="Region" field="region" errors={fieldErrors}>
          <select id="tenant-region" name="region" value={form.region} onChange={handleChange}>
            {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>

        <Field id="tenant-currency" label="Currency" field="currency" errors={fieldErrors}>
          <select id="tenant-currency" name="currency" value={form.currency} onChange={handleChange}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field id="tenant-subdomain" label="Subdomain" field="subdomain" errors={fieldErrors}>
          <input
            id="tenant-subdomain"
            name="subdomain"
            type="text"
            value={form.subdomain}
            onChange={handleChange}
            autoComplete="off"
          />
        </Field>

        <Field id="tenant-admin-email" label="Admin email" field="adminEmail" errors={fieldErrors}>
          <input
            id="tenant-admin-email"
            name="adminEmail"
            type="text"
            inputMode="email"
            value={form.adminEmail}
            onChange={handleChange}
            autoComplete="off"
          />
        </Field>

        <div className="form-actions">
          {otherErrors.map(([field, message]) => (
            <p key={field} className="field-error" data-testid={`error-${field}`}>{message}</p>
          ))}
          {formError && <p className="form-error" role="alert">⚠️ {formError}</p>}
          <button type="submit" className="button-primary" disabled={!canProvision}>
            Provision tenant
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ id, label, field, errors, children }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {errors[field] && (
        <p className="field-error" data-testid={`error-${field}`}>{errors[field]}</p>
      )}
    </div>
  );
}

export default TenantSetup;
