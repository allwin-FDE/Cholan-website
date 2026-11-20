// WhatsApp message templates: the dashboard's form to Meta's format and back,
// with Meta's rules checked first, so a template isn't rejected for a typo.
//
// The form:
//   { name, language, category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
//     header: { type: 'none' | 'text' | 'image' | 'video' | 'document', text, example, handle },
//     body: { text, examples: ['Lakshmi', '₹520'] },
//     footer: { text },
//     buttons: [{ type: 'quick_reply', text } | { type: 'url', text, url, example }
//               | { type: 'phone', text, phone } | { type: 'copy_code', example }],
//     auth: { securityNote: true, expiresMinutes: 10, buttonText: 'Copy code' } }
// Variables are {{1}}, {{2}}… in order, as Meta wants.

export class TemplateError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.status = 400;
    this.fields = fields;
  }
}

export const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
export const LANGUAGES = {
  en: 'English',
  en_US: 'English (US)',
  en_GB: 'English (UK)',
  ta: 'Tamil',
  hi: 'Hindi',
  ml: 'Malayalam',
  te: 'Telugu',
  kn: 'Kannada',
};
const MEDIA = { image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT' };

// The numbers of the {{n}} variables in a text, in the order they appear.
export const variablesIn = (text = '') => [...String(text).matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));

function checkVariables(text, where, fields, key) {
  const nums = variablesIn(text);
  if (!nums.length) return 0;
  const unique = [...new Set(nums)];
  const sorted = [...unique].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) {
    fields[key] = `Number the variables {{1}}, {{2}}, {{3}}… with none missing.`;
  }
  if (/\{\{[^}]*\}\}/.test(String(text).replace(/\{\{\s*\d+\s*\}\}/g, ''))) fields[key] = 'Variables are numbers only, like {{1}}.';
  const trimmed = String(text).trim();
  if (/^\{\{\s*\d+\s*\}\}/.test(trimmed) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(trimmed)) {
    fields[key] = fields[key] || `The ${where} can't start or end with a variable. Add a word before or after it.`;
  }
  return unique.length;
}

