# EDITH Guardian Network — FastAPI Backend

AI processing (DeepFace / ArcFace / RetinaFace-family detection) lives
entirely here. Neither the React dashboard nor the Flutter app ever
imports a face-recognition library — they only ever call this API.

## How the three pieces connect

This backend, the React dashboard, and the Android app are three separate
deployments that only work together if each one points at the right URL.
There is exactly one thing that has to be true: **every client's "server
URL" setting must be the backend's real, publicly reachable address —
the same address, everywhere.**

| Piece | Where the backend URL lives | What to set it to |
|---|---|---|
| **Backend itself** | `EDITH_ALLOWED_ORIGINS` in `.env` | The dashboard's real deployed URL (e.g. `https://edith-dashboard.vercel.app`) — CORS blocks the dashboard otherwise |
| **React dashboard** | `VITE_EDITH_API_URL` in `.env`, or the Vercel project's environment variables | Your backend's real deployed URL (e.g. `https://your-space.hf.space`) |
| **Android app** | Typed into the app's "BACKEND SERVER URL" field (Settings), saved locally | The same backend URL as above |

**The order that avoids chasing your tail:**
1. Deploy the backend first. Get its real URL. Confirm `/api/health` responds.
2. Deploy the dashboard, pointing `VITE_EDITH_API_URL` at that backend URL.
3. Go back to the backend and set `EDITH_ALLOWED_ORIGINS` to the
   dashboard's now-known real URL. Restart/redeploy the backend.
4. Point the Android app at the same backend URL from step 1.
5. Prove it end-to-end: enroll a case on the dashboard → activate it →
   point the Android app's camera at that person → watch the pin appear
   on the dashboard's map live.

