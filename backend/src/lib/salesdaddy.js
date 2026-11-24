// Sales Daddy (CRM) side of the push: each enquiry becomes a lead in the
// workspace the API key belongs to. Sales Daddy dedupes by mobile number, so
// a repeat enquirer comes back as `duplicate: true` with their existing lead;
// the new enquiry is then added to that lead as a note, so no message is lost.
import { config } from '../config.js';

async function call(path, body, { method = body ? 'POST' : 'GET', timeoutMs = 15_000 } = {}) {
  const response = await fetch(`${config.salesDaddy.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.salesDaddy.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Sales Daddy ${response.status}: ${data.error || ''} ${data.message || ''}`.trim());
  }
  return data;
}

// What the sales team reads on the lead: the enquiry itself, then where on
// the site it came from.
function noteFor(row) {
  let meta = {};
  try {
    meta = row.meta ? JSON.parse(row.meta) : {};
  } catch {
    // An unreadable meta column loses the page details, not the note.
  }
  const arrived = [meta.utmSource, meta.utmMedium].filter(Boolean).join(' / ') || meta.referrer;
  const lines = [
    `Website enquiry: ${row.enquiry_type}`,
    row.product && `Product: ${row.product}`,
    `Message: ${row.message}`,
    meta.page && `Sent from: ${meta.page}`,
    arrived && `Came from: ${arrived}`,
    meta.utmCampaign && `Campaign: ${meta.utmCampaign}`,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 2000);
}

// Returns the Sales Daddy lead id.
export async function pushLead(row) {
  const note = noteFor(row);
  const lead = await call('/leads', {
    name: row.name,
    mobile: row.phone,
    ...(row.email ? { email: row.email } : {}),
    source: config.salesDaddy.source,
    note,
    clientRef: row.id,
  });
  if (lead.duplicate) await call(`/leads/${lead.leadId}/notes`, { body: note });
  return lead.leadId;
}

// A store-finder visitor (name and mobile, no message) as a lead, with the
// store-finder tag. A number Sales Daddy already knows keeps its lead: the
// search is added as a note and the tag added to its own. The customer's
// search waits on this, so each call gives up after a few seconds (a failed
// one is retried later, see stores/service.js).
export async function pushFinderLead({ name, phone, city, note }) {
  const { source, finderTag: tag } = config.salesDaddy;
  const quick = { timeoutMs: 5000 };
  const lead = await call(
    '/leads',
    {
      name: String(name).slice(0, 200),
      mobile: phone,
      source,
      ...(tag ? { tags: [tag] } : {}),
      ...(city ? { city: String(city).slice(0, 100) } : {}),
      note: String(note).slice(0, 2000),
    },
    quick,
  );
  const id = lead.leadId || lead.lead?.id;
  if (lead.duplicate && id) {
    await call(`/leads/${encodeURIComponent(id)}/notes`, { body: String(note).slice(0, 2000) }, quick);
    if (tag) {
      const got = await call(`/leads/${encodeURIComponent(id)}`, null, quick);
      const tags = got.lead?.tags || [];
      if (!tags.includes(tag)) await call(`/leads/${encodeURIComponent(id)}`, { tags: [...tags, tag].slice(0, 20) }, { ...quick, method: 'PATCH' });
    }
  }
  return { leadId: id || '', duplicate: Boolean(lead.duplicate) };
}