// Checks the form and returns Meta's template body.
export function buildTemplate(form = {}) {
  const fields = {};
  const name = String(form.name || '').trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) fields.name = 'Use small letters, numbers and _ only, like order_update.';
  const language = String(form.language || 'en');
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) fields.language = 'Choose a language.';
  const category = String(form.category || '').toUpperCase();
  if (!CATEGORIES.includes(category)) fields.category = 'Choose Marketing, Utility or Authentication.';

  // Authentication templates have a fixed body Meta writes itself.
  if (category === 'AUTHENTICATION') {
    if (Object.keys(fields).length) throw new TemplateError('Please check the highlighted details.', fields);
    const auth = form.auth || {};
    const minutes = auth.expiresMinutes === '' || auth.expiresMinutes == null ? null : Number(auth.expiresMinutes);
    if (minutes != null && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= 90)) {
      throw new TemplateError('The code can last 1 to 90 minutes.', { expiresMinutes: '1 to 90 minutes.' });
    }
    return {
      name,
      language,
      category,
      components: [
        { type: 'BODY', add_security_recommendation: auth.securityNote !== false },
        ...(minutes ? [{ type: 'FOOTER', code_expiration_minutes: minutes }] : []),
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: String(auth.buttonText || 'Copy code').slice(0, 25) }] },
      ],
    };
  }

  const components = [];
  const header = form.header || { type: 'none' };
  if (header.type === 'text') {
    const text = String(header.text || '').trim();
    if (!text) fields.headerText = 'Type the header, or choose no header.';
    else if (text.length > 60) fields.headerText = 'A header is at most 60 characters.';
    const n = variablesIn(text).length;
    if (n > 1) fields.headerText = 'A header can have one variable, {{1}}.';
    if (n === 1 && variablesIn(text)[0] !== 1) fields.headerText = 'The header variable must be {{1}}.';
    if (n === 1 && !String(header.example || '').trim()) fields.headerExample = 'Give an example for {{1}}, so Meta can check it.';
    components.push({ type: 'HEADER', format: 'TEXT', text, ...(n === 1 ? { example: { header_text: [String(header.example).trim()] } } : {}) });
  } else if (MEDIA[header.type]) {
    if (!header.handle) fields.headerMedia = `Add a sample ${header.type}, so Meta can check it.`;
    components.push({ type: 'HEADER', format: MEDIA[header.type], example: { header_handle: [header.handle] } });
  } else if (header.type && header.type !== 'none') fields.headerType = 'Choose the header.';

  const body = String(form.body?.text || '').trim();
  if (!body) fields.body = 'Type the message.';
  else if (body.length > 1024) fields.body = 'The message is at most 1,024 characters.';
  const bodyVars = checkVariables(body, 'message', fields, 'body');
  const examples = (form.body?.examples || []).map((e) => String(e ?? '').trim());
  if (bodyVars && examples.slice(0, bodyVars).filter(Boolean).length < bodyVars) fields.bodyExamples = `Give an example for each of the ${bodyVars} variables.`;
  if (bodyVars && body.replace(/\{\{\s*\d+\s*\}\}/g, '').trim().split(/\s+/).length < bodyVars * 2 + 1) {
    fields.body = fields.body || 'There are too many variables for the length of the message. Add more words around them.';
  }
  components.push({ type: 'BODY', text: body, ...(bodyVars ? { example: { body_text: [examples.slice(0, bodyVars)] } } : {}) });

  const footer = String(form.footer?.text || '').trim();
  if (footer) {
    if (footer.length > 60) fields.footer = 'The footer is at most 60 characters.';
    if (variablesIn(footer).length) fields.footer = 'The footer cannot have variables.';
    components.push({ type: 'FOOTER', text: footer });
  }

  const buttons = (form.buttons || []).filter((b) => b && b.type);
  if (buttons.length > 10) fields.buttons = 'At most 10 buttons.';
  const count = (t) => buttons.filter((b) => b.type === t).length;
  if (count('url') > 2) fields.buttons = 'At most 2 website buttons.';
  if (count('phone') > 1) fields.buttons = 'At most 1 call button.';
  if (count('copy_code') > 1) fields.buttons = 'At most 1 copy-code button.';
  const out = buttons.map((b, i) => {
    const text = String(b.text || '').trim();
    if (b.type !== 'copy_code' && (!text || text.length > 25)) fields[`button${i}`] = 'Button text: 1 to 25 characters.';
    if (b.type === 'quick_reply') return { type: 'QUICK_REPLY', text };
    if (b.type === 'url') {
      const url = String(b.url || '').trim();
      if (!/^https:\/\/[^\s]+$/.test(url)) fields[`button${i}`] = 'The link must start with https://';
      const vars = variablesIn(url);
      if (vars.length > 1 || (vars.length === 1 && !/\{\{\s*1\s*\}\}$/.test(url))) fields[`button${i}`] = 'A link can have one variable, {{1}}, at its end.';
      if (vars.length === 1 && !String(b.example || '').trim()) fields[`button${i}`] = 'Give an example for the end of the link.';
      return { type: 'URL', text, url, ...(vars.length ? { example: [url.replace(/\{\{\s*1\s*\}\}$/, String(b.example).trim())] } : {}) };
    }
    if (b.type === 'phone') {
      const phone = String(b.phone || '').replace(/[^\d+]/g, '');
      if (!/^\+\d{8,15}$/.test(phone)) fields[`button${i}`] = 'Give the number with the country code, like +919092266667.';
      return { type: 'PHONE_NUMBER', text, phone_number: phone };
    }
    if (b.type === 'copy_code') {
      const example = String(b.example || '').trim();
      if (!example || example.length > 15) fields[`button${i}`] = 'Give an example code, up to 15 characters.';
      return { type: 'COPY_CODE', example };
    }
    fields[`button${i}`] = 'Choose the kind of button.';
    return null;
  });
  // Meta wants quick replies together, not mixed in between the other buttons.
  const firstOther = out.findIndex((b) => b && b.type !== 'QUICK_REPLY');
  const lastQuick = out.map((b) => b?.type).lastIndexOf('QUICK_REPLY');
  if (firstOther !== -1 && lastQuick > firstOther && out.slice(0, firstOther).some((b) => b?.type === 'QUICK_REPLY')) {
    fields.buttons = 'Keep the quick-reply buttons together, before or after the other buttons.';
  }
  if (out.length) components.push({ type: 'BUTTONS', buttons: out });

  if (Object.keys(fields).length) throw new TemplateError('Please check the highlighted details.', fields);
  return { name, language, category, components };
}

// What a template needs filled in when it is sent, read from Meta's
// components: { header: null | { kind: 'text' } | { kind: 'image'|'video'|'document' },
//   body: n, buttons: [{ index, kind: 'url' | 'copy_code' | 'otp' }], auth }.
export function slotsOf(template) {
  const comps = template?.components || [];
  const header = comps.find((c) => c.type === 'HEADER');
  const body = comps.find((c) => c.type === 'BODY');
  const buttons = comps.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const auth = template?.category === 'AUTHENTICATION';
  return {
    auth,
    header: !header ? null : header.format === 'TEXT' ? (variablesIn(header.text).length ? { kind: 'text' } : null) : { kind: header.format.toLowerCase() },
    body: auth ? 1 : new Set(variablesIn(body?.text)).size,
    buttons: buttons
      .map((b, index) => {
        if (b.type === 'URL' && variablesIn(b.url).length) return { index, kind: 'url', text: b.text };
        if (b.type === 'COPY_CODE') return { index, kind: 'copy_code', text: 'Copy code' };
        if (b.type === 'OTP') return { index, kind: 'otp', text: b.text };
        return null;
      })
      .filter(Boolean),
  };
}

// The template's text with the values put in, for previews and the inbox.
export function renderText(template, values = {}) {
  const comps = template?.components || [];
  const fill = (text, list) => String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => list?.[Number(n) - 1] ?? m);
  const header = comps.find((c) => c.type === 'HEADER');
  const body = comps.find((c) => c.type === 'BODY');
  const footer = comps.find((c) => c.type === 'FOOTER');
  if (template?.category === 'AUTHENTICATION') return `${values.body?.[0] || '{{1}}'} is your verification code.`;
  return [header?.format === 'TEXT' ? fill(header.text, values.header ? [values.header] : []) : '', fill(body?.text, values.body), footer?.text || '']
    .filter(Boolean)
    .join('\n\n');
}
