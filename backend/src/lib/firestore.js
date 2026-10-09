// Firestore (GCP) side of the push. Credentials come from the ambient
// environment: Application Default Credentials locally
// (`gcloud auth application-default login`) and the attached service account
// on Cloud Run, so no key file is ever checked in.
import { Firestore } from '@google-cloud/firestore';
import { config, firestoreEnabled } from '../config.js';

let client = null;

function firestore() {
  if (!firestoreEnabled) return null;
  if (!client) client = new Firestore({ projectId: config.firestore.projectId });
  return client;
}

// Maps a SQLite row to the Firestore document. The row id becomes the document
// id, which makes the push idempotent: a retry after an ambiguous failure
// overwrites the same document instead of creating a duplicate enquiry.
function toDocument(row) {
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    enquiryType: row.enquiry_type,
    message: row.message,
    product: row.product,
    source: row.source,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

export async function pushEnquiry(row) {
  const db = firestore();
  if (!db) throw new Error('Firestore is not configured (set GCLOUD_PROJECT).');
  await db.collection(config.firestore.collection).doc(row.id).set(toDocument(row));
}

export { firestoreEnabled };
