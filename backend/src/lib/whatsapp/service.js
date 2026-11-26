import { readFileSync } from 'node:fs';
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
import { Storage } from '@google-cloud/storage';
import { config, salesDaddyEnabled } from '../../config.js';
import { collection } from '../firestore.js';
import { dbEnabled, query } from '../../db/pool.js';
import { buildTemplate, renderText, slotsOf } from './templates.js';
import { isStart, isStop, locationRequestMessage, menuMessage, missingValues, plainError, showNumber, templateMessage, textMessage, valuesFor, waNumber, websiteOrder } from './messages.js';
import { addLeadNote, pushTaggedLead } from '../salesdaddy.js';
import { activeAsk, finderText, mobileOf, placeFrom, storesReply, usableName } from './storefinder.js';
import { nearestFor, savedSearch } from '../stores/service.js';

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
  for (const t of await listTemplates()) if (!seen.has(t.id) && !['DELETED', 'DRAFT'].includes(t.status)) batch.set(col.templates().doc(t.id), { status: 'DELETED', updatedAt: now() }, { merge: true });
  await batch.commit();
  return listTemplates();
}
// A media header's sample for Meta: from a handle already made, or from the
// file kept in our media bucket (a draft's picture, video or PDF).
async function withMediaHandle(g, form) {
  const h = form.header || {};
  if (!['image', 'video', 'document'].includes(h.type) || h.handle) return form;
  if (g.fake) return { ...form, header: { ...h, handle: 'fake-handle' } };
  const name = String(h.mediaUrl || '').split('/api/media/')[1];
  if (!name) throw new WaError(`Add a sample ${h.type} for the header.`, { fields: { headerMedia: 'Add a sample.' } });
  const file = new Storage().bucket(config.mediaBucket).file(decodeURIComponent(name));
  const [[bytes], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  return { ...form, header: { ...h, handle: await g.uploadSample(bytes, meta.contentType) } };
}
// What a draft shows in the list and the preview, even half written.
function looseComponents(form) {
  const media = ['image', 'video', 'document'].includes(form.header?.type);
  try {
    return buildTemplate({ ...form, header: media ? { ...form.header, handle: form.header.handle || 'draft' } : form.header }).components;
  } catch {
    return [{ type: 'BODY', text: String(form.body?.text || '') }];
  }
}
const cleanDescription = (form) => String(form.description || '').trim().slice(0, 200);

export async function createTemplate(g, form, by) {
  const body = buildTemplate(await withMediaHandle(g, form));
  const key = templateKey(body.name, body.language);
  const existing = await col.templates().doc(key).get();
  if (existing.exists && !['DRAFT', 'DELETED'].includes(existing.data().status)) throw new WaError(`A template called ${body.name} in this language already exists. Choose another name.`, { fields: { name: 'Already used.' } });
  const made = await g.createTemplate(body);
  const saved = { metaId: String(made.id || ''), ...body, description: cleanDescription(form), status: made.status || 'PENDING', rejectedReason: '', form: { ...form, header: { ...form.header, handle: '' } }, createdBy: existing.data()?.createdBy || by, createdAt: existing.data()?.createdAt || now(), submittedAt: now(), submittedBy: by, updatedAt: now() };
  await col.templates().doc(key).set(saved);
  return { id: key, ...saved };
}

// A draft: kept here, not at Meta, until it is sent. Renaming it moves it.
export async function saveDraft(id, form, by) {
  const name = String(form.name || '').trim();
  const language = String(form.language || 'en');
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new WaError('Use small letters, numbers and _ only, like order_update.', { fields: { name: 'Small letters, numbers and _.' } });
  const key = templateKey(name, language);
  const there = await col.templates().doc(key).get();
  if (there.exists && key !== id && there.data().status !== 'DELETED') throw new WaError(`A template called ${name} in this language already exists. Choose another name.`, { fields: { name: 'Already used.' } });
  let started = there.exists && there.data().status === 'DRAFT' ? there.data() : null;
  if (id && id !== key) {
    const old = await col.templates().doc(id).get();
    if (old.exists && old.data().status === 'DRAFT') {
      started = old.data();
      await old.ref.delete();
    }
  }
  const doc = {
    name,
    language,
    category: String(form.category || 'MARKETING').toUpperCase(),
    description: cleanDescription(form),
    status: 'DRAFT',
    form: { ...form, header: { ...(form.header || {}), handle: '' } },
    components: looseComponents(form),
    updatedAt: now(),
    updatedBy: by,
    createdAt: started?.createdAt || now(),
    createdBy: started?.createdBy || by,
  };
  await col.templates().doc(key).set(doc);
  return { id: key, ...doc };
}
export async function deleteDraft(id) {
  const doc = await col.templates().doc(id).get();
  if (!doc.exists || doc.data().status !== 'DRAFT') throw new WaError('Only a draft can be deleted here.');
  await doc.ref.delete();
}
// Sends a draft to Meta, or a rejected template's new wording (Meta reviews
// it again under the same name). `form`, if given, is saved first.
export async function submitTemplate(g, id, form, by) {
  const doc = await col.templates().doc(id).get();
  if (!doc.exists) throw new WaError('Template not found.', { status: 404 });
  const cur = doc.data();
  if (cur.status === 'DRAFT') {
    const next = form || cur.form;
    if (templateKey(next.name, next.language) !== id) await saveDraft(id, next, by);
    return createTemplate(g, next, by);
  }
  if (cur.status === 'REJECTED' || cur.status === 'PAUSED') {
    const next = { ...(form || cur.form), name: cur.name, language: cur.language };
    const body = buildTemplate(await withMediaHandle(g, next));
    if (body.category !== cur.category && cur.status !== 'REJECTED') throw new WaError('The kind of a template can’t be changed after approval.');
    await g.editTemplate(cur.metaId, { category: body.category, components: body.components });
    const saved = { ...body, description: cleanDescription(next), status: 'PENDING', rejectedReason: '', form: { ...next, header: { ...next.header, handle: '' } }, submittedAt: now(), submittedBy: by, updatedAt: now() };
    await doc.ref.set(saved, { merge: true });
    return { id, ...cur, ...saved };
  }
  throw new WaError(`A template that is ${String(cur.status).toLowerCase()} can’t be sent again. Make a copy instead.`);
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
  // A bulk message names its people instead of tags.
  const only = Array.isArray(audience.was) && audience.was.length ? new Set(audience.was) : null;
  const picked = [];
  const skipped = { optedOut: 0, noConsent: 0 };
  for (const c of contacts) {
    const has = (t) => (c.tags || []).includes(t);
    if (only) {
      if (!only.has(c.wa)) continue;
    } else if (tags.length && !(audience.match === 'all' ? tags.every(has) : tags.some(has))) continue;
    if (!only && exclude.some(has)) continue;
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
// A bulk message's pasted list as contacts: people already here keep their
// details (and an opt-out); the list's consent applies to the rest.
function listAsContacts(audience, existing) {
  const byWa = new Map(existing.map((c) => [c.wa, c]));
  const seen = new Set();
  const rows = [];
  for (const r of audience.list || []) {
    const wa = waNumber(r.phone || r.wa);
    if (!wa || seen.has(wa)) continue;
    seen.add(wa);
    const cur = byWa.get(wa);
    rows.push({ wa, name: r.name || cur?.name || '', tags: cur?.tags || [], attributes: { ...(cur?.attributes || {}), ...(r.attributes || {}) }, consent: Boolean(cur?.consent || audience.consent), optedOut: Boolean(cur?.optedOut) });
  }
  return rows.slice(0, 5000);
}

export async function previewCampaign(body) {
  const { template } = await checkCampaign({ name: body.name || 'preview', ...body });
  const marketing = template.category === 'MARKETING';
  const all = await listContacts();
  const { picked, skipped } = Array.isArray(body.audience?.list)
    ? pickAudience(listAsContacts(body.audience, all), { was: listAsContacts(body.audience, all).map((c) => c.wa) }, { marketing })
    : pickAudience(all, body.audience, { marketing });
  const sample = picked.slice(0, 3).map((c) => {
    const values = valuesFor(template, body.mapping, c);
    return { wa: c.wa, name: c.name, text: renderText(template, values), missing: missingValues(template, values) };
  });
  const incomplete = picked.filter((c) => missingValues(template, valuesFor(template, body.mapping, c))).length;
  return { count: picked.length, skipped, incomplete, marketing, sample, slots: slotsOf(template) };
}
export async function createCampaign(body, by) {
  const { name, template, scheduleAt } = await checkCampaign(body);
  // A bulk message: the pasted people become contacts first.
  let was = null;
  if (Array.isArray(body.audience?.list)) {
    const rows = listAsContacts(body.audience, await listContacts());
    if (!rows.length) throw new WaError('Add at least one valid WhatsApp number.', { fields: { list: 'No valid numbers.' } });
    await importContacts(rows.map((r) => ({ wa: r.wa, name: r.name, tags: ['bulk'], attributes: r.attributes })), { source: 'bulk', consent: Boolean(body.audience.consent), by });
    was = rows.map((r) => r.wa);
  }
  const ref = col.campaigns().doc();
  const campaign = {
    name,
    kind: was ? 'bulk' : 'broadcast',
    template: { name: template.name, language: template.language, category: template.category },
    audience: was
      ? { was, includeNoConsent: Boolean(body.audience?.includeNoConsent) }
      : { tags: cleanTags(body.audience?.tags), excludeTags: cleanTags(body.audience?.excludeTags), match: body.audience?.match === 'all' ? 'all' : 'any', includeNoConsent: Boolean(body.audience?.includeNoConsent) },
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
async function sendNow(g, { wa, kind, template, values, text, menu, campaignId = null, automationId = null, queueId = null, by = null }) {
  let message;
  let shown;
  if (kind === 'menu') {
    message = menuMessage(wa, menu);
    shown = `${menu.text}\n${menu.options.map((o, i) => `${i + 1}. ${o.title}`).join('\n')}`;
  } else if (kind === 'location_request') {
    message = locationRequestMessage(wa, text);
    shown = `${text}\n[Send location button]`;
  } else if (kind === 'template') {
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
export async function conversations(campaignId = null) {
  if (!campaignId) return docs(await col.contacts().orderBy('lastMessageAt', 'desc').limit(500).get());
  // The chats with the people one broadcast or bulk message went to, each
  // with how that message did for them (sent, delivered, read, failed) and
  // whether they replied to it.
  const recipients = docs(await col.queue().where('campaignId', '==', campaignId).limit(5000).get());
  const replied = new Set(docs(await col.messages().where('campaignId', '==', campaignId).limit(5000).get()).filter((m) => m.replied).map((m) => m.wa));
  const out = [];
  for (let i = 0; i < recipients.length; i += 300) {
    const slice = recipients.slice(i, i + 300);
    const snaps = await col.contacts().firestore.getAll(...slice.map((r) => col.contacts().doc(r.wa)));
    slice.forEach((r, j) => {
      const c = snaps[j].exists ? snaps[j].data() : { wa: r.wa, name: r.name };
      out.push({
        id: r.wa,
        ...c,
        name: c.name || r.name || '',
        campaign: { status: r.status, delivery: r.delivery || '', replied: replied.has(r.wa), error: r.error || '' },
      });
    });
  }
  return out.sort((a, b) => Number(b.campaign.replied) - Number(a.campaign.replied) || String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
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
  if (contact?.needsHuman) await col.contacts().doc(wa).set({ needsHuman: false }, { merge: true });
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
    // The website's "Order on WhatsApp": a lead in Sales Daddy tagged
    // Whatsapp order, and the contact tagged here too (owner, 2026-11-26).
    const order = websiteOrder(m.text);
    if (order) {
      await ref.set({ tags: FieldValue.arrayUnion('whatsapp-order'), lastOrderAt: m.at }, { merge: true });
      await orderToSalesDaddy(m.id, { wa: m.from, name: cur.data()?.name || m.name, text: m.text, order });
    }
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
        const name = cur.data()?.name || m.name;
        const contact = cur.data() || {};
        // A website order: ask where to deliver (not the bot's menu). The
        // answer that follows (a location, pincode or area) goes on the lead
        // and the customer is told the sales team will call (owner, 2026-11-26).
        let handled = false;
        if (order) handled = await askOrderWhere(g, { wa: m.from, messageId: m.id, order, contact });
        else if (activeOrderAsk(contact) && !m.replyId && !(await isBotTrigger(m.text))) handled = await orderWhereStep(g, { wa: m.from, text: m.text, location: m.location, contact });
        if (!handled) handled = await runBot(g, { wa: m.from, name, text: m.text, replyId: m.replyId, location: m.location, first, contact });
        if (!handled) {
          if (first) await runAutomations('new_contact', { wa: m.from, name, text: m.text });
          if (m.text) await runAutomations('keyword', { wa: m.from, name, text: m.text });
        }
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

// ---- The bot ----
// A menu that answers by itself: someone says hi (or writes for the first
// time) and gets buttons or a list; a tap (or the option's number) gets the
// answer: a message, today's prices, their order's status, or a person.
export const BOT_ACTIONS = { reply: 'Send a message', catalogue: 'Our catalogue (products, packs and prices)', prices: 'Today’s prices (from the plant)', order_status: 'Their latest order’s status', handoff: 'Hand over to a person', stores: 'Find the nearest store' };

// The website's products, pack sizes and prices (npm run knowledge writes
// catalogue.json from the frontend's data), sent as the bot's catalogue.
let CATALOGUE = { products: [], phone: '', website: 'https://www.cholanrice.in' };
try {
  CATALOGUE = JSON.parse(readFileSync(new URL('./catalogue.json', import.meta.url), 'utf8'));
} catch {
  // No catalogue file: the catalogue message is just the website link.
}
// The products and their pack sizes only: no prices and nothing else
// (owner, 2026-11-25). In Tamil: the Tamil name with the English one after it.
const kgTa = (size) => String(size).replace(/\bkg\b/i, 'கிலோ');
export function catalogueText(lang = 'en') {
  const ta = lang === 'ta';
  const lines = CATALOGUE.products.map((p, i) => {
    const sizes = p.packs.length ? p.packs.map((k) => (ta ? kgTa(k.size) : k.size)).join(' · ') : ta ? 'அளவுகளுக்கு எங்களைக் கேளுங்கள்' : 'sizes on request';
    const name = ta && p.tamil ? `*${p.tamil}* (${p.name})` : `*${p.name}*`;
    return `${i + 1}. ${name}\n    ${sizes}`;
  });
  const text = [ta ? '🌾 *சோழன் அரிசி: எங்கள் பொருட்கள்*' : '🌾 *Cholan Rice: our products*', lines.join('\n')].join('\n\n');
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}
const DEFAULT_CONTACT = `📞 Call us: ${CATALOGUE.phone || '+91 90922 66667'}\n💬 Or reply here on WhatsApp\n🌐 www.cholanrice.in`;
const TALK_TA = '📞 எங்களை அழைக்க: +91 90922 66667\n(காலை 10 மணி முதல் மாலை 6 மணி வரை)';
export const DEFAULT_BOT = {
  enabled: false,
  onFirstMessage: true,
  // On hi: only the menu (the products list when chosen).
  showCatalogue: false,
  contact: DEFAULT_CONTACT,
  triggerWords: ['hi', 'hello', 'hai', 'vanakkam', 'menu', 'help', 'வணக்கம்', 'மெனு'],
  // First the choice of Tamil or English (owner, 2026-11-25); everything
  // after is in that language. The Tamil texts sit beside the English ones.
  askLanguage: true,
  languageText: 'Please choose your language.\nஉங்கள் மொழியைத் தேர்ந்தெடுக்கவும்.',
  welcome: 'Vanakkam {name}! Welcome to Cholan Rice. What would you like to do?',
  welcomeTa: 'வணக்கம் {name}! சோழன் அரிசிக்கு உங்களை வரவேற்கிறோம். உங்களுக்கு என்ன வேண்டும்?',
  button: 'Choose',
  buttonTa: 'தேர்வு செய்க',
  // The menu the owner settled on (2026-11-25), in English and Tamil.
  options: [
    { id: 'catalogue', title: 'Products', description: 'Rice and pack sizes', action: 'catalogue', reply: '', titleTa: 'பொருட்கள்', descriptionTa: 'அரிசி வகைகள், பை அளவுகள்', replyTa: '' },
    { id: 'stores', title: 'Find nearest store', description: 'Cholan shops near you', action: 'stores', reply: '', titleTa: 'அருகிலுள்ள கடை', descriptionTa: 'உங்கள் அருகிலுள்ள சோழன் கடைகள்', replyTa: '' },
    { id: 'human', title: 'Talk to us', description: 'Call us', action: 'reply', reply: '📞 Call us: +91 90922 66667\n(10 am to 6 pm)', titleTa: 'எங்களுடன் பேச', descriptionTa: 'எங்களை அழைக்கவும்', replyTa: TALK_TA },
  ],
  fallback: 'Sorry, I didn’t get that. Reply MENU to see the options.',
  fallbackTa: 'மன்னிக்கவும், புரியவில்லை. விருப்பங்களைப் பார்க்க MENU என்று அனுப்பவும்.',
  pauseHours: 12,
};
// The two language buttons' codes (never an option's code).
const LANG_IDS = { lang_ta: 'ta', lang_en: 'en' };
const LANG_WORDS = { tamil: 'ta', 'தமிழ்': 'ta', english: 'en', 'ஆங்கிலம்': 'en' };
const inLang = (lang, en, ta) => (lang === 'ta' && String(ta || '').trim() ? ta : en);
// The menu as sent, in the contact's language.
function menuFor(bot, lang, name) {
  const first = String(name || '').split(' ')[0] || (lang === 'ta' ? 'நண்பரே' : 'there');
  return {
    text: inLang(lang, bot.welcome, bot.welcomeTa).replace(/\{name\}/g, first),
    button: inLang(lang, bot.button, bot.buttonTa),
    section: lang === 'ta' ? 'விருப்பங்கள்' : 'Options',
    options: bot.options.map((o) => ({ ...o, title: inLang(lang, o.title, o.titleTa), description: inLang(lang, o.description, o.descriptionTa) })),
  };
}
export async function getBot() {
  const doc = await col.settings().doc('bot').get();
  return { ...DEFAULT_BOT, ...(doc.exists ? doc.data() : {}) };
}
export async function saveBot(body, by) {
  const options = (Array.isArray(body.options) ? body.options : [])
    .slice(0, 10)
    .map((o, i) => ({
      id: String(o.id || `opt${i + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || `opt${i + 1}`,
      title: String(o.title || '').trim().slice(0, 24),
      description: String(o.description || '').trim().slice(0, 72),
      action: BOT_ACTIONS[o.action] ? o.action : 'reply',
      reply: String(o.reply || '').trim().slice(0, 1000),
      titleTa: String(o.titleTa || '').trim().slice(0, 24),
      descriptionTa: String(o.descriptionTa || '').trim().slice(0, 72),
      replyTa: String(o.replyTa || '').trim().slice(0, 1000),
    }))
    .filter((o) => o.title);
  const fields = {};
  if (!options.length) fields.options = 'Add at least one option.';
  if (options.length <= 3 && options.some((o) => o.title.length > 20 || o.titleTa.length > 20)) fields.options = 'With 3 options or fewer they show as buttons: keep each title to 20 characters.';
  if (new Set(options.map((o) => o.id)).size !== options.length || options.some((o) => LANG_IDS[o.id])) fields.options = 'Each option needs a different code.';
  if (options.some((o) => o.action === 'reply' && !o.reply)) fields.options = 'Type the message for each “Send a message” option.';
  if (!String(body.welcome || '').trim()) fields.welcome = 'Type the welcome message.';
  if (Object.keys(fields).length) throw new WaError('Please check the highlighted details.', { fields });
  const next = {
    enabled: Boolean(body.enabled),
    onFirstMessage: body.onFirstMessage !== false,
    showCatalogue: body.showCatalogue !== false,
    contact: String(body.contact ?? DEFAULT_CONTACT).trim().slice(0, 600),
    triggerWords: String(Array.isArray(body.triggerWords) ? body.triggerWords.join(',') : body.triggerWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 20),
    askLanguage: body.askLanguage !== false,
    languageText: String(body.languageText || DEFAULT_BOT.languageText).trim().slice(0, 1000),
    welcome: String(body.welcome).trim().slice(0, 1000),
    welcomeTa: String(body.welcomeTa || '').trim().slice(0, 1000),
    button: String(body.button || 'Choose').trim().slice(0, 20),
    buttonTa: String(body.buttonTa || '').trim().slice(0, 20),
    options,
    fallback: String(body.fallback || '').trim().slice(0, 1000),
    fallbackTa: String(body.fallbackTa || '').trim().slice(0, 1000),
    pauseHours: Math.min(Math.max(Number(body.pauseHours) || 12, 1), 72),
    updatedAt: now(),
    updatedBy: by,
  };
  await col.settings().doc('bot').set(next);
  return getBot();
}

const ORDER_WORDS = { awaiting_payment: 'waiting for payment', new: 'received, we will confirm it shortly', confirmed: 'confirmed', packing: 'being packed', packed: 'packed and ready to go', dispatched: 'on its way', delivered: 'delivered', cancelled: 'cancelled', returned: 'returned' };
async function botAnswer(option, { wa, name, lang = 'en' }) {
  const first = String(name || '').split(' ')[0] || (lang === 'ta' ? 'நண்பரே' : 'there');
  const own = inLang(lang, option.reply, option.replyTa);
  if (option.action === 'catalogue') return catalogueText(lang);
  if (option.action === 'prices') {
    if (!dbEnabled()) return own || (lang === 'ta' ? 'இன்றைய விலைக்கு எங்களை அழைக்கவும்.' : 'Please call us for today’s prices.');
    const { rows } = await query(
      `SELECT p.name AS product, i.pack_label, li.price_paise
       FROM catalog.items i JOIN catalog.products p ON p.id = i.product_id
       JOIN price.list_items li ON li.item_id = i.id AND li.min_qty = 1 AND core.today_ist() BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)
       JOIN price.price_lists pl ON pl.id = li.price_list_id AND pl.is_default AND pl.active
       WHERE i.kind = 'finished' AND i.active AND p.active ORDER BY p.name, i.net_weight_g LIMIT 40`,
    );
    if (!rows.length) return own || (lang === 'ta' ? 'இன்றைய விலைக்கு எங்களை அழைக்கவும்.' : 'Please call us for today’s prices.');
    return `Today’s prices at Cholan Rice:\n${rows.map((r) => `• ${r.product} ${r.pack_label}: ₹${(r.price_paise / 100).toLocaleString('en-IN')}`).join('\n')}\n\nReply with what you need, and we will confirm the price and delivery.`;
  }
  if (option.action === 'order_status') {
    if (!dbEnabled()) return own || (lang === 'ta' ? 'எங்களை அழைக்கவும், உங்கள் ஆர்டரைப் பார்த்துச் சொல்கிறோம்.' : 'Please call us and we will check your order.');
    const { rows } = await query(
      `SELECT o.number, o.status, o.order_date::text AS d FROM sales.orders o JOIN party.parties p ON p.id = o.party_id
       WHERE p.phone = $1 ORDER BY o.id DESC LIMIT 3`,
      [`+${wa}`],
    );
    if (!rows.length) return `Hi ${first}, we couldn’t find an order for this number. If you ordered with another number, please send us the order number.`;
    return `Hi ${first}, here ${rows.length === 1 ? 'is your order' : 'are your latest orders'}:\n${rows.map((r) => `• ${r.number} (${r.d}): ${ORDER_WORDS[r.status] || r.status}`).join('\n')}`;
  }
  return String(own || '').replace(/\{name\}/g, first);
}

// ---- The bot's store finder (same search and records as the website's) ----

// Chosen from the menu: a number that already searched (here or on the
// website) gets its first answer again; otherwise the bot asks for the name
// (only when the WhatsApp name won't do) and then the place.
async function startStoreSearch(g, { wa, name, lang = 'en' }) {
  const say = finderText(lang);
  const mobile = mobileOf(wa);
  if (!mobile) {
    await sendNow(g, { wa, kind: 'text', text: say.notIndian, by: 'bot' });
    return true;
  }
  const saved = await savedSearch(mobile);
  if (saved) {
    await sendNow(g, { wa, kind: 'text', text: storesReply(saved, { repeat: true, firstAt: saved.person?.firstAt, lang }), by: 'bot' });
    return true;
  }
  const n = usableName(name);
  if (!n) {
    await col.contacts().doc(wa).set({ storeAsk: { stage: 'name', at: now() } }, { merge: true });
    await sendNow(g, { wa, kind: 'text', text: say.askName, by: 'bot' });
    return true;
  }
  await col.contacts().doc(wa).set({ storeAsk: { stage: 'where', name: n, at: now() } }, { merge: true });
  await sendNow(g, { wa, kind: 'location_request', text: say.askWhere, by: 'bot' });
  return true;
}

// Their answer to the bot's question: the name, then the place; then the search.
async function storeStep(g, { wa, name, text, location, ask, lang = 'en' }) {
  const say = finderText(lang);
  const ref = col.contacts().doc(wa);
  const mobile = mobileOf(wa);
  if (!mobile) return startStoreSearch(g, { wa, name, lang });
  if (ask.stage === 'name') {
    const n = usableName(text);
    if (!n) {
      await ref.set({ storeAsk: { stage: 'name', at: now() } }, { merge: true });
      await sendNow(g, { wa, kind: 'text', text: say.nameAgain, by: 'bot' });
      return true;
    }
    await ref.set({ storeAsk: { stage: 'where', name: n, at: now() } }, { merge: true });
    await sendNow(g, { wa, kind: 'location_request', text: say.thanks(n.split(' ')[0]), by: 'bot' });
    return true;
  }
  const where = placeFrom({ text, location });
  if (!where) {
    await ref.set({ storeAsk: { ...ask, at: now() } }, { merge: true });
    await sendNow(g, { wa, kind: 'location_request', text: say.askWhere, by: 'bot' });
    return true;
  }
  const who = ask.name || usableName(name);
  if (!who) {
    // A location shared out of the blue by someone whose WhatsApp name won't do.
    const saved = await savedSearch(mobile);
    if (saved) {
      await sendNow(g, { wa, kind: 'text', text: storesReply(saved, { repeat: true, firstAt: saved.person?.firstAt, lang }), by: 'bot' });
      return true;
    }
    await ref.set({ storeAsk: { stage: 'name', at: now() } }, { merge: true });
    await sendNow(g, { wa, kind: 'text', text: say.askName, by: 'bot' });
    return true;
  }
  try {
    const found = await nearestFor({ name: who, phone: mobile, from: 'whatsapp', where: { ...where, limit: 20 } });
    await ref.set({ storeAsk: FieldValue.delete() }, { merge: true });
    await sendNow(g, { wa, kind: 'text', text: storesReply(found, { repeat: found.repeat, firstAt: found.person?.firstAt, lang }), by: 'bot' });
  } catch (error) {
    // A place Google can't find: ask again. Anything else: say so and stop.
    const again = error.status === 400 && !error.fields;
    await ref.set({ storeAsk: again ? { ...ask, at: now() } : FieldValue.delete() }, { merge: true });
    // The search's own messages are in English; in Tamil, a plain Tamil one.
    const msg = again ? say.placeAgain(error.message) : error.status && error.status < 500 && lang !== 'ta' ? error.message : say.broken;
    await sendNow(g, { wa, kind: again ? 'location_request' : 'text', text: msg, by: 'bot' });
    if (!error.status || error.status >= 500) console.error('[whatsapp] store finder failed:', error.message);
  }
  return true;
}

// Returns true when the bot answered (so the keyword automations stay quiet).
export async function runBot(g, { wa, name, text, replyId, location, first, contact }) {
  const bot = await getBot();
  if (!bot.enabled || !bot.options.length) return false;
  if (contact.botPausedUntil && contact.botPausedUntil > now()) return false;
  const ref = col.contacts().doc(wa);
  const t = String(text || '').trim().toLowerCase();
  let lang = contact.lang === 'ta' ? 'ta' : 'en';
  // The menu in the chosen language (the products list first, if switched on).
  const showMenu = async () => {
    if (bot.showCatalogue) await sendNow(g, { wa, kind: 'text', text: catalogueText(lang), by: 'bot' });
    await sendNow(g, { wa, kind: 'menu', menu: menuFor(bot, lang, name), by: 'bot' });
    await ref.set({ botMenuAt: now() }, { merge: true });
    await col.settings().doc('bot').set({ 'runs.menu': FieldValue.increment(1) }, { merge: true });
    return true;
  };
  // Tamil or English chosen (a tap, or typed just after the question).
  const askedLang = contact.botLangAt && Date.now() - Date.parse(contact.botLangAt) < 30 * 60_000;
  const chosen = LANG_IDS[replyId] || (askedLang ? LANG_WORDS[t] : null);
  if (chosen) {
    lang = chosen;
    await ref.set({ lang, langAt: now(), botLangAt: FieldValue.delete() }, { merge: true });
    await col.settings().doc('bot').set({ [`runs.lang_${lang}`]: FieldValue.increment(1) }, { merge: true });
    return showMenu();
  }
  const byTap = replyId && bot.options.find((o) => o.id === replyId);
  const byNumber = /^\d{1,2}$/.test(t) && contact.botMenuAt && Date.now() - Date.parse(contact.botMenuAt) < 30 * 60_000 ? bot.options[Number(t) - 1] : null;
  const byTitle = bot.options.find((o) => o.title.toLowerCase() === t || (o.titleTa && o.titleTa.toLowerCase() === t));
  const option = byTap || byNumber || byTitle;
  const storesOn = bot.options.some((o) => o.action === 'stores');
  const isTrigger = bot.triggerWords.includes(t);
  // Waiting for the store finder's name or place: the answer goes there,
  // unless they chose something from the menu or asked for the menu again.
  const ask = storesOn ? activeAsk(contact) : null;
  if (ask && !option && !isTrigger) return storeStep(g, { wa, name, text, location, ask, lang });
  if (ask) await ref.set({ storeAsk: FieldValue.delete() }, { merge: true });
  // A location shared out of the blue: look for the nearest shops too.
  if (!option && storesOn && location) return storeStep(g, { wa, name, text, location, ask: { stage: 'where', name: usableName(name) }, lang });
  if (option?.action === 'stores') {
    await col.settings().doc('bot').set({ [`runs.${option.id}`]: FieldValue.increment(1) }, { merge: true });
    return startStoreSearch(g, { wa, name, lang });
  }
  if (option) {
    await sendNow(g, { wa, kind: 'text', text: await botAnswer(option, { wa, name, lang }), by: 'bot' });
    if (option.action === 'handoff') await ref.set({ needsHuman: true, botPausedUntil: new Date(Date.now() + bot.pauseHours * 3600_000).toISOString() }, { merge: true });
    await col.settings().doc('bot').set({ [`runs.${option.id}`]: FieldValue.increment(1) }, { merge: true });
    return true;
  }
  if (isTrigger || (first && bot.onFirstMessage)) {
    // First the language (owner, 2026-11-25), then the menu in it.
    if (bot.askLanguage !== false) {
      const choose = { text: bot.languageText || DEFAULT_BOT.languageText, options: [{ id: 'lang_ta', title: 'தமிழ்' }, { id: 'lang_en', title: 'English' }] };
      await sendNow(g, { wa, kind: 'menu', menu: choose, by: 'bot' });
      await ref.set({ botLangAt: now() }, { merge: true });
      return true;
    }
    return showMenu();
  }
  // Just shown the menu (or the language question) and the answer isn't one of the options.
  const recent = (at) => at && Date.now() - Date.parse(at) < 15 * 60_000;
  const fallback = inLang(lang, bot.fallback, bot.fallbackTa);
  if (fallback && (recent(contact.botMenuAt) || recent(contact.botLangAt))) {
    await sendNow(g, { wa, kind: 'text', text: fallback, by: 'bot' });
    return true;
  }
  return false;
}

// ---- Reports ----
// Everything in a period: per day, per template, per campaign, per
// automation, failures, new contacts and opt-outs, and when people write.
export async function reports(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00+05:30`).toISOString();
  const to = new Date(`${toDate}T23:59:59.999+05:30`).toISOString();
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) throw new WaError('Choose a valid period.');
  const msgs = docs(await col.messages().where('at', '>=', from).limit(50000).get()).filter((m) => m.at <= to);
  const out = msgs.filter((m) => m.direction === 'out');
  const inc = msgs.filter((m) => m.direction === 'in');
  const tally = (list) => ({
    sent: list.length,
    delivered: list.filter((m) => ['delivered', 'read'].includes(m.status)).length,
    read: list.filter((m) => m.status === 'read').length,
    failed: list.filter((m) => m.status === 'failed').length,
    replied: list.filter((m) => m.replied).length,
  });
  const group = (list, key) => {
    const m = new Map();
    for (const x of list) {
      const k = key(x);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const day = (iso) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);
  const days = [...group(msgs, (m) => day(m.at))].map(([date, list]) => ({ date, ...tally(list.filter((m) => m.direction === 'out')), received: list.filter((m) => m.direction === 'in').length })).sort((a, b) => a.date.localeCompare(b.date));
  const templates = [...group(out.filter((m) => m.template?.name), (m) => m.template.name)].map(([name, list]) => ({ name, ...tally(list) })).sort((a, b) => b.sent - a.sent);
  const campaignIds = [...new Set(out.map((m) => m.campaignId).filter(Boolean))];
  const campaigns = (await Promise.all(campaignIds.map((id) => col.campaigns().doc(id).get())))
    .filter((d) => d.exists)
    .map((d) => ({ id: d.id, name: d.data().name, kind: d.data().kind || 'broadcast', template: d.data().template?.name, startedAt: d.data().startedAt, ...d.data().counts }));
  const autos = Object.fromEntries((await listAutomations()).map((a) => [a.id, a.name]));
  const automations = [...group(out.filter((m) => m.automationId), (m) => m.automationId)].map(([id, list]) => ({ name: autos[id] || 'Deleted automation', ...tally(list) }));
  const bot = tally(out.filter((m) => m.by === 'bot'));
  const errors = [...group(out.filter((m) => m.status === 'failed'), (m) => m.error || 'Failed')].map(([name, list]) => ({ name, value: list.length })).sort((a, b) => b.value - a.value);
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, received: 0 }));
  for (const m of inc) hours[new Date(Date.parse(m.at) + 5.5 * 3600_000).getUTCHours()].received += 1;
  const contacts = await listContacts();
  return {
    from: fromDate,
    to: toDate,
    totals: { ...tally(out), received: inc.length, people: new Set(inc.map((m) => m.wa)).size, newContacts: contacts.filter((c) => c.createdAt >= from && c.createdAt <= to).length, optedOut: contacts.filter((c) => c.optedOutAt && c.optedOutAt >= from && c.optedOutAt <= to).length },
    days,
    templates,
    campaigns,
    automations,
    bot,
    errors,
    hours,
  };
}

// ---- Website "Order on WhatsApp" -> Sales Daddy lead ----

function orderNote({ order, text, where }) {
  return [
    'Order on WhatsApp from the website',
    `Product: ${order.product}${order.size ? ` — ${order.size}` : ''}${order.price ? ` (${order.price})` : ''}`,
    order.page && `Product page: ${order.page}`,
    `Message: ${String(text).slice(0, 600)}`,
    where && whereLine(where),
  ]
    .filter(Boolean)
    .join('\n');
}

// Sends one order message's lead; the outcome stays on the message (crm), so
// a failed one is tried again by the sync worker. Never throws.
async function orderToSalesDaddy(messageId, { wa, name, text, order, where }) {
  const ref = col.messages().doc(messageId);
  if (!salesDaddyEnabled || !config.salesDaddy.waOrderTag) return;
  const phone = mobileOf(wa);
  if (!phone) {
    await ref.set({ crm: { state: 'skipped', reason: 'not an Indian mobile', at: now() } }, { merge: true });
    return;
  }
  const lead = { name: usableName(name) || 'WhatsApp customer', phone, source: 'whatsapp', note: orderNote({ order, text, where }) };
  try {
    let untagged = false;
    let result;
    try {
      result = await pushTaggedLead({ ...lead, tag: config.salesDaddy.waOrderTag });
    } catch (error) {
      // Refused (4xx), e.g. the tag isn't set up in Sales Daddy yet: the lead
      // still goes in, without the tag, rather than being lost.
      if (!/Sales Daddy 4\d\d/.test(error.message)) throw error;
      console.error('[whatsapp] order lead refused with the tag, sending without it:', error.message);
      result = await pushTaggedLead({ ...lead, tag: '' });
      untagged = true;
    }
    await ref.set({ crm: { state: 'sent', leadId: result.leadId, duplicate: result.duplicate, ...(untagged ? { untagged: true } : {}), at: now() } }, { merge: true });
  } catch (error) {
    const prev = (await ref.get()).data()?.crm || {};
    await ref.set({ crm: { state: 'failed', error: String(error.message).slice(0, 300), tries: (prev.tries || 0) + 1, at: now() } }, { merge: true });
    console.error('[whatsapp] order lead to Sales Daddy failed:', error.message);
  }
}

// Order leads that didn't reach Sales Daddy (a few at a time, up to 5 tries,
// for two days), called by the sync worker.
export async function retryOrderLeads() {
  if (!salesDaddyEnabled) return 0;
  const since = new Date(Date.now() - 2 * DAY).toISOString();
  const failed = docs(await col.messages().where('crm.state', '==', 'failed').limit(50).get()).filter((m) => m.at >= since && (m.crm.tries || 0) < 5).slice(0, 10);
  for (const m of failed) {
    const order = websiteOrder(m.text);
    if (!order) continue;
    const contact = (await col.contacts().doc(m.wa).get()).data() || {};
    await orderToSalesDaddy(m.id, { wa: m.wa, name: contact.name, text: m.text, order, where: m.orderWhere });
  }
  return failed.length;
}

// ---- Order: where to deliver, then "the sales team will call" ----

const ORDER_ASK_MINUTES = 60;
const ORDER_TEXT = {
  en: {
    ask: (o) => `Thank you for your order${o ? `: ${o}` : ''}. 🙏\nPlease share your delivery location: tap the button below, or type your pincode.`,
    again: 'Please type your 6-digit pincode or your area, or share your location with the button below.',
    done: 'Thank you! We have noted your location. 📍\nOur sales team will call you shortly on this number to confirm your order and delivery. 📞',
  },
  ta: {
    ask: (o) => `உங்கள் ஆர்டருக்கு நன்றி${o ? `: ${o}` : ''}. 🙏\nடெலிவரி இடத்தைப் பகிரவும்: கீழே உள்ள பட்டனைத் தட்டவும், அல்லது உங்கள் பின்கோடை அனுப்பவும்.`,
    again: 'உங்கள் 6 இலக்க பின்கோடு அல்லது பகுதியின் பெயரை அனுப்பவும், அல்லது கீழே உள்ள பட்டனில் இருப்பிடத்தைப் பகிரவும்.',
    done: 'நன்றி! உங்கள் இருப்பிடத்தைக் குறித்துக் கொண்டோம். 📍\nஆர்டர் மற்றும் டெலிவரியை உறுதிப்படுத்த எங்கள் விற்பனைக் குழு இந்த எண்ணில் விரைவில் உங்களை அழைக்கும். 📞',
  },
};
const orderText = (contact) => ORDER_TEXT[contact?.lang === 'ta' ? 'ta' : 'en'];
const orderLabel = (o) => `${o.product}${o.size ? ` — ${o.size}` : ''}${o.price ? ` (${o.price})` : ''}`;

function activeOrderAsk(contact, nowMs = Date.now()) {
  const ask = contact?.orderAsk;
  return ask?.at && nowMs - Date.parse(ask.at) < ORDER_ASK_MINUTES * 60_000 ? ask : null;
}
// "hi", "menu" and the like still open the bot's menu while we wait.
async function isBotTrigger(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  return (await getBot()).triggerWords.includes(t);
}

// What the customer sent for "where": a shared location, a pincode, or an area.
export function orderWhere({ text, location }) {
  if (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    return { kind: 'location', lat, lng, label: [location.name, location.address].filter(Boolean).join(', ') };
  }
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  // 641402, or 641 402 as people often type it.
  const pin = t.match(/\b(6\d{2})\s?(\d{3})\b/);
  if (pin) return { kind: 'pincode', pincode: pin[1] + pin[2], text: t.slice(0, 200) };
  if (t.length >= 3 && t.length <= 200 && /\p{L}/u.test(t)) return { kind: 'area', text: t };
  return null;
}
function whereLine(w) {
  if (w.kind === 'location') return `Delivery location (shared on WhatsApp): https://maps.google.com/?q=${w.lat},${w.lng}${w.label ? ` (${w.label})` : ''}`;
  if (w.kind === 'pincode') return `Delivery pincode: ${w.pincode}${w.text && w.text !== w.pincode ? ` (they wrote: ${w.text})` : ''}`;
  return `Delivery area (as typed): ${w.text}`;
}

async function askOrderWhere(g, { wa, messageId, order, contact }) {
  await col.contacts().doc(wa).set({ orderAsk: { at: now(), messageId } }, { merge: true });
  await sendNow(g, { wa, kind: 'location_request', text: orderText(contact).ask(orderLabel(order)), by: 'bot' });
  return true;
}

async function orderWhereStep(g, { wa, text, location, contact }) {
  const ask = activeOrderAsk(contact);
  const say = orderText(contact);
  const where = orderWhere({ text, location });
  const ref = col.contacts().doc(wa);
  if (!where) {
    await ref.set({ orderAsk: { ...ask, at: now() } }, { merge: true });
    await sendNow(g, { wa, kind: 'location_request', text: say.again, by: 'bot' });
    return true;
  }
  const msgRef = col.messages().doc(ask.messageId);
  await msgRef.set({ orderWhere: { ...where, at: now() } }, { merge: true });
  await ref.set({ orderAsk: FieldValue.delete(), lastOrderWhere: { ...where, at: now() } }, { merge: true });
  // On the lead already in Sales Daddy; a lead still waiting gets it with its note.
  const crm = (await msgRef.get()).data()?.crm;
  if (crm?.state === 'sent' && crm.leadId) {
    try {
      await addLeadNote(crm.leadId, whereLine(where));
    } catch (error) {
      console.error('[whatsapp] order location to Sales Daddy failed:', error.message);
    }
  }
  await sendNow(g, { wa, kind: 'text', text: say.done, by: 'bot' });
  return true;
}
