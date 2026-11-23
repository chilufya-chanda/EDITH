# EDITH Police Dashboard (React)

Talks only to the FastAPI backend over REST + Server-Sent Events — never
touches DeepFace/ArcFace/RetinaFace directly.

## Structure

```
src/
  pages/        LoginPage.jsx, DashboardPage.jsx — top-level screens
  components/   TopBar, CaseList, MapView, AlertFeed, EnrollModal — reusable UI
  hooks/        useAuth, useCases, useLiveAlerts — all data-fetching logic
  services/     api.js — the only file that knows API routes/shapes
  assets/       fonts/images (loaded via index.html + CSS currently; add
                 static assets here as the project grows)
```

`App.jsx` is now just auth gating between the two pages — all real logic
lives in hooks + services, so it's straightforward to add e.g. a
`RegisterPage` or `AuditLogPage` later without touching `App.jsx`.

## Run locally

```bash
npm install
cp .env.example .env        # point VITE_EDITH_API_URL at your FastAPI backend
npm run dev
```

## Deploy — Vercel

1. Push to GitHub, import into Vercel.
2. Framework: Vite. Build command: `npm run build`. Output: `dist`.
3. Environment variable: `VITE_EDITH_API_URL` = your deployed backend URL
   (e.g. `https://your-space-name.hf.space`).
4. Deploy — free, static, instant.

No code changes are needed between local dev and production; only the
environment variable differs.
