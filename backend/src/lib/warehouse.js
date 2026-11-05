// The warehouse's rules, with no database in them: what an order may contain,
// which step may follow which, and how money and tax are worked out. All money
// is in whole paise. routes/warehouse.js applies these to the stored data.

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export const SOURCES = ['phone', 'walk-in', 'whatsapp', 'enquiry', 'website', 'other'];
export const PAYMENT_METHODS = ['cash', 'upi', 'bank', 'cheque', 'other'];

// Which step may follow which. Going back one step corrects a mistake before
// the bags have left; after dispatch the only way back is a return.
export const NEXT_STEPS = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['packed', 'confirmed', 'cancelled'],
  packed: ['dispatched', 'packing', 'cancelled'],
  dispatched: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};
export const MANAGER_STEPS = ['cancelled', 'returned'];
export const canMove = (from, to) => Boolean(NEXT_STEPS[from]?.includes(to));

// What a step does to the stock, for each bag on the order.
export function stockEffect(from, to, condition = 'good') {
  if (to === 'confirmed' && from === 'new') return { type: 'reserve', onHand: 0, reserved: 1, damaged: 0 };
  if (to === 'dispatched') return { type: 'dispatch', onHand: -1, reserved: -1, damaged: 0 };
  if (to === 'cancelled' && from !== 'new') return { type: 'release', onHand: 0, reserved: -1, damaged: 0 };
  if (to === 'returned') {
    return condition === 'damaged'
      ? { type: 'return-damaged', onHand: 0, reserved: 0, damaged: 1 }
      : { type: 'return', onHand: 1, reserved: 0, damaged: 0 };
  }
  return null;
}

export const stockId = (productId, pack) => `${productId}__${String(pack).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// A sum in rupees, as typed, to paise. Null when it is not a usable amount.
export function toPaise(value) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, '').trim());
  if (value === '' || value == null || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const validRate = (rate) => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 40;

// One line's taxable value and tax. Prices may already include the tax.
export function lineTax(grossPaise, ratePercent, inclusive) {
  const rate = Math.round((ratePercent || 0) * 100); // 2.5% is 250
  if (inclusive) {
    const taxable = Math.round((grossPaise * 10000) / (10000 + rate));
    return { taxablePaise: taxable, taxPaise: grossPaise - taxable };
  }
  const tax = Math.round((grossPaise * rate) / 10000);
  return { taxablePaise: grossPaise, taxPaise: tax };
}

// The whole order or invoice. Tamil Nadu buyers pay CGST and SGST, half each;
// buyers in other states pay IGST. The total is rounded to the rupee.
export function computeTotals(items, { inclusive = true, interstate = false } = {}) {
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const lines = items.map((item) => {
    const gross = (item.unitPaise || 0) * item.qty;
    const { taxablePaise, taxPaise } = lineTax(gross, item.gstRate, inclusive);
    const half = Math.floor(taxPaise / 2);
    const line = interstate
      ? { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise }
      : { cgstPaise: half, sgstPaise: taxPaise - half, igstPaise: 0 };
    taxable += taxablePaise;
    cgst += line.cgstPaise;
    sgst += line.sgstPaise;
    igst += line.igstPaise;
    return { ...item, taxablePaise, ...line, totalPaise: taxablePaise + taxPaise };
  });
  const exact = taxable + cgst + sgst + igst;
  const total = Math.round(exact / 100) * 100;
  return {
    lines,
    taxablePaise: taxable,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    roundOffPaise: total - exact,
    totalPaise: total,
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const underHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const underThousand = (n) =>
  n < 100 ? underHundred(n) : `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underHundred(n % 100)}` : ''}`;

// The Indian way: lakh and crore.
function wholeInWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${wholeInWords(crore)} Crore`);
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ');
}

export function amountInWords(paise) {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Rupees ${wholeInWords(rupees)}${rest ? ` and ${underHundred(rest)} Paise` : ''} Only`;
}

