// Sales Daddy (CRM) side of the push: each enquiry becomes a lead in the
// workspace the API key belongs to. Sales Daddy dedupes by mobile number, so
// a repeat enquirer comes back as `duplicate: true` with their existing lead;
// the new enquiry is then added to that lead as a note, so no message is lost.
import { config } from '../config.js';

async function call(path, body) {
  const response = await fetch(`${config.salesDaddy.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.salesDaddy.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
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
