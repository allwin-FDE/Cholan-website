// Validation for an incoming enquiry. Mirrors the contact form's own rules:
// name, phone and message are required, email is optional.
import { CLICK_IDS, attributionOf } from './sources.js';

const LIMITS = {
  name: 120,
  phone: 24,
  email: 160,
  enquiryType: 60,
  message: 4000,
  product: 120,
  source: 60,
};

const ENQUIRY_TYPES = [
  'Household order',
  'Bulk / wholesale',
  'Distributor enquiry',
  'Product question',
  'Other',
];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Deliberately loose: Indian mobiles arrive as 9092266667, +91 90922 66667 or
// 090922-66667, and rejecting a reachable number costs more than a bad row.
const PHONE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Names: letters (any language), spaces and the dot of an initial.
const NAME = /^\p{L}[\p{L}\p{M} .]+$/u;

export function validateEnquiry(body) {
  const errors = {};
  const input = body && typeof body === 'object' ? body : {};

  const name = text(input.name);
  const phone = text(input.phone);
  const email = text(input.email);
  const message = text(input.message);
  const enquiryType = text(input.enquiryType) || 'Other';
  const product = text(input.product);
  const source = text(input.source) || 'contact-form';

  if (!name) errors.name = 'Your name is required.';
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;
  else if (name.length < 2) errors.name = 'Please type your full name.';
  else if (!NAME.test(name)) errors.name = 'Please type your name using letters only.';

  if (!phone) errors.phone = 'A phone number is required.';
  else if (!PHONE.test(phone)) errors.phone = 'That phone number does not look right.';

  if (email && !EMAIL.test(email)) errors.email = 'That email address does not look right.';
  else if (email.length > LIMITS.email) errors.email = 'That email address is too long.';

  if (!message) errors.message = 'Tell us what you need.';
  else if (message.length > LIMITS.message)
    errors.message = `Keep the message under ${LIMITS.message} characters.`;

  if (Object.keys(errors).length) return { errors };

  return {
    value: {
      name,
      phone,
      email: email || null,
      // An unknown type is kept rather than rejected, so adding an option to
      // the form's dropdown does not need a backend release.
      enquiryType: ENQUIRY_TYPES.includes(enquiryType)
        ? enquiryType
        : enquiryType.slice(0, LIMITS.enquiryType),
      message,
      product: product ? product.slice(0, LIMITS.product) : null,
      source: source.slice(0, LIMITS.source),
      meta: JSON.stringify(enquiryMeta(input.meta)),
    },
  };
}

// Where on the site the enquiry came from, sent by the contact form: paths
// and campaign names only, each cut short. Anything else is dropped.
function enquiryMeta(meta) {
  const input = meta && typeof meta === 'object' ? meta : {};
  const pick = (key, max = 200) => (typeof input[key] === 'string' && input[key].trim() ? input[key].trim().slice(0, max) : null);
  return {
    page: pick('page'),
    landing: pick('landing'),
    referrer: pick('referrer', 300),
    utmSource: pick('utmSource', 100),
    utmMedium: pick('utmMedium', 100),
    utmCampaign: pick('utmCampaign', 100),
    sessionId: pick('sessionId', 64),
    clickId: CLICK_IDS.includes(input.clickId) ? input.clickId : null,
    ...enquirySource(input),
  };
}

// Where the enquirer came from (Google Ads, LinkedIn…), by the same rules as
// visits and orders (lib/sources.js). The form sends this visit's source and
// the device's earlier ones; an older form sends only this visit's.
function enquirySource(input) {
  const attribution = input.attribution && typeof input.attribution === 'object' ? input.attribution : { visit: input };
  const a = attributionOf(attribution);
  return {
    channel: a.channel,
    channelSource: a.source || null,
    channelMedium: a.medium || null,
    channelCampaign: a.campaign || null,
    channelFrom: a.from,
    firstChannel: a.firstChannel || null,
    firstSource: a.firstSource || null,
    firstCampaign: a.firstCampaign || null,
  };
}
