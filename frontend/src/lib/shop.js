import { apiUrl, hasBackend } from './api.js';

// Paying online with Razorpay Standard Checkout (backend routes/shop.js).
// The server makes the order and the Razorpay order; the customer pays in
// Razorpay's own window; the signed answer comes back to the server, which
// confirms the order. If the browser closes before that, Razorpay's
// notification confirms it anyway.

export const GST_STATES = [
  ['33', 'Tamil Nadu'], ['32', 'Kerala'], ['29', 'Karnataka'], ['37', 'Andhra Pradesh'], ['36', 'Telangana'], ['34', 'Puducherry'],
  ['27', 'Maharashtra'], ['30', 'Goa'], ['24', 'Gujarat'], ['07', 'Delhi'], ['09', 'Uttar Pradesh'], ['06', 'Haryana'], ['08', 'Rajasthan'],
  ['23', 'Madhya Pradesh'], ['22', 'Chhattisgarh'], ['21', 'Odisha'], ['19', 'West Bengal'], ['10', 'Bihar'], ['20', 'Jharkhand'],
  ['18', 'Assam'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['02', 'Himachal Pradesh'], ['01', 'Jammu and Kashmir'], ['38', 'Ladakh'],
  ['05', 'Uttarakhand'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'],
  ['16', 'Tripura'], ['17', 'Meghalaya'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['31', 'Lakshadweep'], ['35', 'Andaman and Nicobar Islands'],
];

async function call(path, body) {
  if (!hasBackend) throw Object.assign(new Error('Ordering on the website isn’t available right now.'), { status: 0 });
  let response;
  try {
    response = await fetch(`${apiUrl}/api/shop${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Could not reach the shop. Check your connection and try again.'), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again, or WhatsApp us.'), { fields: data.fields, code: data.code, status: response.status });
  return data;
}

// What can be paid for online: { online, items: [{ item_id, slug, pack_label, ... }] }.
export async function loadCatalog() {
  if (!hasBackend) return { online: false, items: [] };
  try {
    return await call('/catalog');
  } catch {
    return { online: false, items: [] };
  }
}

const packKey = (label) => String(label || '').toLowerCase().replace(/\s+/g, '');

// The cart's lines as the server's items; lists any that can't be paid online.
export function matchCart(items, catalog) {
  const lines = [];
  const missing = [];
  for (const it of items) {
    const found = catalog.items.find((c) => c.slug === it.id && packKey(c.pack_label) === packKey(it.size));
    if (found && found.available) lines.push({ itemId: found.item_id, qty: it.qty });
    else missing.push(`${it.product?.name || it.id} (${it.size})`);
  }
  return { lines, missing };
}

let scriptPromise = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not open the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// The customer's details as the server takes them.
const customer = (details) => ({
  name: details.name,
  phone: details.phone,
  email: details.email || '',
  notes: [details.landmark && `Landmark: ${details.landmark}`, details.notes].filter(Boolean).join(' · '),
  address: { line1: details.address, city: details.city, pincode: details.pincode, stateCode: details.stateCode || '33' },
});

// An order paid on delivery (cash or UPI) or at pickup: saved straight into
// the shop's Orders as New, for the staff to confirm. Resolves with
// { orderNumber, totalPaise }.
export async function placeOrder({ details, lines }) {
  const placed = await call('/order', { ...customer(details), method: details.method, payment: details.payment, lines });
  return { orderNumber: placed.orderNumber, totalPaise: placed.totalPaise };
}

// Makes the order and opens Razorpay. Resolves with { orderNumber, amountPaise }
// once paid and confirmed; rejects if the customer closes the window or it fails.
export async function payOnline({ details, lines }) {
  const order = await call('/checkout', { ...customer(details), lines });
  await loadRazorpay();
  const answer = await new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.razorpay.keyId,
      order_id: order.razorpay.orderId,
      amount: order.razorpay.amount,
      currency: order.razorpay.currency,
      name: 'Cholan Rice',
      description: `Order ${order.orderNumber}`,
      prefill: { name: details.name, contact: details.phone, email: details.email || undefined },
      notes: { order_number: order.orderNumber },
      theme: { color: '#1b4d33' },
      handler: resolve,
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment not completed. Nothing was charged; you can try again.'), { code: 'dismissed' })) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'The payment failed. No money was taken; please try again.')));
    rzp.open();
  });
  const done = await call('/verify', answer);
  return { orderNumber: done.orderNumber || order.orderNumber, amountPaise: order.amountPaise };
}
