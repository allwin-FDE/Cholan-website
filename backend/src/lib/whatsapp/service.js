// The /whatsapp dashboard's data and work, in Firestore (the prefix keeps
// local testing in dev_ collections):
//
//   wa_settings/main      replies for STOP/START, sending speed
//   wa_templates/{name__lang}  Meta's templates, kept in step by sync and notifications
//   wa_contacts/{wa}      people: name, tags, details, consent, opted out, last message
//   wa_campaigns/{id}     a template sent to an audience, with its counts
//   wa_queue/{id}         each message waiting to go (campaigns and automations)
//   wa_messages/{wamid}   every message in and out, with its delivery status
//   wa_automations/{id}   keyword replies, welcome, and order/enquiry messages
//
// Sending goes through the queue: a campaign queues its messages, and the
// tick (Cloud Scheduler, every minute) sends them at a steady pace, so a
// large audience never depends on one web request staying open. Queries use
// only single-field indexes (Firestore makes those by itself).
import { FieldValue } from '@google-cloud/firestore';
import { collection } from '../firestore.js';
import { buildTemplate, renderText, slotsOf } from './templates.js';
import { isStart, isStop, missingValues, plainError, showNumber, templateMessage, textMessage, valuesFor, waNumber } from './messages.js';

export class WaError extends Error {
  constructor(message, { status = 400, fields, code } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

const col = {
  settings: () => collection('wa_settings'),
  templates: () => collection('wa_templates'),
  contacts: () => collection('wa_contacts'),
  campaigns: () => collection('wa_campaigns'),
  queue: () => collection('wa_queue'),
  messages: () => collection('wa_messages'),
  automations: () => collection('wa_automations'),
};
const now = () => new Date().toISOString();
const DAY = 86_400_000;
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const cleanTags = (tags) => [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(/[|,]/)).map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-')).filter((t) => /^[a-z0-9-]{1,30}$/.test(t)))].slice(0, 20);

// ---- Settings ----
export const DEFAULT_SETTINGS = {
  optOutReply: 'You will not get offers from Cholan Rice on WhatsApp any more. Reply START to get them again.',
  optInReply: 'Welcome back! You will get offers from Cholan Rice on WhatsApp again. Reply STOP any time to stop.',
  perTick: 300,
};
export async function getSettings() {
  const doc = await col.settings().doc('main').get();
  return { ...DEFAULT_SETTINGS, ...(doc.exists ? doc.data() : {}) };
}
export async function saveSettings(body, by) {
  const next = {
    optOutReply: String(body.optOutReply ?? DEFAULT_SETTINGS.optOutReply).slice(0, 1000),
    optInReply: String(body.optInReply ?? DEFAULT_SETTINGS.optInReply).slice(0, 1000),
    perTick: Math.min(Math.max(Number(body.perTick) || DEFAULT_SETTINGS.perTick, 10), 1000),
    updatedAt: now(),
    updatedBy: by,
  };
  await col.settings().doc('main').set(next, { merge: true });
  return getSettings();
}

// ---- Templates ----
const templateKey = (name, language) => `${name}__${language}`;
export async function listTemplates() {
  return docs(await col.templates().get()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
export async function getTemplate(name, language) {
  const doc = await col.templates().doc(templateKey(name, language)).get();
  if (!doc.exists) throw new WaError(`The template ${name} (${language}) isn't here. Sync templates from Meta, or make it first.`, { status: 404 });
  return { id: doc.id, ...doc.data() };
}
export async function syncTemplates(g) {
  const remote = await g.listTemplates();
  const batch = col.templates().firestore.batch();
  const seen = new Set();
  for (const t of remote) {
    const key = templateKey(t.name, t.language);
    seen.add(key);
    batch.set(col.templates().doc(key), { metaId: String(t.id || ''), name: t.name, language: t.language, category: t.category, status: t.status, components: t.components || [], rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : '', quality: t.quality_score?.score || '', syncedAt: now(), updatedAt: now() }, { merge: true });
  }
  // Templates deleted at Meta are marked, not removed, so old campaigns still read.
  for (const t of await listTemplates()) if (!seen.has(t.id) && t.status !== 'DELETED') batch.set(col.templates().doc(t.id), { status: 'DELETED', updatedAt: now() }, { merge: true });
  await batch.commit();
  return listTemplates();
}
export async function createTemplate(g, form, by) {
  const body = buildTemplate(form);
  const key = templateKey(body.name, body.language);
  if ((await col.templates().doc(key).get()).exists) throw new WaError(`A template called ${body.name} in this language already exists. Choose another name.`, { fields: { name: 'Already used.' } });
  const made = await g.createTemplate(body);
  const saved = { metaId: String(made.id || ''), ...body, status: made.status || 'PENDING', rejectedReason: '', form, createdBy: by, createdAt: now(), updatedAt: now() };
  await col.templates().doc(key).set(saved);
  return { id: key, ...saved };
}
export async function deleteTemplate(g, name, language) {
  const t = await getTemplate(name, language);
  await g.deleteTemplate(name, t.metaId || undefined);
  await col.templates().doc(t.id).set({ status: 'DELETED', updatedAt: now() }, { merge: true });
}

// ---- Contacts ----
export async function listContacts() {
  return docs(await col.contacts().limit(20000).get()).sort((a, b) => String(b.lastMessageAt || b.createdAt || '').localeCompare(String(a.lastMessageAt || a.createdAt || '')));
}
export async function saveContact(raw, { source = 'added', by } = {}) {
  const wa = waNumber(raw.wa || raw.phone);
  if (!wa) throw new WaError('Enter a WhatsApp number with the country code, or a 10-digit Indian mobile.', { fields: { phone: 'Check the number.' } });
  const ref = col.contacts().doc(wa);
  const existing = await ref.get();
  const cur = existing.exists ? existing.data() : {};
  const next = {
    wa,
    name: raw.name !== undefined ? String(raw.name).trim().slice(0, 80) : cur.name || '',
    tags: raw.tags !== undefined ? cleanTags(raw.tags) : cur.tags || [],
    attributes: raw.attributes !== undefined ? Object.fromEntries(Object.entries(raw.attributes || {}).filter(([k]) => /^[a-z0-9_]{1,30}$/.test(k)).map(([k, v]) => [k, String(v).slice(0, 200)])) : cur.attributes || {},
    consent: raw.consent !== undefined ? Boolean(raw.consent) : Boolean(cur.consent),
    optedOut: raw.optedOut !== undefined ? Boolean(raw.optedOut) : Boolean(cur.optedOut),
    updatedAt: now(),
    ...(existing.exists ? {} : { source, createdAt: now(), createdBy: by || source }),
  };
  if (raw.optedOut !== undefined && Boolean(raw.optedOut) !== Boolean(cur.optedOut)) next.optedOutAt = next.optedOut ? now() : null;
  await ref.set(next, { merge: true });
  return { id: wa, ...cur, ...next };
}
// Many contacts at once (imports): existing ones keep their name if the new
// one is empty, gain the tags, and keep an opt-out.
export async function importContacts(list, { source, consent, by }) {
  let added = 0;
  let updated = 0;
  for (let i = 0; i < list.length; i += 400) {
    const slice = list.slice(i, i + 400);
    const refs = slice.map((c) => col.contacts().doc(c.wa));
    const snaps = await col.contacts().firestore.getAll(...refs);
    const batch = col.contacts().firestore.batch();
    slice.forEach((c, j) => {
      const cur = snaps[j].exists ? snaps[j].data() : null;
      if (cur) updated += 1;
      else added += 1;
      batch.set(
        refs[j],
        {
          wa: c.wa,
          name: c.name || cur?.name || '',
          tags: cleanTags([...(cur?.tags || []), ...(c.tags || [])]),
          attributes: { ...(cur?.attributes || {}), ...(c.attributes || {}) },
          consent: Boolean(cur?.consent) || Boolean(consent),
          optedOut: Boolean(cur?.optedOut),
          updatedAt: now(),
          ...(cur ? {} : { source, createdAt: now(), createdBy: by }),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
  return { added, updated };
}
export async function bulkContacts(body) {
  const was = (body.was || []).map(waNumber).filter(Boolean).slice(0, 5000);
  const add = cleanTags(body.addTags || []);
  const remove = cleanTags(body.removeTags || []);
  for (let i = 0; i < was.length; i += 400) {
    const batch = col.contacts().firestore.batch();
    for (const wa of was.slice(i, i + 400)) {
      const ref = col.contacts().doc(wa);
      if (body.delete) {
        batch.delete(ref);
        continue;
      }
      const patch = { updatedAt: now() };
      if (add.length) patch.tags = FieldValue.arrayUnion(...add);
      if (body.consent !== undefined) patch.consent = Boolean(body.consent);
      if (body.optedOut !== undefined) Object.assign(patch, { optedOut: Boolean(body.optedOut), optedOutAt: body.optedOut ? now() : null });
      batch.set(ref, patch, { merge: true });
      if (remove.length) batch.set(ref, { tags: FieldValue.arrayRemove(...remove) }, { merge: true });
    }
    await batch.commit();
  }
  return { changed: was.length };
}
export const deleteContact = (wa) => col.contacts().doc(waNumber(wa)).delete();

// ---- Audiences ----
// Who a campaign goes to: contacts with any (or all) of the tags, or
// everyone; never anyone who opted out; marketing only to people who agreed,
// unless the campaign says the message is not marketing.
export function pickAudience(contacts, audience = {}, { marketing = true } = {}) {
  const tags = cleanTags(audience.tags || []);
  const exclude = cleanTags(audience.excludeTags || []);
  const picked = [];
  const skipped = { optedOut: 0, noConsent: 0 };
  for (const c of contacts) {
    const has = (t) => (c.tags || []).includes(t);
    if (tags.length && !(audience.match === 'all' ? tags.every(has) : tags.some(has))) continue;
    if (exclude.some(has)) continue;
    if (c.optedOut) {
      skipped.optedOut += 1;
      continue;
    }
    if (marketing && !c.consent && !audience.includeNoConsent) {
      skipped.noConsent += 1;
      continue;
    }
    picked.push(c);
  }
  return { picked, skipped };
}

// ---- Campaigns ----
const CAMPAIGN_STATES = ['draft', 'scheduled', 'sending', 'paused', 'done', 'cancelled'];
export async function listCampaigns() {
  return docs(await col.campaigns().orderBy('createdAt', 'desc').limit(300).get());
}
export async function getCampaign(id) {
  const doc = await col.campaigns().doc(id).get();
  if (!doc.exists) throw new WaError('Campaign not found.', { status: 404 });
  const queued = docs(await col.queue().where('campaignId', '==', id).limit(5000).get());
  return {
    id: doc.id,
    ...doc.data(),
    recipients: queued
      .map((q) => ({ id: q.id, wa: q.wa, name: q.name || '', status: q.status, error: q.error || '', wamid: q.wamid || '', sentAt: q.sentAt || null, delivery: q.delivery || '' }))
      .sort((a, b) => String(a.name || a.wa).localeCompare(String(b.name || b.wa))),
  };
}
async function checkCampaign(body) {
  const fields = {};
  const name = String(body.name || '').trim().slice(0, 100);
  if (!name) fields.name = 'Give the campaign a name.';
  if (!body.template?.name) fields.template = 'Choose a template.';
  if (Object.keys(fields).length) throw new WaError('Please check the highlighted details.', { fields });
  const template = await getTemplate(body.template.name, body.template.language);
  if (template.status !== 'APPROVED') throw new WaError(`The template ${template.name} is ${String(template.status).toLowerCase()} at Meta; only an approved template can be sent.`, { fields: { template: 'Not approved yet.' } });
  const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;
  if (scheduleAt && Number.isNaN(scheduleAt.getTime())) throw new WaError('Choose a valid date and time.', { fields: { scheduleAt: 'Check the date.' } });
  return { name, template, scheduleAt };
}
// How a campaign would go out: how many, who's left out and why, and the
// first message as it will read.
export async function previewCampaign(body) {
  const { template } = await checkCampaign({ name: body.name || 'preview', ...body });
  const marketing = template.category === 'MARKETING';
  const { picked, skipped } = pickAudience(await listContacts(), body.audience, { marketing });
  const sample = picked.slice(0, 3).map((c) => {
    const values = valuesFor(template, body.mapping, c);
    return { wa: c.wa, name: c.name, text: renderText(template, values), missing: missingValues(template, values) };
  });
  const incomplete = picked.filter((c) => missingValues(template, valuesFor(template, body.mapping, c))).length;
  return { count: picked.length, skipped, incomplete, marketing, sample, slots: slotsOf(template) };
}
export async function createCampaign(body, by) {
  const { name, template, scheduleAt } = await checkCampaign(body);
  const ref = col.campaigns().doc();
  const campaign = {
    name,
    template: { name: template.name, language: template.language, category: template.category },
    audience: { tags: cleanTags(body.audience?.tags), excludeTags: cleanTags(body.audience?.excludeTags), match: body.audience?.match === 'all' ? 'all' : 'any', includeNoConsent: Boolean(body.audience?.includeNoConsent) },
    mapping: body.mapping || {},
    scheduleAt: scheduleAt ? scheduleAt.toISOString() : null,
    status: 'draft',
    counts: { total: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, replied: 0 },
    createdBy: by,
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(campaign);
  if (body.send === 'now') await launchCampaign(ref.id, by);
  else if (body.send === 'schedule' && scheduleAt) await ref.update({ status: 'scheduled', updatedAt: now() });
  return getCampaign(ref.id);
}
// Puts every recipient's message in the queue.
export async function launchCampaign(id, by) {
  const ref = col.campaigns().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new WaError('Campaign not found.', { status: 404 });
  const c = doc.data();
  if (!['draft', 'scheduled'].includes(c.status)) throw new WaError(`This campaign is ${c.status}.`);
  const template = await getTemplate(c.template.name, c.template.language);
  if (template.status !== 'APPROVED') throw new WaError(`The template ${template.name} is not approved at Meta.`);
  const { picked } = pickAudience(await listContacts(), c.audience, { marketing: template.category === 'MARKETING' });
  if (!picked.length) throw new WaError('Nobody to send to: no contacts match this audience (people who opted out, or without consent for marketing, are left out).');
  let skipped = 0;
  for (let i = 0; i < picked.length; i += 400) {
    const batch = col.queue().firestore.batch();
    for (const contact of picked.slice(i, i + 400)) {
      const values = valuesFor(template, c.mapping, contact);
      const missing = missingValues(template, values);
      if (missing) skipped += 1;
      batch.set(col.queue().doc(`${id}_${contact.wa}`), {
        campaignId: id,
        wa: contact.wa,
        name: contact.name || '',
        kind: 'template',
        template: { name: template.name, language: template.language },
        values,
        status: missing ? 'skipped' : 'queued',
        error: missing ? `Missing ${missing}` : '',
        attempts: 0,
        notBefore: now(),
        createdAt: now(),
      });
    }
    await batch.commit();
  }
  await ref.update({ status: 'sending', startedAt: now(), startedBy: by || 'schedule', 'counts.total': picked.length, 'counts.queued': picked.length - skipped, 'counts.skipped': skipped, updatedAt: now() });
  return { queued: picked.length - skipped, skipped };
}
export async function setCampaignState(id, action) {
  const ref = col.campaigns().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new WaError('Campaign not found.', { status: 404 });
  const s = doc.data().status;
  const to = { pause: 'paused', resume: 'sending', cancel: 'cancelled', unschedule: 'draft' }[action];
  const allowed = { pause: ['sending'], resume: ['paused'], cancel: ['draft', 'scheduled', 'sending', 'paused'], unschedule: ['scheduled'] }[action];
  if (!to || !allowed.includes(s)) throw new WaError(`A campaign that is ${s} can't be ${action === 'unschedule' ? 'unscheduled' : `${action}d`}.`);
  await ref.update({ status: to, updatedAt: now() });
  if (action === 'cancel') {
    const left = await col.queue().where('campaignId', '==', id).where('status', '==', 'queued').limit(5000).get();
    for (let i = 0; i < left.docs.length; i += 400) {
      const batch = col.queue().firestore.batch();
      left.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { status: 'cancelled' }));
      await batch.commit();
    }
    if (left.size) await ref.update({ 'counts.queued': FieldValue.increment(-left.size) });
  }
  return getCampaign(id);
}
export async function scheduleCampaign(id, when) {
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) throw new WaError('Choose a valid date and time.');
  const ref = col.campaigns().doc(id);
  const doc = await ref.get();
  if (!['draft', 'scheduled'].includes(doc.data()?.status)) throw new WaError('Only a draft can be scheduled.');
  await ref.update({ status: 'scheduled', scheduleAt: at.toISOString(), updatedAt: now() });
  return getCampaign(id);
}

// ---- Sending ----
const RETRY = new Set([130429, 131056, 131000, 2, 4, 80007]);
const FINAL_RANK = { sent: 1, delivered: 2, read: 3 };

// Sends one message now and records it. Returns { wamid } or throws.
async function sendNow(g, { wa, kind, template, values, text, campaignId = null, automationId = null, queueId = null, by = null }) {
  let message;
  let shown;
  if (kind === 'template') {
    const t = await getTemplate(template.name, template.language);
    message = templateMessage(wa, t, values);
    shown = renderText(t, values);
  } else {
    message = textMessage(wa, text);
    shown = String(text);
  }
  const answer = await g.send(message);
  const wamid = answer.messages?.[0]?.id;
  const at = now();
  await col.messages().doc(wamid).set({ wa, direction: 'out', kind, text: shown, template: template || null, campaignId, automationId, queueId, status: 'sent', at, statusAt: { sent: at }, by });
  await col.contacts().doc(wa).set({ wa, lastMessageAt: at, lastMessageText: shown.slice(0, 160), lastDirection: 'out', lastOutboundAt: at }, { merge: true });
  return { wamid, text: shown };
}

// One pass of the queue: due scheduled campaigns start, then up to perTick
// messages go out, a few at a time. Run by the tick job.
export async function tick(g, { limit } = {}) {
  const settings = await getSettings();
  const max = limit || settings.perTick;
  const started = [];
  for (const c of docs(await col.campaigns().where('status', '==', 'scheduled').limit(50).get())) {
    if (c.scheduleAt && c.scheduleAt <= now()) {
      try {
        await launchCampaign(c.id, 'schedule');
        started.push(c.id);
      } catch (e) {
        await col.campaigns().doc(c.id).update({ status: 'draft', error: e.message, updatedAt: now() });
      }
    }
  }
  const paused = new Set(docs(await col.campaigns().where('status', 'in', ['paused', 'cancelled']).limit(300).get()).map((c) => c.id));
  const due = docs(await col.queue().where('status', '==', 'queued').limit(Math.max(max * 3, 100)).get())
    .filter((q) => (!q.notBefore || q.notBefore <= now()) && !(q.campaignId && paused.has(q.campaignId)))
    .sort((a, b) => String(a.notBefore).localeCompare(String(b.notBefore)))
    .slice(0, max);
  let sent = 0;
  let failed = 0;
  const touched = new Set();
  for (let i = 0; i < due.length; i += 8) {
    await Promise.all(
      due.slice(i, i + 8).map(async (q) => {
        const ref = col.queue().doc(q.id);
        // Claim it, so two ticks never send the same message.
        const claimed = await ref.firestore.runTransaction(async (tx) => {
          const cur = await tx.get(ref);
          if (cur.data()?.status !== 'queued') return false;
          tx.update(ref, { status: 'sending', attempts: FieldValue.increment(1) });
          return true;
        });
        if (!claimed) return;
        if (q.campaignId) touched.add(q.campaignId);
        try {
          const contact = (await col.contacts().doc(q.wa).get()).data();
          if (contact?.optedOut && q.kind === 'template' && q.campaignId) throw Object.assign(new Error('They opted out.'), { final: true, skip: true });
          const { wamid } = await sendNow(g, { ...q, queueId: q.id });
          await ref.update({ status: 'sent', wamid, sentAt: now(), error: '' });
          if (q.campaignId) await col.campaigns().doc(q.campaignId).update({ 'counts.queued': FieldValue.increment(-1), 'counts.sent': FieldValue.increment(1) });
          if (q.automationId) await col.automations().doc(q.automationId).set({ runs: FieldValue.increment(1), lastRunAt: now() }, { merge: true });
          sent += 1;
        } catch (e) {
          const retry = !e.final && RETRY.has(e.code) && (q.attempts || 0) < 4;
          if (retry) {
            await ref.update({ status: 'queued', notBefore: new Date(Date.now() + 2 ** (q.attempts || 0) * 60_000).toISOString(), error: plainError(e.code, e.message) });
            return;
          }
          failed += 1;
          await ref.update({ status: e.skip ? 'skipped' : 'failed', error: e.skip ? e.message : plainError(e.code, e.message), errorCode: e.code || null });
          if (q.campaignId) await col.campaigns().doc(q.campaignId).update({ 'counts.queued': FieldValue.increment(-1), [`counts.${e.skip ? 'skipped' : 'failed'}`]: FieldValue.increment(1) });
        }
      }),
    );
  }
  // A campaign with nothing left to send is done.
  for (const id of touched) {
    const left = await col.queue().where('campaignId', '==', id).where('status', 'in', ['queued', 'sending']).limit(1).get();
    if (left.empty) await col.campaigns().doc(id).update({ status: 'done', finishedAt: now(), updatedAt: now() });
  }
  return { started, sent, failed, waiting: due.length - sent - failed };
}

// A test message to one number, sent at once.
export async function sendTest(g, body, by) {
  const wa = waNumber(body.to);
  if (!wa) throw new WaError('Enter the number to send the test to.', { fields: { to: 'Check the number.' } });
  if (body.text) return sendNow(g, { wa, kind: 'text', text: body.text, by });
  const t = await getTemplate(body.template?.name, body.template?.language);
  const values = valuesFor(t, body.mapping, { wa, name: body.name || 'Test' });
  const missing = missingValues(t, values);
  if (missing) throw new WaError(`Fill in ${missing} first.`);
  return sendNow(g, { wa, kind: 'template', template: { name: t.name, language: t.language }, values, by });
}

// ---- Inbox ----
export async function conversations() {
  return docs(await col.contacts().orderBy('lastMessageAt', 'desc').limit(500).get());
}
const windowOpen = (contact) => Boolean(contact?.lastInboundAt && Date.now() - Date.parse(contact.lastInboundAt) < DAY);
export async function conversation(waRaw) {
  const wa = waNumber(waRaw);
  const contact = (await col.contacts().doc(wa).get()).data() || { wa };
  const messages = docs(await col.messages().where('wa', '==', wa).limit(1000).get()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { contact: { id: wa, ...contact }, messages, windowOpen: windowOpen(contact), windowEndsAt: contact.lastInboundAt ? new Date(Date.parse(contact.lastInboundAt) + DAY).toISOString() : null };
}
export async function markRead(g, waRaw) {
  const wa = waNumber(waRaw);
  await col.contacts().doc(wa).set({ unread: 0 }, { merge: true });
  const last = docs(await col.messages().where('wa', '==', wa).where('direction', '==', 'in').limit(200).get()).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  if (last && !last.readByUs) {
    await col.messages().doc(last.id).set({ readByUs: true }, { merge: true });
    await g.markRead(last.id).catch(() => {});
  }
}
export async function reply(g, waRaw, body, by) {
  const wa = waNumber(waRaw);
  const contact = (await col.contacts().doc(wa).get()).data();
  if (body.text) {
    if (!windowOpen(contact)) throw new WaError('It’s more than 24 hours since they last wrote, so WhatsApp only allows a template. Choose one below.', { code: 'window-closed' });
    return sendNow(g, { wa, kind: 'text', text: String(body.text).trim().slice(0, 4096), by });
  }
  const t = await getTemplate(body.template?.name, body.template?.language);
  const values = valuesFor(t, body.mapping, { wa, ...(contact || {}) });
  const missing = missingValues(t, values);
  if (missing) throw new WaError(`Fill in ${missing} first.`);
  return sendNow(g, { wa, kind: 'template', template: { name: t.name, language: t.language }, values, by });
}

// ---- Automations ----
export const TRIGGERS = {
  keyword: 'A message with a keyword',
  new_contact: 'Someone writes for the first time',
  enquiry: 'A website enquiry is sent',
  website_order: 'A website order is placed',
  order_confirmed: 'An order is confirmed',
  order_dispatched: 'An order is dispatched',
  order_delivered: 'An order is delivered',
};
export const listAutomations = async () => docs(await col.automations().get()).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
export async function saveAutomation(id, body, by) {
  const fields = {};
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) fields.name = 'Give it a name.';
  if (!TRIGGERS[body.trigger]) fields.trigger = 'Choose when it runs.';
  const keywords = String(Array.isArray(body.keywords) ? body.keywords.join(',') : body.keywords || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (body.trigger === 'keyword' && !keywords.length) fields.keywords = 'Give at least one keyword.';
  const action = body.action || {};
  if (action.type === 'text') {
    if (!String(action.text || '').trim()) fields.text = 'Type the reply.';
    if (!['keyword', 'new_contact'].includes(body.trigger)) fields.actionType = 'A plain message can only answer someone who just wrote. For orders and enquiries, choose a template.';
  } else if (action.type === 'template') {
    if (!action.template?.name) fields.template = 'Choose a template.';
  } else fields.actionType = 'Choose what it sends.';
  if (Object.keys(fields).length) throw new WaError('Please check the highlighted details.', { fields });
  const doc = {
    name,
    trigger: body.trigger,
    keywords,
    match: body.match === 'exact' ? 'exact' : 'contains',
    action: action.type === 'text' ? { type: 'text', text: String(action.text).trim().slice(0, 4096) } : { type: 'template', template: { name: action.template.name, language: action.template.language }, mapping: action.mapping || {} },
    active: body.active !== false,
    updatedAt: now(),
    updatedBy: by,
  };
  const ref = id ? col.automations().doc(id) : col.automations().doc();
  await ref.set(id ? doc : { ...doc, runs: 0, createdAt: now(), createdBy: by }, { merge: true });
  return { id: ref.id, ...(await ref.get()).data() };
}
export const deleteAutomation = (id) => col.automations().doc(id).delete();

// Runs the automations for an event: queues their messages (the tick sends
// them within a minute). `data` is the event's details (order number, total,
// items…), usable in templates as fields.
export async function runAutomations(trigger, { wa, name, data = {}, text = '' }) {
  const rules = (await listAutomations()).filter((a) => a.active && a.trigger === trigger);
  const hits = rules.filter((a) => {
    if (trigger !== 'keyword') return true;
    const t = String(text).trim().toLowerCase();
    return a.keywords.some((k) => (a.match === 'exact' ? t === k : t.includes(k)));
  });
  const contact = { wa, name, attributes: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])) };
  for (const a of hits.slice(0, trigger === 'keyword' ? 1 : 5)) {
    const item = { automationId: a.id, campaignId: null, wa, name: name || '', attempts: 0, status: 'queued', notBefore: now(), createdAt: now(), trigger };
    if (a.action.type === 'text') Object.assign(item, { kind: 'text', text: a.action.text.replace(/\{name\}/g, (name || '').split(' ')[0] || '') });
    else {
      let t;
      try {
        t = await getTemplate(a.action.template.name, a.action.template.language);
      } catch {
        continue;
      }
      const values = valuesFor(t, a.action.mapping, contact);
      if (missingValues(t, values)) continue;
      Object.assign(item, { kind: 'template', template: { name: t.name, language: t.language }, values });
    }
    await col.queue().add(item);
  }
  return hits.length;
}

// A business event (website order, dispatch, enquiry): the customer becomes a
// contact (for order updates; consent for offers is not assumed) and the
// matching automations run. Never throws: a WhatsApp problem must not stop an
// order.
export async function businessEvent(trigger, { phone, name, data = {}, tags = [] }) {
  try {
    const wa = waNumber(phone);
    if (!wa) return 0;
    const ref = col.contacts().doc(wa);
    const cur = await ref.get();
    const add = cleanTags(tags);
    await ref.set({ wa, name: cur.data()?.name || String(name || '').slice(0, 80), ...(add.length ? { tags: FieldValue.arrayUnion(...add) } : {}), updatedAt: now(), ...(cur.exists ? {} : { source: trigger, consent: false, optedOut: false, createdAt: now(), createdBy: trigger }) }, { merge: true });
    return await runAutomations(trigger, { wa, name: cur.data()?.name || name, data });
  } catch (error) {
    console.error(`[whatsapp] ${trigger} automation failed:`, error.message);
    return 0;
  }
}

// ---- Notifications from Meta ----
export async function handleNotification(g, { incoming, statuses, templates }) {
  const settings = incoming.length ? await getSettings() : null;
  for (const m of incoming) {
    if ((await col.messages().doc(m.id).get()).exists) continue; // Meta sends again on a slow answer.
    const ref = col.contacts().doc(m.from);
    const cur = await ref.get();
    const first = !cur.exists || !cur.data().lastInboundAt;
    await col.messages().doc(m.id).set({ wa: m.from, direction: 'in', kind: m.type, text: m.text, media: m.media, replyTo: m.replyTo, at: m.at, status: 'received' });
    const patch = { wa: m.from, lastInboundAt: m.at, lastMessageAt: m.at, lastMessageText: (m.text || `[${m.type}]`).slice(0, 160), lastDirection: 'in', unread: FieldValue.increment(1), updatedAt: now() };
    if (!cur.exists) Object.assign(patch, { name: m.name, tags: ['inbound'], consent: false, optedOut: false, source: 'whatsapp', createdAt: now(), createdBy: 'whatsapp' });
    else if (!cur.data().name && m.name) patch.name = m.name;
    if (isStop(m.text)) Object.assign(patch, { optedOut: true, optedOutAt: now(), consent: false });
    if (isStart(m.text)) Object.assign(patch, { optedOut: false, optedOutAt: null, consent: true });
    await ref.set(patch, { merge: true });
    // A reply to a campaign message counts for that campaign, once.
    if (m.replyTo) {
      const orig = (await col.messages().doc(m.replyTo).get()).data();
      if (orig?.campaignId && !orig.replied) {
        await col.messages().doc(m.replyTo).set({ replied: true }, { merge: true });
        await col.campaigns().doc(orig.campaignId).update({ 'counts.replied': FieldValue.increment(1) }).catch(() => {});
      }
    }
    try {
      if (isStop(m.text)) await sendNow(g, { wa: m.from, kind: 'text', text: settings.optOutReply, by: 'auto' });
      else if (isStart(m.text)) await sendNow(g, { wa: m.from, kind: 'text', text: settings.optInReply, by: 'auto' });
      else {
        if (first) await runAutomations('new_contact', { wa: m.from, name: cur.data()?.name || m.name, text: m.text });
        if (m.text) await runAutomations('keyword', { wa: m.from, name: cur.data()?.name || m.name, text: m.text });
      }
    } catch (error) {
      console.error('[whatsapp] auto reply failed:', error.message);
    }
  }
  for (const s of statuses) {
    const ref = col.messages().doc(s.id);
    const cur = (await ref.get()).data();
    if (!cur) continue;
    const was = cur.status;
    if (s.status === 'failed') {
      if (was === 'failed') continue;
      await ref.set({ status: 'failed', error: plainError(s.error?.code, s.error?.title), errorCode: s.error?.code || null, statusAt: { ...cur.statusAt, failed: s.at } }, { merge: true });
      if (cur.campaignId) await col.campaigns().doc(cur.campaignId).update({ 'counts.failed': FieldValue.increment(1), 'counts.sent': FieldValue.increment(-1) }).catch(() => {});
      if (cur.queueId) await col.queue().doc(cur.queueId).set({ status: 'failed', error: plainError(s.error?.code, s.error?.title), delivery: 'failed' }, { merge: true });
      continue;
    }
    if (!FINAL_RANK[s.status] || (FINAL_RANK[was] || 0) >= FINAL_RANK[s.status]) continue;
    await ref.set({ status: s.status, statusAt: { ...cur.statusAt, [s.status]: s.at }, ...(s.pricing ? { pricing: s.pricing } : {}) }, { merge: true });
    if (cur.queueId) await col.queue().doc(cur.queueId).set({ delivery: s.status }, { merge: true });
    if (cur.campaignId) {
      const inc = {};
      if (s.status === 'read' && (FINAL_RANK[was] || 0) < 2) inc['counts.delivered'] = FieldValue.increment(1);
      inc[`counts.${s.status}`] = FieldValue.increment(1);
      await col.campaigns().doc(cur.campaignId).update(inc).catch(() => {});
    }
  }
  for (const t of templates) {
    const key = templateKey(t.name, t.language);
    await col.templates().doc(key).set({ status: t.status, rejectedReason: t.status === 'REJECTED' ? t.reason : '', updatedAt: now() }, { merge: true });
  }
}

// ---- Overview ----
export async function overview(days = 30) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const msgs = docs(await col.messages().where('at', '>=', since).limit(20000).get());
  const out = msgs.filter((m) => m.direction === 'out');
  const inc = msgs.filter((m) => m.direction === 'in');
  const by = (s) => out.filter((m) => m.status === s || (s === 'delivered' && m.status === 'read')).length;
  const perDay = {};
  for (const m of msgs) {
    const d = m.at.slice(0, 10);
    perDay[d] ??= { date: d, sent: 0, received: 0 };
    perDay[d][m.direction === 'out' ? 'sent' : 'received'] += 1;
  }
  const errors = {};
  for (const m of out.filter((x) => x.status === 'failed')) errors[m.error || 'Failed'] = (errors[m.error || 'Failed'] || 0) + 1;
  const contacts = await listContacts();
  return {
    days,
    sent: out.length,
    delivered: by('delivered'),
    read: by('read'),
    failed: by('failed'),
    received: inc.length,
    conversations: new Set(inc.map((m) => m.wa)).size,
    perDay: Object.values(perDay).sort((a, b) => a.date.localeCompare(b.date)),
    errors: Object.entries(errors).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    contacts: { total: contacts.length, consent: contacts.filter((c) => c.consent && !c.optedOut).length, optedOut: contacts.filter((c) => c.optedOut).length, unread: contacts.reduce((s, c) => s + (c.unread || 0), 0) },
  };
}

export { showNumber };
