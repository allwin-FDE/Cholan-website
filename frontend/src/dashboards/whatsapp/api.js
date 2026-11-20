import { adminFetch } from '../shared/api.js';

// The /whatsapp dashboard's calls to /api/admin/whatsapp (backend
// routes/whatsapp.js), signed with the person's login.
const call = (path, options = {}) => adminFetch(path, { ...options, base: '/api/admin/whatsapp' });
const post = (path, body) => call(path, { method: 'POST', body: body ?? {} });

export const wa = {
  status: () => call('/status'),
  saveSettings: (body) => call('/settings', { method: 'PUT', body }),
  test: (body) => post('/test', body),
  overview: (days) => call(`/overview?days=${days}`),

  templates: () => call('/templates'),
  syncTemplates: () => post('/templates/sync'),
  createTemplate: (form) => post('/templates', form),
  deleteTemplate: (name, language) => call(`/templates/${encodeURIComponent(name)}?language=${encodeURIComponent(language)}`, { method: 'DELETE' }),
  uploadSample: (file) => call('/templates/sample', { method: 'POST', raw: file, contentType: file.type }),
  uploadMedia: (file) => call('/media', { method: 'POST', raw: file, contentType: file.type }),

  contacts: () => call('/contacts'),
  saveContact: (body) => (body.id ? call(`/contacts/${body.id}`, { method: 'PUT', body }) : post('/contacts', body)),
  deleteContact: (id) => call(`/contacts/${id}`, { method: 'DELETE' }),
  bulk: (body) => post('/contacts/bulk', body),
  importCsv: (body) => post('/contacts/import', body),
  importEnquiries: (body) => post('/contacts/import-enquiries', body),
  importCustomers: (body) => post('/contacts/import-customers', body),

  campaigns: () => call('/campaigns'),
  campaign: (id) => call(`/campaigns/${id}`),
  previewCampaign: (body) => post('/campaigns/preview', body),
  createCampaign: (body) => post('/campaigns', body),
  campaignAction: (id, action, body) => post(`/campaigns/${id}/${action}`, body),

  inbox: () => call('/inbox'),
  conversation: (id) => call(`/inbox/${id}`),
  markRead: (id) => post(`/inbox/${id}/read`),
  reply: (id, body) => post(`/inbox/${id}/reply`, body),

  automations: () => call('/automations'),
  saveAutomation: (body) => (body.id ? call(`/automations/${body.id}`, { method: 'PUT', body }) : post('/automations', body)),
  deleteAutomation: (id) => call(`/automations/${id}`, { method: 'DELETE' }),
};

export const showNumber = (n) => (/^91\d{10}$/.test(n || '') ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : n ? `+${n}` : '');
