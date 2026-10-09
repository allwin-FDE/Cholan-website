import { formatPrice } from '../../lib/format';

// localStorage key for remembered customer details (original `Mm`).
export const DETAILS_STORAGE_KEY = 'cholan-checkout-details-v1';

// Blank form (original `Nm`).
export const emptyDetails = {
  name: '',
  phone: '',
  method: 'delivery',
  address: '',
  city: '',
  pincode: '',
  landmark: '',
  payment: 'cod',
  notes: '',
};

// Saved details from a previous order, never including notes (original `Pm`).
export const loadSavedDetails = () => {
  try {
    return { ...emptyDetails, ...JSON.parse(localStorage.getItem(DETAILS_STORAGE_KEY) || '{}'), notes: '' };
  } catch {
    return emptyDetails;
  }
};

// Payment option labels (original `Fm`).
export const paymentLabels = { cod: 'Cash on delivery', upi: 'UPI / GPay on delivery' };

// e.g. CR-081026-4821 (original `Im`).
export const makeOrderId = () => {
  const now = new Date();
  const stamp = [now.getDate(), now.getMonth() + 1, now.getFullYear() % 100]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  return `CR-${stamp}-${Math.floor(1e3 + Math.random() * 9e3)}`;
};

// Returns { field: message } for invalid fields (original `Lm`).
export const validateDetails = (details) => {
  const errors = {};
  if (details.name.trim().length < 2) errors.name = 'Please enter your name.';
  if (!/^[6-9]\d{9}$/.test(details.phone.replace(/\D/g, '').slice(-10))) {
    errors.phone = 'Enter a 10-digit mobile number.';
  }
  if (details.method === 'delivery') {
    if (details.address.trim().length < 6) errors.address = 'Please enter your full address.';
    if (!details.city.trim()) errors.city = 'Please enter your city.';
    if (!/^\d{6}$/.test(details.pincode.trim())) errors.pincode = 'Enter a 6-digit pincode.';
  }
  return errors;
};

// WhatsApp order text (original `Rm`).
export const buildOrderMessage = (orderId, items, total, hasUnpriced, details) =>
  [
    `*New order ${orderId}*`,
    '',
    ...items.map((item) => {
      const size = item.size ? ` (${item.size})` : '';
      const price = item.total == null ? 'price on request' : formatPrice(item.total);
      return `• ${item.product.name}${size} × ${item.qty} — ${price}`;
    }),
    '',
    `*Total: ${formatPrice(total)}*${hasUnpriced ? ' + items priced on request' : ''}`,
    '',
    `Name: ${details.name.trim()}`,
    `Phone: ${details.phone.trim()}`,
    details.method === 'pickup'
      ? 'Collection: Pickup from the mill'
      : `Deliver to: ${[
          details.address,
          details.landmark && `near ${details.landmark}`,
          details.city,
          details.pincode,
        ]
          .filter(Boolean)
          .map((part) => part.trim())
          .join(', ')}`,
    `Payment: ${paymentLabels[details.payment]}`,
    details.notes.trim() ? `Notes: ${details.notes.trim()}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
