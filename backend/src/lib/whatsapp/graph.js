// The WhatsApp Cloud API (Meta Graph API) for the /whatsapp dashboard:
// message templates, sending, media uploads and the phone number's health.
//
// graph() returns the real client when the token and IDs are set, or a
// stand-in when WHATSAPP_FAKE=1 (local testing: every call answers as Meta
// would and nothing leaves the machine). Code that sends takes the client as
// an argument, so tests pass their own.
import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';

export class GraphError extends Error {
  constructor(message, { status, code, subcode, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.details = details;
  }
}

// What is set up, without revealing any secret.
export function connection(c = config.whatsapp) {
  const missing = [];
  if (!c.token) missing.push('access token');
  if (!c.phoneNumberId) missing.push('phone number ID');
  if (!c.wabaId) missing.push('WhatsApp Business Account ID');
  return {
    ready: c.fake || missing.length === 0,
    fake: c.fake,
    missing: c.fake ? [] : missing,
    webhookReady: Boolean(c.verifyToken && c.appSecret),
    canUploadMedia: c.fake || Boolean(c.appId && c.token),
    phoneNumberId: c.phoneNumberId,
    wabaId: c.wabaId,
    graphVersion: c.graphVersion,
  };
}

const PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';

function realGraph(c) {
  const base = `https://graph.facebook.com/${c.graphVersion}`;
  async function call(method, path, { body, query, headers = {}, raw } = {}) {
    const url = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, String(v));
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: raw || (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const e = data.error || {};
      throw new GraphError(e.error_user_msg || e.message || `WhatsApp answered ${response.status}.`, {
        status: response.status,
        code: e.code,
        subcode: e.error_subcode,
        details: e.error_data?.details,
      });
    }
    return data;
  }
  return {
    fake: false,
    phone: () => call('GET', c.phoneNumberId, { query: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,name_status,throughput' } }),
    listTemplates: async () => {
      const all = [];
      let after = '';
      for (let page = 0; page < 20; page += 1) {
        const data = await call('GET', `${c.wabaId}/message_templates`, { query: { fields: 'id,name,status,category,language,components,rejected_reason,quality_score', limit: 100, after } });
        all.push(...(data.data || []));
        after = data.paging?.cursors?.after;
        if (!data.paging?.next || !after) break;
      }
      return all;
    },
    createTemplate: (template) => call('POST', `${c.wabaId}/message_templates`, { body: template }),
    deleteTemplate: (name, id) => call('DELETE', `${c.wabaId}/message_templates`, { query: { name, hsm_id: id } }),
    // A rejected (or approved) template's new wording; Meta reviews it again.
    editTemplate: (id, body) => call('POST', String(id), { body }),
    // The business profile customers see on the number (About, description,
    // address, email, websites, category, picture).
    profile: async () => (await call('GET', `${c.phoneNumberId}/whatsapp_business_profile`, { query: { fields: PROFILE_FIELDS } })).data?.[0] || {},
    updateProfile: (fields) => call('POST', `${c.phoneNumberId}/whatsapp_business_profile`, { body: { messaging_product: 'whatsapp', ...fields } }),
    send: (message) => call('POST', `${c.phoneNumberId}/messages`, { body: { messaging_product: 'whatsapp', recipient_type: 'individual', ...message } }),
    markRead: (messageId) => call('POST', `${c.phoneNumberId}/messages`, { body: { messaging_product: 'whatsapp', status: 'read', message_id: messageId } }),
    // A sample file for a template's media header (Meta's resumable upload):
    // returns the handle Meta wants in the template's example.
    uploadSample: async (buffer, type) => {
      const session = await call('POST', `${c.appId}/uploads`, { query: { file_length: buffer.length, file_type: type } });
      const done = await fetch(`${base}/${session.id}`, {
        method: 'POST',
        headers: { Authorization: `OAuth ${c.token}`, file_offset: '0' },
        body: buffer,
        signal: AbortSignal.timeout(60_000),
      }).then((r) => r.json());
      if (!done.h) throw new GraphError(done.error?.message || 'The sample file did not upload to WhatsApp.');
      return done.h;
    },
  };
}

// Answers like Meta, from memory. Templates are approved a moment after
// they are made, so the whole flow can be tried locally.
function fakeGraph() {
  const templates = new Map();
  let profile = { about: 'Pure goodness, always.', address: '32/B2, SP Kannusamy Street, Coimbatore 641027', description: 'Cholan Rice (test profile).', email: '', websites: ['https://www.cholanrice.in/'], vertical: 'GROCERY', profile_picture_url: '' };
  return {
    fake: true,
    profile: async () => ({ ...profile }),
    updateProfile: async ({ messaging_product: _mp, profile_picture_handle: handle, ...fields }) => {
      profile = { ...profile, ...fields, ...(handle ? { profile_picture_url: 'https://www.cholanrice.in/images/cholan-logo.png' } : {}) };
      return { success: true };
    },
    phone: async () => ({ display_phone_number: '+91 90922 66667', verified_name: 'Cholan Rice (test)', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K', code_verification_status: 'VERIFIED', name_status: 'APPROVED' }),
    listTemplates: async () => [...templates.values()],
    createTemplate: async (t) => {
      const id = String(Date.now()) + Math.floor(Math.random() * 1000);
      templates.set(`${t.name}|${t.language}`, { id, status: 'APPROVED', ...t });
      return { id, status: 'PENDING', category: t.category };
    },
    editTemplate: async (id, body) => {
      for (const t of templates.values()) if (t.id === String(id)) Object.assign(t, body, { status: 'APPROVED' });
      return { success: true };
    },
    deleteTemplate: async (name) => {
      for (const k of templates.keys()) if (k.startsWith(`${name}|`)) templates.delete(k);
      return { success: true };
    },
    send: async (message) => {
      if (String(message.to).endsWith('0000')) throw new GraphError('Message failed to send because more than 24 hours have passed since the customer last replied to this number.', { status: 400, code: 131047 });
      return { messaging_product: 'whatsapp', contacts: [{ input: message.to, wa_id: message.to }], messages: [{ id: `wamid.FAKE${randomUUID().replace(/-/g, '')}` }] };
    },
    markRead: async () => ({ success: true }),
    uploadSample: async () => `4::fake-handle-${randomUUID()}`,
  };
}

let shared = null;
export function graph(c = config.whatsapp) {
  if (c.fake) return (shared ??= fakeGraph());
  if (!connection(c).ready) throw Object.assign(new Error(`WhatsApp is not connected yet: missing ${connection(c).missing.join(', ')}.`), { status: 503, code: 'not-connected' });
  return realGraph(c);
}
