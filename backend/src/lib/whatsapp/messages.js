// The pieces of sending and receiving that don't touch a database: phone
// numbers, CSV imports, putting a contact's details into a template, the
// message Meta wants, and reading Meta's notifications (signed).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { slotsOf } from './templates.js';

// A phone number as WhatsApp wants it: digits with the country code, no +.
// Ten-digit Indian mobiles get 91 in front. Returns '' if it can't be one.
export function waNumber(raw) {
  const text = String(raw ?? '').trim();
  let d = text.replace(/\D/g, '');
  // With + or 00 in front, the country code is in the number.
  const international = text.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0[6-9]\d{9}$/.test(d)) d = d.slice(1);
  if (/^[6-9]\d{9}$/.test(d) && !international) return `91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  if (d.startsWith('91')) return '';
  // Another country: with + (8 to 15 digits), or written with its code (11 or more).
  if (/^[1-9]\d{7,14}$/.test(d) && (international || d.length >= 11)) return d;
  return '';
}
export const showNumber = (wa) => (/^91\d{10}$/.test(wa) ? `+91 ${wa.slice(2, 7)} ${wa.slice(7)}` : `+${wa}`);

// A CSV file's rows as objects keyed by the (lower-case) header names.
export function parseCsv(text) {
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
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Rows from a CSV as contacts: a phone column (phone, mobile, number,
// whatsapp), a name column, tags (separated by | or ,) and the rest kept as
// details to use in messages.
export function contactsFromRows(rows, { tags = [] } = {}) {
  const PHONE = ['phone', 'mobile', 'number', 'whatsapp', 'phone number', 'mobile number', 'contact'];
  const NAME = ['name', 'full name', 'customer', 'customer name'];
  const ok = [];
  const bad = [];
  rows.forEach((r, i) => {
    const phoneKey = PHONE.find((k) => r[k]);
    const wa = waNumber(phoneKey ? r[phoneKey] : '');
    if (!wa) return bad.push({ row: i + 2, value: phoneKey ? r[phoneKey] : '(no phone)' });
    const nameKey = NAME.find((k) => r[k]);
    const own = String(r.tags || r.tag || '').split(/[|,]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const attributes = Object.fromEntries(Object.entries(r).filter(([k, v]) => v && ![...PHONE, ...NAME, 'tags', 'tag'].includes(k)).map(([k, v]) => [k.replace(/[^a-z0-9_]/g, '_'), v.slice(0, 200)]));
    ok.push({ wa, name: (nameKey ? r[nameKey] : '').slice(0, 80), tags: [...new Set([...tags, ...own])], attributes });
  });
  return { contacts: ok, bad };
}

// The value for one slot, for one contact: { source: 'static', value } or
// { source: 'field', field: 'first_name' | 'name' | 'phone' | <detail>, fallback }.
export function valueFor(mapping, contact = {}) {
  if (!mapping) return '';
  if (mapping.source === 'field') {
    const name = String(contact.name || '').trim();
    const fields = {
      name,
      first_name: name.split(/\s+/)[0] || '',
      phone: contact.wa ? showNumber(contact.wa) : '',
      ...(contact.attributes || {}),
    };
    const v = String(fields[mapping.field] ?? '').trim();
    return v || String(mapping.fallback ?? '').trim();
  }
  return String(mapping.value ?? '').trim();
}

// All the values a template needs for one contact, from the campaign's
// mapping: { header, headerLink, body: [], buttons: { index: value } }.
export function valuesFor(template, mapping = {}, contact = {}) {
  const slots = slotsOf(template);
  return {
    header: slots.header?.kind === 'text' ? valueFor(mapping.header, contact) : undefined,
    headerLink: slots.header && slots.header.kind !== 'text' ? String(mapping.headerLink || '') : undefined,
    headerFilename: slots.header?.kind === 'document' ? String(mapping.headerFilename || 'document.pdf') : undefined,
    body: Array.from({ length: slots.body }, (_, i) => valueFor(mapping.body?.[i], contact)),
    buttons: Object.fromEntries(slots.buttons.map((b) => [b.index, valueFor(mapping.buttons?.[b.index], contact)])),
  };
}

// What's missing before a template can go to this contact, or null.
export function missingValues(template, values) {
  const slots = slotsOf(template);
  if (slots.header?.kind === 'text' && !values.header) return 'the header variable';
  if (slots.header && slots.header.kind !== 'text' && !/^https:\/\//.test(values.headerLink || '')) return `the header ${slots.header.kind}`;
  const empty = values.body.findIndex((v) => !v);
  if (empty !== -1) return `variable {{${empty + 1}}}`;
  const button = slots.buttons.find((b) => !values.buttons[b.index]);
  if (button) return `the "${button.text}" button`;
  return null;
}

// The message for Meta's /messages: a template with its values.
export function templateMessage(to, template, values) {
  const slots = slotsOf(template);
  const components = [];
  if (slots.header?.kind === 'text') components.push({ type: 'header', parameters: [{ type: 'text', text: values.header }] });
  else if (slots.header) {
    const media = { link: values.headerLink, ...(slots.header.kind === 'document' ? { filename: values.headerFilename } : {}) };
    components.push({ type: 'header', parameters: [{ type: slots.header.kind, [slots.header.kind]: media }] });
  }
  if (slots.body) components.push({ type: 'body', parameters: values.body.map((text) => ({ type: 'text', text })) });
  for (const b of slots.buttons) {
    const v = slots.auth ? values.body[0] : values.buttons[b.index];
    if (b.kind === 'copy_code') components.push({ type: 'button', sub_type: 'copy_code', index: String(b.index), parameters: [{ type: 'coupon_code', coupon_code: v }] });
    else components.push({ type: 'button', sub_type: 'url', index: String(b.index), parameters: [{ type: 'text', text: v }] });
  }
  return { to, type: 'template', template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) } };
}

// A bot menu: up to 3 choices as buttons, more as a list (up to 10).
export function menuMessage(to, { text, button = 'Choose', options }) {
  const opts = options.slice(0, 10);
  if (opts.length <= 3) {
    return { to, type: 'interactive', interactive: { type: 'button', body: { text: String(text).slice(0, 1024) }, action: { buttons: opts.map((o) => ({ type: 'reply', reply: { id: o.id, title: String(o.title).slice(0, 20) } })) } } };
  }
  return {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: String(text).slice(0, 1024) },
      action: { button: String(button || 'Choose').slice(0, 20), sections: [{ title: 'Options', rows: opts.map((o) => ({ id: o.id, title: String(o.title).slice(0, 24), ...(o.description ? { description: String(o.description).slice(0, 72) } : {}) })) }] },
    },
  };
}

export const textMessage = (to, body) => ({ to, type: 'text', text: { body: String(body).slice(0, 4096), preview_url: /https?:\/\//.test(body) } });

// Meta signs each notification with the app secret (X-Hub-Signature-256).
export function signatureOk(rawBody, header, appSecret) {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// A notification's contents: messages that came in, status changes of
// messages sent, and template approvals.
export function readNotification(payload = {}) {
  const incoming = [];
  const statuses = [];
  const templates = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (change.field === 'message_template_status_update') {
        templates.push({ id: String(v.message_template_id || ''), name: v.message_template_name, language: v.message_template_language, status: v.event, reason: v.reason || '' });
        continue;
      }
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of v.messages || []) {
        const text =
          m.text?.body ||
          m.button?.text ||
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title ||
          m.image?.caption ||
          m.video?.caption ||
          m.document?.caption ||
          (m.location ? `📍 ${[m.location.name, m.location.address].filter(Boolean).join(', ') || `${m.location.latitude}, ${m.location.longitude}`}` : '') ||
          (m.reaction ? `Reacted ${m.reaction.emoji || ''}` : '') ||
          '';
        incoming.push({
          id: m.id,
          from: m.from,
          name: names[m.from] || '',
          type: m.type,
          text,
          media: m.image || m.video || m.audio || m.document || m.sticker ? { kind: m.type, id: (m.image || m.video || m.audio || m.document || m.sticker).id, mime: (m.image || m.video || m.audio || m.document || m.sticker).mime_type, filename: m.document?.filename } : null,
          replyTo: m.context?.id || null,
          // A shared location.
          location: m.location ? { lat: Number(m.location.latitude), lng: Number(m.location.longitude), name: m.location.name || '', address: m.location.address || '' } : null,
          // A tap on a bot's button or list row, or a template's quick reply.
          replyId: m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || m.button?.payload || null,
          at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
        });
      }
      for (const s of v.statuses || []) {
        statuses.push({
          id: s.id,
          to: s.recipient_id,
          status: s.status,
          at: new Date(Number(s.timestamp) * 1000 || Date.now()).toISOString(),
          error: s.errors?.[0] ? { code: s.errors[0].code, title: s.errors[0].title, detail: s.errors[0].error_data?.details || s.errors[0].message || '' } : null,
          pricing: s.pricing ? { category: s.pricing.category, billable: s.pricing.billable } : null,
        });
      }
    }
  }
  return { incoming, statuses, templates };
}

const STOP = /^\s*(stop|unsubscribe|opt ?out|cancel|stop all|நிறுத்து)\s*[.!]?\s*$/i;
const START = /^\s*(start|subscribe|opt ?in|unstop)\s*[.!]?\s*$/i;
export const isStop = (text) => STOP.test(text || '');
export const isStart = (text) => START.test(text || '');

// Plain words for Meta's common send errors.
const ERRORS = {
  131047: 'More than 24 hours since they last wrote: only a template can be sent.',
  131026: 'This number is not on WhatsApp, or can’t receive messages.',
  131049: 'Meta held this marketing message back to keep engagement healthy. Try again later.',
  131050: 'They stopped marketing messages from this business.',
  131051: 'This kind of message is not supported.',
  131056: 'Too many messages to this number in a short time.',
  132000: 'The number of values doesn’t match the template’s variables.',
  132001: 'The template doesn’t exist in this language, or isn’t approved yet.',
  132005: 'A value is too long for the template.',
  132007: 'A value breaks WhatsApp’s formatting rules.',
  132012: 'A value is in the wrong format for the template.',
  130429: 'Sending too fast; it will be retried.',
  131048: 'Spam rate limit: too many messages were blocked or reported.',
  368: 'The number is temporarily blocked by Meta for policy reasons.',
  190: 'The access token has expired or is wrong.',
  100: 'Meta refused a value in the message.',
};
export const plainError = (code, fallback) => ERRORS[code] || fallback || 'WhatsApp could not deliver this message.';
