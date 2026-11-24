// The WhatsApp business profile: what customers see when they open the
// number's info (About, description, address, email, websites, category and
// picture). Checked here against Meta's limits before it is sent, so staff get
// a clear message instead of a Graph error. The display name is not part of
// it: changing that needs Meta's review in WhatsApp Manager.

// Meta's business categories ("vertical"), with the words staff see.
export const VERTICALS = [
  ['GROCERY', 'Grocery store'],
  ['RETAIL', 'Shopping and retail'],
  ['RESTAURANT', 'Restaurant'],
  ['PROF_SERVICES', 'Professional services'],
  ['EVENT_PLAN', 'Event planning'],
  ['HOTEL', 'Hotel and lodging'],
  ['TRAVEL', 'Travel'],
  ['HEALTH', 'Medical and health'],
  ['EDU', 'Education'],
  ['FINANCE', 'Finance and banking'],
  ['AUTO', 'Automotive'],
  ['BEAUTY', 'Beauty, spa and salon'],
  ['APPAREL', 'Clothing and apparel'],
  ['ENTERTAIN', 'Entertainment'],
  ['NONPROFIT', 'Non-profit'],
  ['GOVT', 'Public service'],
  ['OTHER', 'Other'],
];

const LIMITS = { about: 139, description: 512, address: 256, email: 128, website: 256 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (fields) => Object.assign(new Error('Please check the highlighted fields.'), { status: 400, fields });

// What the dashboard shows (Meta's answer, tidied).
export function profileView(p = {}) {
  return {
    about: p.about || '',
    description: p.description || '',
    address: p.address || '',
    email: p.email || '',
    websites: [...(p.websites || []), '', ''].slice(0, 2),
    vertical: p.vertical || '',
    pictureUrl: p.profile_picture_url || '',
  };
}

// The staff's form → the fields Meta takes. Empty text clears a field (Meta
// keeps a field that is left out, so every field is sent).
export function profileUpdate(form = {}) {
  const text = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim();
  const out = {
    about: text(form.about),
    description: text(form.description),
    address: text(form.address),
    email: text(form.email),
    websites: (Array.isArray(form.websites) ? form.websites : []).map(text).filter(Boolean),
    vertical: text(form.vertical),
  };
  const errors = {};
  if (!out.about) errors.about = 'Required: a short line under your name (WhatsApp needs it).';
  for (const f of ['about', 'description', 'address', 'email']) if (out[f].length > LIMITS[f]) errors[f] = `At most ${LIMITS[f]} characters (now ${out[f].length}).`;
  if (/\n/.test(out.about)) errors.about = 'One line only.';
  if (out.email && !errors.email && !EMAIL.test(out.email)) errors.email = 'That email address doesn’t look right.';
  out.websites = out.websites.map((w) => (/^https?:\/\//i.test(w) ? w : `https://${w}`));
  if (out.websites.length > 2) errors.websites = 'At most two websites.';
  else if (out.websites.some((w) => w.length > LIMITS.website || !/^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(w))) errors.websites = 'Each website must be a full address, such as https://www.cholanrice.in';
  if (out.vertical && !VERTICALS.some(([k]) => k === out.vertical)) errors.vertical = 'Choose a category from the list.';
  if (Object.keys(errors).length) throw fail(errors);
  if (!out.vertical) delete out.vertical;
  return out;
}

// A profile picture: a square JPG or PNG works best (640 × 640), up to 5 MB.
export const PICTURE_TYPES = ['image/jpeg', 'image/png'];
export const PICTURE_MAX_BYTES = 5 * 1024 * 1024;
