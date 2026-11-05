import { createContext, useContext, useEffect } from 'react';
import { adminFetch } from '../dashboard/api.js';
import { Badge, useLoad } from '../dashboard/ui.jsx';
import { products } from '../data/products.js';

// Who is signed in, for every warehouse page. `level` is staff, manager or admin.
export const WhContext = createContext(null);
export const useWh = () => useContext(WhContext);

const call = (path, options) => adminFetch(path, { ...options, base: '/api/warehouse' });
const send = (method) => (path, body) => call(path, { method, body: body ?? {} });
export const wh = { get: (path) => call(path), post: send('POST'), patch: send('PATCH'), put: send('PUT'), del: send('DELETE') };

export const STEPS = {
  new: { label: 'New', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  packing: { label: 'Packing', tone: 'info' },
  packed: { label: 'Packed', tone: 'info' },
  dispatched: { label: 'Dispatched', tone: 'good' },
  delivered: { label: 'Delivered', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  returned: { label: 'Returned', tone: 'muted' },
};
export const FLOW = ['new', 'confirmed', 'packing', 'packed', 'dispatched', 'delivered'];
export const FORWARD = { new: 'confirmed', confirmed: 'packing', packing: 'packed', packed: 'dispatched', dispatched: 'delivered' };
export const FORWARD_LABEL = { new: 'Confirm order', confirmed: 'Start packing', packing: 'Mark packed', packed: 'Mark dispatched', dispatched: 'Mark delivered' };
export const BACK = { packing: 'confirmed', packed: 'packing' };
export const SOURCES = { phone: 'Phone', 'walk-in': 'Walk-in', whatsapp: 'WhatsApp', enquiry: 'Enquiry', website: 'Website', other: 'Other' };
export const METHODS = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque', other: 'Other' };
export const PAYMENT = {
  'not-priced': { label: 'No price', tone: 'muted' },
  unpaid: { label: 'Unpaid', tone: 'warn' },
  part: { label: 'Part paid', tone: 'info' },
  paid: { label: 'Paid', tone: 'good' },
};
export const STATES = ['Tamil Nadu', 'Puducherry', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana', 'Maharashtra', 'Goa', 'Gujarat', 'Delhi', 'Odisha', 'West Bengal', 'Other'];

export const StepBadge = ({ status }) => <Badge tone={STEPS[status]?.tone}>{STEPS[status]?.label || status}</Badge>;
export const PaidBadge = ({ status }) => (PAYMENT[status] ? <Badge tone={PAYMENT[status].tone}>{PAYMENT[status].label}</Badge> : null);

const rupeeFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupees = (paise) => `₹${rupeeFormat.format((paise || 0) / 100)}`;
export const stockKey = (productId, pack) => `${productId}__${String(pack).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const bags = (items) => (items || []).reduce((sum, item) => sum + item.qty, 0);

// Every product and size on sale, from the site's own catalogue, so a new
// product appears here by itself.
export const CATALOGUE = products.flatMap((product) =>
  product.packs.map((pack) => ({ key: stockKey(product.id, pack.size), productId: product.id, name: product.name, pack: pack.size })),
);

// The page's data, kept fresh while the tab is open.
export function useLive(load, deps = []) {
  const state = useLoad(load, deps);
  const { reload } = state;
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) reload();
    }, 30000);
    return () => clearInterval(timer);
  }, [reload]);
  return state;
}

export function WhHead({ title, intro, actions }) {
  return (
    <header className="dash-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="dash-head__tools wh-noprint">{actions}</div>}
    </header>
  );
}

export const Field = ({ label, hint, error, children, className = '' }) => (
  <label className={`dash-field ${className}${error ? ' has-error' : ''}`}>
    <span className="dash-field__label">{label}</span>
    {children}
    {error ? <span className="dash-field-error">{error}</span> : hint && <span className="dash-field__hint">{hint}</span>}
  </label>
);

export const PrintButton = ({ label = 'Print' }) => (
  <button type="button" className="dash-btn dash-btn--ghost" onClick={() => window.print()}>
    {label}
  </button>
);
