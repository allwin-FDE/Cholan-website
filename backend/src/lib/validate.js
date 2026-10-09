// Validation for an incoming enquiry. Mirrors the contact form's own rules:
// name, phone and message are required, email is optional.
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
    },
  };
}
