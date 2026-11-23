// Store lists from a spreadsheet: works out which column is which from the
// header row (whatever the sheet calls them), cleans each row into a store,
// and reports the rows that can't be used. Nothing here touches the database.

// Each field and the header names it may go by (compared without case,
// spaces or punctuation).
const FIELDS = {
  code: ['shopcode', 'storecode', 'storeid', 'shopid', 'branchcode', 'outletcode', 'code', 'id'],
  name: ['branch', 'branchname', 'storename', 'shopname', 'outlet', 'outletname', 'store', 'shop', 'name'],
  region: ['region'],
  zone: ['zone'],
  manager: ['asmname', 'asm', 'areamanager', 'areasalesmanager', 'manager'],
  doorNo: ['doorno', 'doornumber', 'door', 'shopno', 'buildingno', 'building'],
  street: ['streetname', 'street', 'address', 'addressline1', 'address1', 'road'],
  area: ['area', 'locality', 'village', 'addressline2', 'address2'],
  landmark: ['landmark', 'nearby'],
  taluk: ['taluk', 'taluka', 'city', 'town'],
  district: ['district'],
  state: ['state'],
  pincode: ['pincode', 'pin', 'postalcode', 'postcode', 'zip', 'zipcode'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'contactno'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
};
const IGNORED = ['sno', 'slno', 'serialno', 'no', 's'];

const key = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Which column holds each field: { field: index }, plus the headers left over.
export function mapColumns(header) {
  const keys = header.map(key);
  const columns = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    for (const name of names) {
      const i = keys.findIndex((k, idx) => k === name && !Object.values(columns).includes(idx));
      if (i !== -1) {
        columns[field] = i;
        break;
      }
    }
  }
  const unused = header.filter((h, i) => h && !Object.values(columns).includes(i) && !IGNORED.includes(keys[i]));
  return { columns, unused };
}

// Text as it should be kept: single spaces, no stray commas or dashes at the ends.
export const tidy = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-;:]+|[\s,\-;:]+$/g, '')
    .trim();

// "Door No.62", "Door.no.D.No:4/104/2", "NO 1/8" → "62", "4/104/2", "1/8".
export function cleanDoor(v) {
  let s = tidy(v);
  for (let i = 0; i < 3; i += 1) s = s.replace(/^(door\s*\.?\s*(no|number)\.?|d\s*\.?\s*no\.?|no)\s*[:.]?\s*/i, '');
  return tidy(s);
}

export function cleanPhone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

export const cleanCode = (v) => tidy(v).toUpperCase().replace(/[^A-Z0-9_-]/g, '');

export const inIndia = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 6 && lat < 37.5 && lng > 68 && lng < 97.5;

// The address fields; a change to any of them means the store must be placed again.
export const ADDRESS_FIELDS = ['doorNo', 'street', 'area', 'landmark', 'taluk', 'district', 'state', 'pincode'];
export const EDIT_FIELDS = ['name', 'region', 'zone', 'manager', 'phone', ...ADDRESS_FIELDS];
export const addressKey = (s) => ADDRESS_FIELDS.map((f) => String(s[f] || '').toLowerCase()).join('|');

const slug = (s) => key(s).slice(0, 24).toUpperCase();

// The rows of a sheet (header first) as stores, with the rows that can't be used.
export function storesFromRows(rows) {
  if (!rows?.length) throw Object.assign(new Error('The file is empty.'), { status: 400 });
  // The header is the first row that names a store column and a pincode column.
  let headerAt = rows.findIndex((r) => {
    const { columns } = mapColumns(r);
    return columns.name != null && columns.pincode != null;
  });
  if (headerAt === -1 || headerAt > 10) {
    throw Object.assign(new Error('Couldn’t find the header row. The sheet needs at least a store name (or Branch) column and a Pincode column.'), { status: 400 });
  }
  const header = rows[headerAt];
  const { columns, unused } = mapColumns(header);
  const at = (row, field) => (columns[field] == null ? '' : row[columns[field]] ?? '');

  const stores = [];
  const invalid = [];
  const seen = new Map();
  rows.slice(headerAt + 1).forEach((row, i) => {
    const line = headerAt + i + 2; // the row number as Excel shows it
    if (!row.some((x) => tidy(x))) return;
    const s = {
      name: tidy(at(row, 'name')),
      region: tidy(at(row, 'region')),
      zone: tidy(at(row, 'zone')),
      manager: tidy(at(row, 'manager')),
      doorNo: cleanDoor(at(row, 'doorNo')),
      street: tidy(at(row, 'street')),
      area: tidy(at(row, 'area')),
      landmark: tidy(at(row, 'landmark')),
      taluk: tidy(at(row, 'taluk')),
      district: tidy(at(row, 'district')),
      state: tidy(at(row, 'state')) || 'Tamil Nadu',
      pincode: String(at(row, 'pincode')).replace(/\s/g, ''),
      phone: cleanPhone(at(row, 'phone')),
    };
    const problems = [];
    if (!s.name) problems.push('no store name');
    if (!/^[1-9]\d{5}$/.test(s.pincode)) problems.push(s.pincode ? `pincode "${s.pincode}" is not 6 digits` : 'no pincode');
    if (!s.street && !s.area && !s.doorNo) problems.push('no address');
    s.code = cleanCode(at(row, 'code')) || (s.name && s.pincode ? `AUTO-${s.pincode}-${slug(s.name)}` : '');
    if (s.code && seen.has(s.code)) problems.push(`same shop code as row ${seen.get(s.code)}`);
    const lat = Number(at(row, 'lat'));
    const lng = Number(at(row, 'lng'));
    if (columns.lat != null && at(row, 'lat') !== '') {
      if (inIndia(lat, lng)) s.sheetLocation = { lat, lng };
      else problems.push('latitude/longitude are not a place in India');
    }
    if (problems.length) {
      invalid.push({ row: line, code: s.code || '', name: s.name, problems });
      return;
    }
    seen.set(s.code, line);
    s.row = line;
    stores.push(s);
  });

  // The same name and pincode under two codes: kept, but pointed out.
  const byPlace = new Map();
  const warnings = [];
  for (const s of stores) {
    const k = `${key(s.name)}|${s.pincode}`;
    if (byPlace.has(k)) warnings.push({ row: s.row, code: s.code, name: s.name, warning: `same name and pincode as ${byPlace.get(k)}` });
    else byPlace.set(k, s.code);
  }
  return { stores, invalid, warnings, columns: Object.fromEntries(Object.entries(columns).map(([f, i]) => [f, header[i]])), present: Object.keys(columns), unused };
}

