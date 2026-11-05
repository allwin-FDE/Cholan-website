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

## Website assistant (`POST /api/chat`)

The "Chat with us" assistant on the site. It answers only questions about
rice, millets, pulses and the shop, and only from the website's own content.
Built with LangChain on Groq (`src/chat/chain.js`):

```
question ──▶ topic check (small model)
               ├─ off topic ──▶ fixed polite reply, in English or Tamil
               └─ on topic  ──▶ keyword search (BM25) over src/chat/knowledge.json
                               ──▶ matching sections + question ──▶ answer model ──▶ streamed reply
```

- **Knowledge.** `npm run knowledge` rebuilds `src/chat/knowledge.json` from
  the frontend's own content: products, categories, business details, About
  data, policies, reviews and the visible text of the main pages. Re-run it
  after changing site content, and commit the result (the backend deploys
  without the frontend beside it).
- **Search.** `src/chat/retrieve.js`: BM25 over the sections, with a synonym
  table (idly/idli, cost/price, kollu/horse gram…) and Tamil word endings
  handled. The contact and ordering sections are always included.
- **Topic check.** `openai/gpt-oss-20b` answers ON or OFF for each question.
  It is given the shop's product names and common Tamil grain names. If the
  check itself fails, the question goes through: the answer prompt is limited
  to the same topics.
- **Answering.** `openai/gpt-oss-120b` at low reasoning effort, streamed as
  server-sent events. The prompt keeps answers to the supplied content and
  points visitors to the shop for anything it doesn't cover. When Groq's
  per-minute token limit is reached, the request waits as long as Groq asks
  (up to 20 s) and retries, at most twice.
- **Turning it on.** Set `GROQ_API_KEY` (in `.env.local` locally, as a Cloud
  Run variable when deployed). Without it the route answers 503 and the chat
  button stays hidden on a production build without `VITE_API_URL`.
- **Limits.** 15 questions per visitor per minute (`CHAT_RATE_*`), 12 turns
  of history and 1000 characters per message. Groq's free plan allows about
  5–6 questions a minute across all visitors; a paid plan raises that.

## Dashboard (`/dashboard` on the website)

The shop's own dashboard: visitors, heatmaps, enquiries, the blog and who has
access. The pages are in `frontend/src/dashboard/`; the backend side is here.

- **Sign-in** is Firebase Authentication with an emailed link (no passwords),
  in the `cholan-rice-site` project. Every `/api/admin/*` request carries the
  person's ID token; `src/lib/auth.js` checks it and looks the email up in the
  `dashboardAccess` collection. `OWNER_EMAILS` always have full access.
  Roles: viewer (reports) < editor (+ enquiries, blog) < admin (+ Settings).
- **Visitor tracking** (`POST /api/track`, `src/routes/track.js`) receives
  batches from `frontend/src/lib/tracker.js`, only for visitors who accepted
  cookies: page views, clicks with their position (heatmaps), scroll depth,
  time on page and actions. Stored in `visits` (one per visit) and `activity`
  (the events), both deleted by Firestore TTL on `expireAt`. Bots and headless
  browsers are ignored. `src/lib/insights.js` turns them into the reports.
- **Enquiries** in the dashboard read the `enquiries` Firestore collection;
  each now also records the page it was sent from, the landing page, referrer,
  campaign and the visit id (`meta` in SQLite).
- **Blog**: posts in the `posts` collection (`src/lib/posts.js`), public at
  `GET /api/posts` and `GET /api/posts/:slug`; images in the private
  `MEDIA_BUCKET`, served by `GET /api/media/*`.

Locally, set `GCLOUD_PROJECT=cholan-rice-site`, `FIRESTORE_PREFIX=dev_` and
`FIRESTORE_COLLECTION=dev_enquiries` in `.env.local` to test against separate
collections.
