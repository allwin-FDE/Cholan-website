import { site } from '../config/site.js';

// The WhatsApp Business number (+91 81483 13478): chats land in the
// /whatsapp dashboard's Inbox, where the bot answers first. Calls stay on
// site.phoneRaw.
export const whatsappNumber = site.whatsapp?.raw || site.phoneRaw;

// wa.me link with a prefilled enquiry message (original `Rn`). Pass a product for a product enquiry.
export function whatsappLink(product) {
  const message = product
    ? `Hello Cholan Rice, I would like to enquire about "${product.name}". Please share price and availability.`
    : 'Hello Cholan Rice, I would like to enquire about your products.';
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
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
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

// "Order on WhatsApp" from a product: the product, the chosen size and its
// price, and the page link, ready to send.
export function whatsappOrderLink(product, pack) {
  const name = product.fullName || product.name;
  const price = pack?.price != null ? ` (₹${Number(pack.price).toLocaleString('en-IN')})` : '';
  const size = pack?.size ? ` — ${pack.size}${price}` : '';
  const message = `Hello Cholan Rice, I would like to order ${name}${size}.\nhttps://www.cholanrice.in/products/${product.id}`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
