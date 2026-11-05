// Firestore (GCP) side of the push. Credentials come from the ambient
// environment: Application Default Credentials locally
// (`gcloud auth application-default login`) and the attached service account
// on Cloud Run, so no key file is ever checked in.
import { Firestore } from '@google-cloud/firestore';
import { config, firestoreEnabled } from '../config.js';

let client = null;

export function firestore() {
  if (!firestoreEnabled) return null;
  if (!client) client = new Firestore({ projectId: config.firestore.projectId, ignoreUndefinedProperties: true });
  return client;
}

// A collection by its plain name ("visits", "posts"…), with the environment's
// prefix in front, so local testing writes to dev_visits and so on.
export function collection(name) {
  const db = firestore();
  if (!db) throw Object.assign(new Error('The database is not configured (set GCLOUD_PROJECT).'), { status: 503 });
  return db.collection(`${config.firestore.prefix}${name}`);
}

// Maps a SQLite row to the Firestore document. The row id becomes the document
// id, which makes the push idempotent: a retry after an ambiguous failure
// overwrites the same document instead of creating a duplicate enquiry.
function toDocument(row) {
  let meta = {};
  try {
    meta = row.meta ? JSON.parse(row.meta) : {};
  } catch {
    // An unreadable meta column loses the page details, not the enquiry.
  }
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    enquiryType: row.enquiry_type,
    message: row.message,
    product: row.product,
    source: row.source,
    // Where on the site it came from: the page before the form, the page the
    // visit started on, how the visitor arrived, and the visit itself.
    page: meta.page ?? null,
    landing: meta.landing ?? null,
    referrer: meta.referrer ?? null,
    utmSource: meta.utmSource ?? null,
    utmMedium: meta.utmMedium ?? null,
    utmCampaign: meta.utmCampaign ?? null,
    sessionId: meta.sessionId ?? null,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

// merge: a retry, or a later sync, never resets the status or notes set on
// the enquiry in the dashboard.
export async function pushEnquiry(row) {
  const db = firestore();
  if (!db) throw new Error('Firestore is not configured (set GCLOUD_PROJECT).');
  await db.collection(config.firestore.collection).doc(row.id).set(toDocument(row), { merge: true });
}

export { firestoreEnabled };