If step 5 doesn't work, check in this order: (a) does `/api/health` on
the backend URL respond from a browser at all — if not, nothing else
matters until it does; (b) does the dashboard's browser console show a
CORS error — if so, `EDITH_ALLOWED_ORIGINS` doesn't match the dashboard's
actual URL exactly (including `https://` and no trailing slash); (c) does
the Android app's "TEST CONNECTION" button succeed — if not, it's usually
either a typo'd URL or `usesCleartextTraffic` blocking a plain `http://`
backend (see the Android app's manifest note).



```
app/
  main.py           FastAPI app: CORS, router wiring, startup (create
                     tables, seed admin, warm the face model)
  config.py         ALL configuration — reads from environment variables
  routes/           Thin HTTP adapters — parse request, call a service, serialize response
    health.py       GET  /api/health
    auth.py         POST /api/auth/login, admin user management
    enrollment.py   POST /api/register, /api/enroll/activate,
                     PUT  /api/enroll/{id}/expire, POST /api/delete-user
    recognition.py  POST /api/recognize (1:N spotter hot path), /api/verify (1:1)
    cases.py        GET  /api/cases, /api/cases/active, /api/cases/{id},
                     GET  /api/cases/{id}/photo (enrollment photo, human-review use only),
                     PUT  /api/cases/{id}/geofence (set/widen/clear search radius),
                     GET  /api/devices/active (real device heartbeat, not alert-derived)
    alerts.py       GET  /api/alerts/live, PUT /api/alerts/{id}/review,
                     GET  /api/alerts/{id}/frame (matched frame, human-review use only),
                     GET  /api/alerts/stream (Server-Sent Events)
  services/         Business logic, framework-independent
    face_service.py     the ONLY module that imports DeepFace
    case_service.py      enrollment/activation/expiry/deletion/geofencing + cached active-case lookup
    alert_service.py     recording + live SSE broadcast
    auth_service.py      login / user creation
    audit_service.py     audit log writes
    device_service.py    spotter device heartbeat tracking
  models/schemas.py  Pydantic request/response contracts
  database/
    session.py        SQLAlchemy engine/session (DATABASE_URL-driven)
    models.py          ORM tables: users, cases, alerts, audit_log
  utilities/
    security.py         password hashing, JWT issue/verify, role-gate dependency
    rate_limit.py        per-device cooldown for the recognize hot path
    auth_rate_limit.py   login lockout after repeated failures
    encryption.py        Fernet encryption at rest — embeddings AND enrollment/matched photos
    geo.py                geofence distance filtering (Haversine)
```

## Image review and geofencing (new)

Two case-management features worth knowing about:

- **Human review images**: an enrollment photo is now retained (encrypted)
  alongside the embedding, and the exact frame a spotter device captured
  on a match is also retained. Neither is ever used in matching — only
  for a human to visually compare before acting on an alert. Retrieve via
  `GET /api/cases/{id}/photo` and `GET /api/alerts/{id}/frame` (both
  require auth). See `SECURITY.md` for the reasoning and the
  automatic-deletion guarantee.
- **Case geofencing**: `PUT /api/cases/{id}/geofence` restricts which
  spotter reports a case is matched against, based on the reporting
  device's GPS location. Pass `{lat, lon, radius_meters}` to set a
  search radius, or `{}` (all null) to clear it and search everywhere
  again — the intended workflow is narrow-then-widen: activate a search
  tightly around a last-known location, then call this again with a
  larger radius if it doesn't turn up a match.## Run locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

A working `.env` is already included with real values — nothing to edit
to get running locally. `.env` is loaded automatically (via
python-dotenv) and never overrides real environment variables set by a
hosting platform, so the same code works unmodified in production too.

Interactive API docs: http://localhost:8000/docs — every route, request
shape, and response shape is generated automatically from the code, which
is worth showing judges directly.

First run seeds an admin account: username `admin`, password `EDITH`
(from `.env`'s `EDITH_SEED_ADMIN_USER` / `EDITH_SEED_ADMIN_PASSWORD`).
**Change this before any real/public deployment** — it's fine for local
dev and demos, not for anything judges or the public can reach directly.

## Deploy for real

### Option A — Hugging Face Spaces (Docker), simplest free path
1. Create a new Space → SDK: **Docker**.
2. Push this folder's contents (it already has a `Dockerfile` built for
   Spaces' port 7860 convention).
3. In the Space's **Settings → Repository secrets**, set `EDITH_JWT_SECRET`,
   `EDITH_SEED_ADMIN_PASSWORD`, and `EDITH_ALLOWED_ORIGINS` (your deployed
   frontend URLs, comma-separated).
4. Your API is live at `https://<your-space>.hf.space`.

Caveat: HF Spaces' free CPU tier is modest — fine for a competition demo
with a handful of enrolled cases, but if matching feels sluggish under
load, that's the tier, not the code. Move to Option B for real headroom.

### Option B — Your own always-on VM (Oracle Cloud Free Tier)
Same idea as before, just with `uvicorn` instead of `gunicorn`:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 3
```
behind Caddy for free HTTPS, run under systemd so it survives reboots.
(Full step-by-step is the same VM setup as previously — ask if you want
it written out again for this FastAPI version specifically.)

### Database: move off SQLite when you're ready
Nothing else changes — set `DATABASE_URL` to a hosted Postgres URL
(Supabase, Neon, Railway Postgres all have free tiers) and uncomment
`psycopg2-binary` in `requirements.txt`. Tables are created automatically
on startup.

## Re-enrollment note

## Detector choice

Detector backend defaults to `opencv` (bundled with opencv-python, zero
network dependency) rather than `retinaface` or `yunet` — both of those
fetch a weight file from a third party on first use, and in testing
YuNet's download path (Git-LFS-backed) returned a silently-corrupt stub
file that detected zero faces with no visible error. If you switch
detectors via `EDITH_FACE_DETECTOR`, verify the enroll → activate →
recognize flow actually returns a match on a real photo before trusting
it — a broken detector download fails silent, not loud.
