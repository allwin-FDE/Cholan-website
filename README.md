# Cholan Rice & Millets

```
frontend/   the website: Vite + React (see frontend/README.md)
backend/    the enquiry API: Express + SQLite + Firestore (see backend/README.md)
```

The contact form posts an enquiry to the backend, which stores it in a local
SQLite database and then pushes it on to Firestore on GCP.

## Running both

Two terminals, one per folder:

```
cd frontend && npm install && npm run dev    # http://localhost:5173
cd backend  && npm install && npm run dev    # http://localhost:8080
```

They find each other with no configuration in development. The backend works
without any GCP setup too — enquiries simply stay in the local database until
`GCLOUD_PROJECT` is set.

Backend needs Node 22.5 or newer.

## Deploying

The two halves deploy separately:

- **frontend** — Firebase Hosting. Config (`firebase.json`, `.firebaserc`)
  lives in `frontend/`, so deploys run from there. Build with `VITE_API_URL`
  pointing at the deployed backend.
- **backend** — Cloud Run, via the `Dockerfile` in `backend/`. Set
  `ALLOWED_ORIGINS` to the hosted site's origin, and `ADMIN_TOKEN` to close the
  route that reads stored enquiries.

Each README has the full commands.