// April to March, in India's time: "26-27".
export function financialYear(date = new Date()) {
  const india = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const year = india.getUTCFullYear();
  const start = india.getUTCMonth() >= 3 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

export const paymentStatus = (order) => {
  if (!order.totalPaise) return 'not-priced';
  if ((order.paidPaise || 0) <= 0) return 'unpaid';
  return order.paidPaise >= order.totalPaise ? 'paid' : 'part';
};

export const DEFAULT_SETTINGS = {
  pricesIncludeGst: true,
  defaultHsn: '1006',
  prices: {}, // by stock id, in paise
  gst: {}, // by product id: the percentage
  hsn: {}, // by product id
  seller: {
    legalName: 'Cholan Rice and Millet Shops Private Limited',
    addressLine1: '32/A2, SP Kannusamy Gounder St',
    addressLine2: 'Sanganoor, Coimbatore 641027',
    state: 'Tamil Nadu',
    stateCode: '33',
    gstin: '33AAKCC0627N1ZL',
    fssai: '12422018001222',
    phone: '+91 90922 66667',
    email: 'info@cholanrice.in',
    bankDetails: '',
    terms: '',
  },
};

export function cleanSettings(input) {
  const body = input && typeof input === 'object' ? input : {};
  const seller = body.seller && typeof body.seller === 'object' ? body.seller : {};
  const prices = {};
  for (const [key, value] of Object.entries(body.prices || {}).slice(0, 300)) {
    const paise = typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
    if (/^[\w-]{1,100}$/.test(key) && paise !== null) prices[key] = paise;
  }
  const gst = {};
  for (const [key, value] of Object.entries(body.gst || {}).slice(0, 100)) {
    if (/^[\w-]{1,80}$/.test(key) && validRate(value)) gst[key] = value;
  }
  const hsn = {};
  for (const [key, value] of Object.entries(body.hsn || {}).slice(0, 100)) {
    if (/^[\w-]{1,80}$/.test(key) && /^\d{4,8}$/.test(String(value))) hsn[key] = String(value);
  }
  return {
    pricesIncludeGst: body.pricesIncludeGst !== false,
    defaultHsn: /^\d{4,8}$/.test(String(body.defaultHsn)) ? String(body.defaultHsn) : DEFAULT_SETTINGS.defaultHsn,
    prices,
    gst,
    hsn,
    seller: {
      legalName: text(seller.legalName, 120),
      addressLine1: text(seller.addressLine1, 120),
      addressLine2: text(seller.addressLine2, 120),
      state: text(seller.state, 40) || 'Tamil Nadu',
      stateCode: text(seller.stateCode, 4),
      gstin: text(seller.gstin, 15).toUpperCase(),
      fssai: text(seller.fssai, 20),
      phone: text(seller.phone, 24),
      email: text(seller.email, 120),
      bankDetails: text(seller.bankDetails, 400),
      terms: text(seller.terms, 600),
    },
  };
}

const PHONE = /^[+\d][\d\s()-]{6,20}$/;

// The customer and the bags on an order, as sent. `prices` says what each line
// costs: a manager's own figure, the order's existing price, or the price list.
export function cleanOrder(body, { settings, manager = false, existing = null }) {
  const input = body && typeof body === 'object' ? body : {};
  const customerIn = input.customer && typeof input.customer === 'object' ? input.customer : {};
  const errors = {};
  const customer = {
    name: text(customerIn.name, 120),
    phone: text(customerIn.phone, 24),
    address: text(customerIn.address, 400),
    city: text(customerIn.city, 80),
    state: text(customerIn.state, 40) || 'Tamil Nadu',
    pincode: text(customerIn.pincode, 10),
    gstin: text(customerIn.gstin, 15).toUpperCase(),
  };
  if (!customer.name) errors.name = 'Add the customer’s name.';
  if (!PHONE.test(customer.phone)) errors.phone = 'Add a phone number.';
  if (customer.gstin && !/^[0-9A-Z]{15}$/.test(customer.gstin)) errors.gstin = 'A GSTIN has 15 letters and numbers.';

  const known = new Map((existing?.items || []).map((item) => [stockId(item.productId, item.pack), item]));
  const seen = new Set();
  const items = [];
  for (const raw of (Array.isArray(input.items) ? input.items : []).slice(0, 40)) {
    const productId = text(raw?.productId, 80);
    const pack = text(raw?.pack, 20);
    const qty = Number(raw?.qty);
    if (!/^[a-z0-9-]{1,80}$/.test(productId) || !/^[\w .-]{1,20}$/.test(pack) || !Number.isInteger(qty) || qty < 1 || qty > 100000) {
      errors.items = 'Check the products and quantities.';
      continue;
    }
    const id = stockId(productId, pack);
    if (seen.has(id)) {
      errors.items = `${text(raw?.name, 120) || productId} ${pack} is on the order twice.`;
      continue;
    }
    seen.add(id);
    const before = known.get(id);
    const typed = manager && raw?.unitRupees !== undefined && raw?.unitRupees !== '' ? toPaise(raw.unitRupees) : null;
    if (manager && raw?.unitRupees !== undefined && raw?.unitRupees !== '' && typed === null) errors.items = 'Check the prices.';
    const fromList = settings.prices[id] ?? null;
    items.push({
      productId,
      name: text(raw?.name, 120) || before?.name || productId,
      pack,
      qty,
      unitPaise: typed ?? before?.unitPaise ?? fromList ?? 0,
      gstRate: before?.gstRate ?? settings.gst[productId] ?? null,
      hsn: settings.hsn[productId] || before?.hsn || settings.defaultHsn,
    });
  }
  if (!items.length && !errors.items) errors.items = 'Add at least one product.';

  if (Object.keys(errors).length) return { errors };
  const source = SOURCES.includes(input.source) ? input.source : 'phone';
  return {
    value: {
      customer,
      items,
      source,
      enquiryId: text(input.enquiryId, 80),
      notes: text(input.notes, 1000),
    },
  };
}

// True when two item lists hold the same bags, whatever their prices.
export function sameBags(a, b) {
  const key = (list) => list.map((i) => `${stockId(i.productId, i.pack)}:${i.qty}`).sort().join();
  return key(a) === key(b);
}

export const isInterstate = (customer, seller) =>
  String(customer?.state || '').trim().toLowerCase() !== String(seller?.state || '').trim().toLowerCase();

// Everything about an order that staff do not see.
const MONEY_ON_ORDER = ['taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'roundOffPaise', 'totalPaise', 'paidPaise', 'invoiceId', 'invoiceNumber', 'paymentStatus'];
const MONEY_ON_ITEM = ['unitPaise', 'gstRate', 'hsn'];

export function forLevel(order, level) {
  if (level !== 'staff') return { ...order, paymentStatus: paymentStatus(order) };
  const out = { ...order };
  for (const key of MONEY_ON_ORDER) delete out[key];
  out.items = (order.items || []).map((item) => {
    const copy = { ...item };
    for (const key of MONEY_ON_ITEM) delete copy[key];
    return copy;
  });
  out.history = (order.history || []).filter((entry) => !entry.money);
  return out;
}
