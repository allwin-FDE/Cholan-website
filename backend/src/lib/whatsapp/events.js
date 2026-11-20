// Business events that can send a WhatsApp message through the automations
// in /whatsapp → Automations: a website enquiry, a website order, and an
// order confirmed, dispatched or delivered. Each one only queues messages;
// it never throws, so WhatsApp can't hold up or break an order.
import { businessEvent } from './service.js';

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// The details an order message can use: {{order_number}}, {{total}}…
export function orderData(o) {
  const invoice = (o.invoices || []).find((i) => i.status === 'issued');
  return {
    order_number: o.number,
    total: rupees(invoice?.total_paise ?? o.subtotal_paise),
    items: (o.lines || []).map((l) => `${l.name} × ${l.qty}`).join(', ').slice(0, 200),
    bags: String((o.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0)),
    invoice_number: invoice?.number || '',
    city: o.ship_to?.city || '',
    vehicle: o.dispatch?.vehicle_no || '',
    driver_name: o.dispatch?.driver_name || '',
    driver_phone: o.dispatch?.driver_phone || '',
    lr_number: o.dispatch?.lr_no || '',
  };
}

export const orderEvent = (trigger, order) =>
  order?.phone ? businessEvent(trigger, { phone: order.phone, name: order.customer, data: orderData(order), tags: trigger === 'website_order' ? ['website-order'] : [] }) : Promise.resolve(0);

export const enquiryEvent = (enquiry) =>
  businessEvent('enquiry', {
    phone: enquiry.phone,
    name: enquiry.name,
    data: { product: enquiry.product || '', enquiry_type: enquiry.enquiryType || enquiry.enquiry_type || '' },
    tags: ['enquiry'],
  });
