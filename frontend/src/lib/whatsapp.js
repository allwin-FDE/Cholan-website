import { site } from '../config/site.js';

// wa.me link with a prefilled enquiry message (original `Rn`). Pass a product for a product enquiry.
export function whatsappLink(product) {
  const message = product
    ? `Hello Cholan Rice, I would like to enquire about "${product.name}". Please share price and availability.`
    : 'Hello Cholan Rice, I would like to enquire about your products.';
  return `https://wa.me/${site.phoneRaw}?text=${encodeURIComponent(message)}`;
}

// A full enquiry from the contact form, as a prefilled WhatsApp message.
export function whatsappEnquiryLink(form) {
  const message = [
    'New enquiry from the website',
    `Name: ${form.name}`,
    `Phone: ${form.phone}`,
    form.email ? `Email: ${form.email}` : null,
    `Type: ${form.enquiryType}`,
    '',
    form.message,
  ]
    .filter((line) => line != null)
    .join('\n');
  return `https://wa.me/${site.phoneRaw}?text=${encodeURIComponent(message)}`;
}
