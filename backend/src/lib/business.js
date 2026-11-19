// The Business screens in /admin: products and packs, customers and
// suppliers, and price lists, on the business database (PostgreSQL).
// Each function takes a client inside a transaction (see db/pool.js withTx),
// checks what staff typed, and turns database refusals into plain messages.
// Money arrives in rupees from the screens and is stored in whole paise.

export const SEGMENTS = ['b2c', 'retailer', 'hotel', 'distributor', 'institution'];
export const SUPPLIER_TYPES = ['mill', 'farmer', 'agent', 'packing', 'transport', 'other'];
export const CREDIT_STATUSES = ['active', 'hold', 'blocked'];
export const ADDRESS_KINDS = ['billing', 'shipping', 'both'];

// Today in India, whatever the database server's clock zone.
const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

export class InputError extends Error {
  constructor(message, fields = null) {
    super(message);
    this.status = 400;
    this.fields = fields;
  }
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const orNull = (value) => (value === '' ? null : value);
const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);

export function cleanPhone(value, field = 'phone') {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9][0-9]{9}$/.test(local)) throw new InputError('Enter a 10-digit Indian mobile number.', { [field]: 'Enter a 10-digit mobile number.' });
  return `+91${local}`;
}

export function cleanGstin(value, field = 'gstin') {
  const v = text(value, 20).toUpperCase().replace(/\s/g, '');
  if (!v) return null;
  if (!GSTIN.test(v)) throw new InputError('That GSTIN is not valid.', { [field]: 'A GSTIN has 15 characters, like 33AAKCC0627N1ZL.' });
  return v;
}