// What an import would do, compared with the stores already saved.
// present: the fields the sheet has a column for (name and pincode always).
// A field without a column is left as it is, not blanked.
export function diffStores(incoming, existing, present = EDIT_FIELDS) {
  const has = new Set(['name', 'pincode', ...present]);
  const fieldsIn = EDIT_FIELDS.filter((f) => has.has(f));
  const byCode = new Map(existing.map((s) => [s.code, s]));
  const added = [];
  const changed = [];
  const same = [];
  for (const s of incoming) {
    const old = byCode.get(s.code);
    if (!old) {
      added.push(s);
      continue;
    }
    const fields = fieldsIn.filter((f) => String(old[f] || '') !== String(s[f] || '') && !(f === 'phone' && !s.phone));
    if (s.sheetLocation && (old.lat !== s.sheetLocation.lat || old.lng !== s.sheetLocation.lng)) fields.push('location');
    if (old.active === false) fields.push('active');
    if (fields.length) changed.push({ ...s, fields, moved: fields.some((f) => ADDRESS_FIELDS.includes(f)) });
    else same.push(s.code);
  }
  const codes = new Set(incoming.map((s) => s.code));
  const missing = existing.filter((s) => !codes.has(s.code) && s.active !== false).map((s) => ({ code: s.code, name: s.name }));
  return { added, changed, same, missing };
}

// ---- Showing an address ----

// Short words kept in capitals (bank names, "GH", "RS"…); the rest of an
// all-capitals address is put in normal case so it reads well.
const KEEP_UPPER = new Set(
  'GH SBI ATM RS SF KVB TNHB TNPL MIG CBE LGB SVN KK KN TN PO VAO EB ESI RVS KSP SNS SCV SIHS MM NGGOS SRT MRS IOB IDBI ICICI TVK RR DL GRS SK NR KVR PV JR KRG RH SS MLA SP VK TPR NKL GSP UDCA JHS SIDCO ABT SVV CSI EDC RMS KVA RC GRT TCM RTO DG BHEL HP IOC BPCL HDFC AXIS CSB TMB IOCL'.split(' '),
);
export function prettify(v) {
  const s = tidy(v);
  if (!s) return '';
  return s.replace(/[A-Za-z][A-Za-z']*/g, (w) => {
    const up = w.toUpperCase();
    if (KEEP_UPPER.has(up)) return up;
    // Leave words that were typed in mixed case alone.
    if (w !== up && w !== w.toLowerCase()) return w;
    return up.charAt(0) + up.slice(1).toLowerCase();
  });
}

// The address on one line, without saying the same place twice.
export function addressLine(s) {
  const parts = [];
  const add = (v) => {
    const t = prettify(v);
    if (!t) return;
    const low = t.toLowerCase();
    if (parts.some((p) => p.toLowerCase().includes(low))) return;
    parts.push(t);
  };
  const door = cleanDoor(s.doorNo);
  const street = prettify(s.street);
  parts.push(...[door && street ? `${door}, ${street}` : door || street].filter(Boolean));
  add(s.area);
  add(s.taluk);
  add(s.district);
  const tail = [prettify(s.state || 'Tamil Nadu'), s.pincode].filter(Boolean).join(' ');
  return [...parts, tail].join(', ');
}

// What Google's address search is given: the landmark is left out (it tends
// to confuse it), the rest as an Indian postal address.
export function geocodeQuery(s) {
  const bits = [cleanDoor(s.doorNo), s.street, s.area, s.taluk, s.district, s.state || 'Tamil Nadu', s.pincode].map(tidy).filter(Boolean);
  const out = [];
  for (const b of bits) if (!out.some((o) => o.toLowerCase().includes(b.toLowerCase()))) out.push(b);
  return out.join(', ');
}

// A CSV file as rows of text (commas, tabs or semicolons; quoted cells may
// hold commas, quotes and line breaks).
export function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t' || ch === ';') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}
