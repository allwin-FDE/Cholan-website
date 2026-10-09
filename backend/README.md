# Backend

An API for the contact form. It receives an enquiry, stores it in a local
SQLite database, and pushes it on to Firestore on GCP.

The frontend lives in `../frontend`.

## How an enquiry travels

```
contact form  ──POST──▶  API  ──▶  SQLite (local, immediate)
                                      │
                                      └──▶  Firestore (GCP, background)
```

The two writes are deliberately split. The API answers the visitor as soon as
the enquiry is safely in SQLite, so a submit never waits on a network call to
GCP — and never fails because of one. Pushing to Firestore happens afterwards,
on a timer, and any enquiry that does not make it stays queued for the next
attempt.

That makes the SQLite file an outbox as well as a record. Each row carries a
`sync_state` of `pending`, `synced` or `failed`, plus an attempt counter; a row
that keeps failing retires to `failed` after `SYNC_MAX_ATTEMPTS` instead of
retrying forever. Nothing is ever deleted, so the local file keeps the full
history even after a row reaches GCP.

Pushes are idempotent: the row's id is used as the Firestore document id, so a
retry after an ambiguous failure overwrites the same document rather than
creating a second copy of the enquiry.

## Running it

Needs Node 22.5 or newer — the local database uses `node:sqlite`, the runtime's
own SQLite, so there is no native module to compile.

```
cd backend
npm install
npm run dev        # http://localhost:8080, restarts on change
```

That is enough to work on the form. With no GCP settings the backend stores
enquiries in SQLite alone and says so at startup; the push is simply skipped.

Settings come from the environment. Copy `.env.example` to `.env.local` to
change any of them — `npm run dev` and `npm run sync` read that file if it
exists.

## Routes

| Route                 | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `POST /api/enquiries` | Store an enquiry. Public, rate limited by IP.  |
| `GET /api/enquiries`  | Read recent enquiries. Admin only.             |
| `GET /health`         | Liveness, plus the current sync counts.        |

A submit answers `201` with the new enquiry's id. A rejected one answers `400`
with a `fields` object keyed by form field, which the form shows next to each
input.

Stored enquiries hold phone numbers and email addresses, so the read route is
closed by default: it needs `ADMIN_TOKEN` as a bearer token, and without that
variable set it only answers requests from localhost. Never deploy without
setting it.

```
curl localhost:8080/api/enquiries                               # localhost only
curl -H 'Authorization: Bearer $ADMIN_TOKEN' .../api/enquiries  # anywhere
```

## Pushing to GCP

Set `GCLOUD_PROJECT` to the Firebase/GCP project and the sync worker starts on
the next boot. Credentials come from the ambient environment — Application
Default Credentials locally, the attached service account on Cloud Run — so no
key file is ever checked in:

```
gcloud auth application-default login
gcloud services enable firestore.googleapis.com
gcloud firestore databases create --location=asia-south1   # once per project
```

The collection defaults to `enquiries` and is set by `FIRESTORE_COLLECTION`.
The service account needs the `roles/datastore.user` role.

`npm run sync` drains the queue by hand, which is the way to push enquiries
that were taken while GCP was unconfigured or unreachable:

```
npm run sync
# Pushed 4, failed 0.
# Local state: { pending: 0, synced: 4, failed: 0 }
```

Firestore security rules should deny all client access to this collection:
writes arrive through this backend with a service account, never from a
browser.

## Deploying

The included `Dockerfile` targets Cloud Run:

```
gcloud run deploy cholan-backend \
  --source . \
  --region asia-south1 \
  --set-env-vars GCLOUD_PROJECT=<project>,ALLOWED_ORIGINS=https://<site> \
  --set-env-vars ADMIN_TOKEN=<token>
```

Two things are worth knowing about a deployed instance. Cloud Run's filesystem
is in-memory and per-instance, so there the SQLite file is scratch space — a
write-ahead buffer in front of Firestore, not the lasting copy. Firestore is
the record of truth once deployed, and anything still `pending` when an instance
is replaced is lost, so keep `SYNC_INTERVAL_MS` short. For a durable local
database, run the backend somewhere with a real disk and point `DB_FILE` at it.

`ALLOWED_ORIGINS` must list the deployed site's origin or the browser will block
the form's request. Point the frontend at the service with `VITE_API_URL` — see
`../frontend/README.md`.