// Rupees typed on a screen ("2,450.50") to whole paise.
export function toPaise(value, field, { allowZero = false } = {}) {
  const v = String(value ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new InputError('Enter an amount in rupees.', { [field]: 'Enter an amount in rupees, like 2450 or 2450.50.' });
  const paise = Math.round(Number(v) * 100);
  if (!allowZero && paise <= 0) throw new InputError('The amount must be more than zero.', { [field]: 'Must be more than zero.' });
  if (!Number.isSafeInteger(paise)) throw new InputError('That amount is too large.', { [field]: 'Too large.' });
  return paise;
}

function cleanDate(value, field) {
  const v = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new InputError('Choose a date.', { [field]: 'Choose a date.' });
  return v;
}

function wholeNumber(value, field, { min = 0, max = 1_000_000 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new InputError('Enter a whole number.', { [field]: `A whole number from ${min} to ${max}.` });
  return n;
}

// Turns a database refusal into a message for the screen.
export function friendly(error) {
  if (error instanceof InputError) return error;
  const c = error.constraint || '';
  const say = (message, fields) => Object.assign(new InputError(message, fields), { cause: error });
  if (error.code === '23505') {
    if (c.includes('gstin')) return say('Another party already has this GSTIN.', { gstin: 'Already used by another party.' });
    if (c.includes('phone')) return say('A household with this mobile number already exists. Search for it instead.', { phone: 'Already used.' });
    if (c.includes('tally')) return say('Another party already uses this Tally ledger name.', { tallyLedgerName: 'Already used.' });
    if (c.includes('barcode')) return say('Another item already has this barcode.', { barcode: 'Already used.' });
    if (c.includes('bills_once')) return say('This supplier bill is already entered.', { supplierBillNo: 'Already entered.' });
    if (c.includes('batches_item_id_code')) return say('That batch code is already used for this item.', { batchCode: 'Already used.' });
    if (c.includes('branches_code')) return say('Another branch already has this code.', { code: 'Already used.' });
    if (c.includes('locations_branch_id_code')) return say('This branch already has a place with that code.', { code: 'Already used.' });
    if (c.includes('expense_categories_name')) return say('That category already exists.', { name: 'Already exists.' });
    if (c.includes('one_default')) return say('Only one default address of each kind is allowed.');
    return say('That already exists.');
  }
  if (error.code === '23P01') return say(error.message);
  if (c.startsWith('stock_balances')) {
    return say(c.includes('damaged') ? 'There are not that many damaged bags.' : 'Not enough bags in stock for that. Someone may have just taken them; reload and check.');
  }
  if (c === 'invoices_one_live_per_order') return say('This order already has an invoice.');
  // Our own rules (frozen invoices, receipts, allocations) explain themselves.
  if (error.code === '23514' && !c && error.where?.includes('PL/pgSQL')) return say(error.message);
  if (error.code === '23514' || error.code === '22P02') return say('Please check the details: one of them is not in the right form.');
  if (error.code === '23503') return say('Something this refers to no longer exists. Reload the page and try again.');
  return error;
}

// ---- Products and packs ----
export async function listItems(client) {
  const { rows } = await client.query(`
    SELECT i.id, i.kind, i.sku_code, i.name, i.pack_label, i.net_weight_g, i.uom, i.hsn, i.gst_rate_bp, i.gst_confirmed,
           i.mrp_paise, i.barcode, i.low_stock_level, i.active, p.slug AS product_slug, p.name AS product_name,
           (SELECT li.price_paise FROM price.list_items li JOIN price.price_lists pl ON pl.id = li.price_list_id AND pl.is_default
             WHERE li.item_id = i.id AND li.min_qty = 1 AND ${TODAY} BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)
             LIMIT 1) AS web_price_paise
    FROM catalog.items i LEFT JOIN catalog.products p ON p.id = i.product_id
    ORDER BY p.name NULLS LAST, i.net_weight_g NULLS LAST, i.sku_code`);
  return rows;
}

export async function updateItem(client, id, body) {
  const set = {};
  if (has(body, 'hsn')) {
    const hsn = text(body.hsn, 8);
    if (!/^[0-9]{4}([0-9]{2}){0,2}$/.test(hsn)) throw new InputError('HSN is 4, 6 or 8 digits.', { hsn: 'HSN is 4, 6 or 8 digits, like 1006.' });
    set.hsn = hsn;
  }
  if (has(body, 'gstPercent')) {
    const pct = Number(body.gstPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 40) throw new InputError('GST is a percentage from 0 to 40.', { gstPercent: 'From 0 to 40.' });
    set.gst_rate_bp = Math.round(pct * 100);
  }
  if (has(body, 'gstConfirmed')) set.gst_confirmed = Boolean(body.gstConfirmed);
  if (has(body, 'mrp')) set.mrp_paise = body.mrp === '' || body.mrp == null ? null : toPaise(body.mrp, 'mrp');
  if (has(body, 'barcode')) {
    const barcode = text(body.barcode, 14);
    if (barcode && !/^[0-9]{8,14}$/.test(barcode)) throw new InputError('A barcode is 8 to 14 digits.', { barcode: '8 to 14 digits.' });
    set.barcode = orNull(barcode);
  }
  if (has(body, 'lowStockLevel')) set.low_stock_level = body.lowStockLevel === '' || body.lowStockLevel == null ? null : wholeNumber(body.lowStockLevel, 'lowStockLevel');
  if (has(body, 'active')) set.active = Boolean(body.active);
  const keys = Object.keys(set);
  if (!keys.length) throw new InputError('Nothing to change.');
  const { rows } = await client.query(
    `UPDATE catalog.items SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING id`,
    [id, ...keys.map((k) => set[k])],
  );
  if (!rows.length) throw Object.assign(new Error('Item not found.'), { status: 404 });
  return (await listItems(client)).find((item) => item.id === rows[0].id);
}

// ---- Prices: shared by price lists and customers' special prices ----
const OWNERS = {
  list: { table: 'price.list_items', column: 'price_list_id' },
  customer: { table: 'price.customer_prices', column: 'party_id' },
};

// A new price from a date. The price it replaces ends the day before, so the
// history stays and two prices never cover one day.
export async function setPrice(client, owner, ownerId, body) {
  const { table, column } = OWNERS[owner];
  const itemId = wholeNumber(body.itemId, 'itemId', { min: 1, max: 2_147_483_647 });
  const minQty = has(body, 'minQty') && body.minQty !== '' ? wholeNumber(body.minQty, 'minQty', { min: 1, max: 100_000 }) : 1;
  const pricePaise = toPaise(body.price, 'price');
  const validFrom = cleanDate(body.validFrom, 'validFrom');
  const validTo = body.validTo ? cleanDate(body.validTo, 'validTo') : null;
  if (validTo && validTo < validFrom) throw new InputError('The end date is before the start date.', { validTo: 'Must be on or after the start date.' });
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}:${ownerId}:${itemId}`]);
  const later = await client.query(`SELECT valid_from FROM ${table} WHERE ${column} = $1 AND item_id = $2 AND min_qty = $3 AND valid_from >= $4 LIMIT 1`, [ownerId, itemId, minQty, validFrom]);
  if (later.rows.length) {
    throw new InputError('A price for this item and quantity already starts on or after that date. Change or end that price instead.', { validFrom: 'Another price starts on or after this date.' });
  }
  await client.query(
    `UPDATE ${table} SET valid_to = $4::date - 1
      WHERE ${column} = $1 AND item_id = $2 AND min_qty = $3 AND valid_from < $4 AND (valid_to IS NULL OR valid_to >= $4)`,
    [ownerId, itemId, minQty, validFrom],
  );
  const note = owner === 'customer' ? ', note' : '';
  const { rows } = await client.query(
    `INSERT INTO ${table} (${column}, item_id, min_qty, price_paise, valid_from, valid_to${note})
     VALUES ($1, $2, $3, $4, $5, $6${owner === 'customer' ? ', $7' : ''}) RETURNING id`,
    [ownerId, itemId, minQty, pricePaise, validFrom, validTo, ...(owner === 'customer' ? [orNull(text(body.note, 200))] : [])],
  );
  return rows[0].id;
}

export async function endPrice(client, owner, ownerId, priceId, body) {
  const { table, column } = OWNERS[owner];
  const validTo = cleanDate(body.validTo, 'validTo');
  const { rows } = await client.query(`SELECT valid_from FROM ${table} WHERE id = $1 AND ${column} = $2`, [priceId, ownerId]);
  if (!rows.length) throw Object.assign(new Error('Price not found.'), { status: 404 });
  const from = rows[0].valid_from; // 'YYYY-MM-DD' (see db/pool.js)
  if (validTo < from) throw new InputError('A price cannot end before it starts.', { validTo: `On or after ${from}.` });
  await client.query(`UPDATE ${table} SET valid_to = $2 WHERE id = $1`, [priceId, validTo]);
}

const priceState = `CASE WHEN valid_from > ${TODAY} THEN 'upcoming'
  WHEN valid_to IS NOT NULL AND valid_to < ${TODAY} THEN 'ended' ELSE 'current' END`;

export async function listPriceLists(client) {
  const { rows } = await client.query(`
    SELECT pl.id, pl.code, pl.name, pl.includes_gst, pl.is_default, pl.active,
           count(li.id) FILTER (WHERE ${TODAY} BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)) AS current_prices,
           (SELECT count(*) FROM party.customer_profiles cp WHERE cp.price_list_id = pl.id) AS customers
    FROM price.price_lists pl LEFT JOIN price.list_items li ON li.price_list_id = pl.id
    GROUP BY pl.id ORDER BY pl.is_default DESC, pl.id`);
  return rows;
}

export async function priceList(client, id) {
  const list = (await client.query('SELECT id, code, name, includes_gst, is_default, active FROM price.price_lists WHERE id = $1', [id])).rows[0];
  if (!list) throw Object.assign(new Error('Price list not found.'), { status: 404 });
  const { rows } = await client.query(
    `SELECT li.id, li.item_id, li.min_qty, li.price_paise, to_char(li.valid_from, 'YYYY-MM-DD') AS valid_from,
            to_char(li.valid_to, 'YYYY-MM-DD') AS valid_to, ${priceState} AS state, li.updated_by, li.updated_at
     FROM price.list_items li WHERE li.price_list_id = $1 ORDER BY li.item_id, li.min_qty, li.valid_from DESC`,
    [id],
  );
  return { list, prices: rows };
}

// ---- Customers and suppliers ----
export async function listParties(client, { type = 'all', q = '' } = {}) {
  const search = text(q, 60);
  const digits = search.replace(/\D/g, '');
  const { rows } = await client.query(
    `SELECT p.id, p.kind, p.display_name, p.legal_name, p.gstin, p.phone, p.email, p.is_customer, p.is_supplier, p.active,
            cp.segment, pl.code AS price_list, cp.credit_limit_paise, cp.terms_days, cp.credit_status, sp.supplier_type,
            (SELECT a.city FROM party.addresses a WHERE a.party_id = p.id AND a.active ORDER BY a.is_default DESC, a.id LIMIT 1) AS city
     FROM party.parties p
     LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
     LEFT JOIN price.price_lists pl ON pl.id = cp.price_list_id
     LEFT JOIN party.supplier_profiles sp ON sp.party_id = p.id
     WHERE ($1 = 'all' OR ($1 = 'customer' AND p.is_customer) OR ($1 = 'supplier' AND p.is_supplier))
       AND ($2 = '' OR p.display_name ILIKE '%' || $2 || '%' OR p.legal_name ILIKE '%' || $2 || '%' OR p.gstin ILIKE '%' || $2 || '%'
            OR ($3 <> '' AND p.phone LIKE '%' || $3 || '%'))
     ORDER BY p.active DESC, lower(p.display_name)
     LIMIT 500`,
    [type, search, digits.length >= 4 ? digits : ''],
  );
  return rows;
}

export async function getParty(client, id) {
  const party = (
    await client.query(
      `SELECT p.*, cp.segment, cp.price_list_id, pl.code AS price_list, cp.credit_limit_paise, cp.terms_days, cp.credit_status,
              sp.supplier_type, sp.terms_days AS supplier_terms_days
       FROM party.parties p
       LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
       LEFT JOIN price.price_lists pl ON pl.id = cp.price_list_id
       LEFT JOIN party.supplier_profiles sp ON sp.party_id = p.id
       WHERE p.id = $1`,
      [id],
    )
  ).rows[0];
  if (!party) throw Object.assign(new Error('Customer or supplier not found.'), { status: 404 });
  const [addresses, contacts, prices] = await Promise.all([
    client.query('SELECT * FROM party.addresses WHERE party_id = $1 ORDER BY active DESC, is_default DESC, id', [id]),
    client.query('SELECT * FROM party.contacts WHERE party_id = $1 ORDER BY active DESC, is_primary DESC, id', [id]),
    client.query(
      `SELECT cp.id, cp.item_id, i.sku_code, i.name AS item_name, cp.min_qty, cp.price_paise, cp.note,
              to_char(cp.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(cp.valid_to, 'YYYY-MM-DD') AS valid_to, ${priceState} AS state
       FROM price.customer_prices cp JOIN catalog.items i ON i.id = cp.item_id
       WHERE cp.party_id = $1 ORDER BY (${priceState}) = 'ended', i.sku_code, cp.min_qty, cp.valid_from DESC`,
      [id],
    ),
  ]);
  return { ...party, addresses: addresses.rows, contacts: contacts.rows, prices: prices.rows };
}

export function cleanParty(body, { creating }) {
  const p = {};
  if (creating || has(body, 'kind')) {
    if (!['business', 'person'].includes(body.kind)) throw new InputError('Choose business or person.', { kind: 'Choose one.' });
    p.kind = body.kind;
  }
  if (creating || has(body, 'displayName')) {
    p.display_name = text(body.displayName, 120);
    if (p.display_name.length < 2) throw new InputError('Enter a name.', { displayName: 'Enter a name.' });
  }
  if (has(body, 'legalName')) p.legal_name = orNull(text(body.legalName, 160));
  if (has(body, 'gstin')) p.gstin = cleanGstin(body.gstin);
  if (has(body, 'pan')) {
    const pan = text(body.pan, 10).toUpperCase();
    if (pan && !PAN.test(pan)) throw new InputError('That PAN is not valid.', { pan: 'A PAN looks like ABCDE1234F.' });
    p.pan = orNull(pan);
  }
  if (p.gstin && !p.pan && !has(body, 'pan')) p.pan = p.gstin.slice(2, 12);
  if (p.gstin && p.pan && p.gstin.slice(2, 12) !== p.pan) throw new InputError('The PAN does not match the GSTIN.', { pan: `The GSTIN says ${p.gstin.slice(2, 12)}.` });
  if (has(body, 'phone')) p.phone = cleanPhone(body.phone);
  if (has(body, 'email')) {
    const email = text(body.email, 120).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new InputError('That email address is not valid.', { email: 'Check the email address.' });
    p.email = orNull(email);
  }
  if (has(body, 'tallyLedgerName')) p.tally_ledger_name = orNull(text(body.tallyLedgerName, 120));
  if (has(body, 'notes')) p.notes = orNull(text(body.notes, 1000));
  if (has(body, 'active')) p.active = Boolean(body.active);
  if (creating || has(body, 'isCustomer')) p.is_customer = Boolean(body.isCustomer);
  if (creating || has(body, 'isSupplier')) p.is_supplier = Boolean(body.isSupplier);
  if (creating && !p.is_customer && !p.is_supplier) throw new InputError('Choose customer, supplier or both.', { isCustomer: 'Choose at least one.' });

  let customer = null;
  if (body.customer && (p.is_customer ?? true)) {
    const c = body.customer;
    customer = {};
    if (!SEGMENTS.includes(c.segment)) throw new InputError('Choose the type of customer.', { segment: 'Choose one.' });
    customer.segment = c.segment;
    customer.price_list_code = text(c.priceList, 12).toUpperCase() || null;
    customer.credit_limit_paise = c.creditLimit === '' || c.creditLimit == null ? 0 : toPaise(c.creditLimit, 'creditLimit', { allowZero: true });
    customer.terms_days = c.termsDays === '' || c.termsDays == null ? 0 : wholeNumber(c.termsDays, 'termsDays', { max: 180 });
    customer.credit_status = CREDIT_STATUSES.includes(c.creditStatus) ? c.creditStatus : 'active';
  }
  let supplier = null;
  if (body.supplier && (p.is_supplier ?? true)) {
    const s = body.supplier;
    if (!SUPPLIER_TYPES.includes(s.supplierType)) throw new InputError('Choose the type of supplier.', { supplierType: 'Choose one.' });
    supplier = { supplier_type: s.supplierType, terms_days: s.termsDays === '' || s.termsDays == null ? 0 : wholeNumber(s.termsDays, 'supplierTermsDays', { max: 180 }) };
  }
  if (creating && p.is_customer && !customer) throw new InputError('Choose the type of customer.', { segment: 'Choose one.' });
  if (creating && p.is_supplier && !supplier) throw new InputError('Choose the type of supplier.', { supplierType: 'Choose one.' });
  return { party: p, customer, supplier };
}

const DEFAULT_LIST = { b2c: 'WEB', retailer: 'RETAIL', hotel: 'HOTEL', distributor: 'DIST', institution: 'INST' };

export async function saveParty(client, id, body) {
  const { party, customer, supplier } = cleanParty(body, { creating: !id });
  let partyId = id;
  const keys = Object.keys(party);
  if (!id) {
    const { rows } = await client.query(
      `INSERT INTO party.parties (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      keys.map((k) => party[k]),
    );
    partyId = rows[0].id;
  } else if (keys.length) {
    const { rowCount } = await client.query(`UPDATE party.parties SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => party[k])]);
    if (!rowCount) throw Object.assign(new Error('Customer or supplier not found.'), { status: 404 });
  }
  if (customer) {
    const code = customer.price_list_code || DEFAULT_LIST[customer.segment];
    const list = (await client.query('SELECT id FROM price.price_lists WHERE code = $1 AND active', [code])).rows[0];
    if (!list) throw new InputError('Choose a price list.', { priceList: 'Choose a price list.' });
    await client.query(
      `INSERT INTO party.customer_profiles (party_id, segment, price_list_id, credit_limit_paise, terms_days, credit_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (party_id) DO UPDATE SET segment = EXCLUDED.segment, price_list_id = EXCLUDED.price_list_id,
         credit_limit_paise = EXCLUDED.credit_limit_paise, terms_days = EXCLUDED.terms_days, credit_status = EXCLUDED.credit_status`,
      [partyId, customer.segment, list.id, customer.credit_limit_paise, customer.terms_days, customer.credit_status],
    );
  }
  if (supplier) {
    await client.query(
      `INSERT INTO party.supplier_profiles (party_id, supplier_type, terms_days) VALUES ($1, $2, $3)
       ON CONFLICT (party_id) DO UPDATE SET supplier_type = EXCLUDED.supplier_type, terms_days = EXCLUDED.terms_days`,
      [partyId, supplier.supplier_type, supplier.terms_days],
    );
  }
  if (!id && body.address) await saveAddress(client, partyId, null, { ...body.address, isDefault: true });
  return getParty(client, partyId);
}

export async function saveAddress(client, partyId, addressId, body) {
  const a = {
    kind: ADDRESS_KINDS.includes(body.kind) ? body.kind : 'both',
    label: orNull(text(body.label, 60)),
    line1: text(body.line1, 160),
    line2: orNull(text(body.line2, 160)),
    city: text(body.city, 60),
    district: orNull(text(body.district, 60)),
    state_code: text(body.stateCode, 2),
    pincode: text(body.pincode, 6),
    gstin: cleanGstin(body.gstin, 'addressGstin'),
    is_default: Boolean(body.isDefault),
    active: has(body, 'active') ? Boolean(body.active) : true,
  };
  if (!a.line1) throw new InputError('Enter the address.', { line1: 'Enter the address.' });
  if (!a.city) throw new InputError('Enter the town or city.', { city: 'Enter the town or city.' });
  if (!/^[0-9]{2}$/.test(a.state_code)) throw new InputError('Choose the state.', { stateCode: 'Choose the state.' });
  if (!/^[1-9][0-9]{5}$/.test(a.pincode)) throw new InputError('A pincode has 6 digits.', { pincode: '6 digits.' });
  if (a.gstin && a.gstin.slice(0, 2) !== a.state_code) throw new InputError('This GSTIN belongs to another state.', { addressGstin: `This GSTIN is for state ${a.gstin.slice(0, 2)}.` });
  if (a.is_default && a.active) {
    await client.query('UPDATE party.addresses SET is_default = false WHERE party_id = $1 AND kind = $2 AND is_default AND id IS DISTINCT FROM $3', [partyId, a.kind, addressId]);
  }
  const keys = Object.keys(a);
  if (!addressId) {
    await client.query(`INSERT INTO party.addresses (party_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})`, [partyId, ...keys.map((k) => a[k])]);
  } else {
    const { rowCount } = await client.query(`UPDATE party.addresses SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND party_id = $2`, [addressId, partyId, ...keys.map((k) => a[k])]);
    if (!rowCount) throw Object.assign(new Error('Address not found.'), { status: 404 });
  }
}

export async function saveContact(client, partyId, contactId, body) {
  const c = {
    name: text(body.name, 80),
    role: orNull(text(body.role, 60)),
    phone: cleanPhone(body.phone, 'contactPhone'),
    email: orNull(text(body.email, 120).toLowerCase()),
    is_primary: Boolean(body.isPrimary),
    active: has(body, 'active') ? Boolean(body.active) : true,
  };
  if (c.name.length < 2) throw new InputError('Enter the contact’s name.', { contactName: 'Enter a name.' });
  const keys = Object.keys(c);
  if (!contactId) {
    await client.query(`INSERT INTO party.contacts (party_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})`, [partyId, ...keys.map((k) => c[k])]);
  } else {
    const { rowCount } = await client.query(`UPDATE party.contacts SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')} WHERE id = $1 AND party_id = $2`, [contactId, partyId, ...keys.map((k) => c[k])]);
    if (!rowCount) throw Object.assign(new Error('Contact not found.'), { status: 404 });
  }
}
