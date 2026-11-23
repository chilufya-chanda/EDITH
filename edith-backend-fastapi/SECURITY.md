# EDITH Guardian Network — Security Overview

This documents what's actually implemented, tested, and why — plus what's
genuinely still open. Written to be read by a judge or auditor, not just
to check a box.

## Authentication & access control

- **Passwords**: bcrypt (work-factor hashing), not fast hashing. Any
  account created before this change is transparently migrated to bcrypt
  on its next successful login — nothing breaks, nothing is silently
  stuck on the weaker scheme.
- **Brute-force protection**: 5 failed attempts (per username+IP, 5-minute
  window) triggers a 5-minute lockout, returned as HTTP 429. Verified: a
  correct password during lockout is still rejected — the endpoint
  doesn't leak whether the password would otherwise have been right.
- **JWT tokens**: signed, expiring (8 hours by default), role-encoded.
  Role checks (`admin`/`officer`/`guardian`) are enforced server-side on
  every route that needs them, not just hidden in the UI.
- **Two-party consent for activation**: a guardian can enroll a case but
  never activate a search alone — enforced by `require_role("admin",
  "officer")` on the activation route itself.

## Data protection

- **Encryption at rest**: face embeddings (the actual biometric data) are
  encrypted with Fernet (AES-128-CBC + HMAC) before being written to the
  database. Verified directly against the raw SQLite file — the stored
  value is ciphertext, not a plaintext JSON array. The decryption key
  lives only in environment configuration, never in the database itself.
- **Deliberately limited image retention**: as of this version, two specific
  images ARE retained, encrypted, and only for one purpose — human review
  before acting on a match. The enrollment photo a guardian/officer
  originally presents is kept (previously discarded immediately); the
  exact frame a spotter device captured on a match is also kept. Neither
  is ever used in matching itself — only the embedding is. Both are
  permanently deleted the instant their case is deleted
  (`/api/delete-user`), and the enrollment consent text presented in the
  dashboard was updated to disclose this retention explicitly. Every
  other camera frame a spotter device captures (the vast majority — every
  frame that doesn't produce a match) is still never written anywhere.
- **Right to erasure**: `/api/delete-user` performs a real hard delete of
  the case row and its embedding, not a soft status flag.
- **Audit trail**: every enroll, activate, expire, delete, and alert is
  logged with actor identity and timestamp.

## Transport & headers

- CORS origins are explicitly configured per deployment (`EDITH_ALLOWED_ORIGINS`),
  not left wide open in anything but local dev.
- Every response carries `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, and `Strict-Transport-Security` headers.
- The live alert stream authenticates via the standard `Authorization`
  header (fetch + ReadableStream on the frontend), not a token in the URL
  — URLs end up in server access logs and browser history; headers don't.

## Fail-safe defaults

`EDITH_ENVIRONMENT=production` makes the app **refuse to start** if the
JWT secret, encryption key, or seed admin password are still the
zero-setup defaults baked into this repo for local development. Local/demo
use (`development`, the default) is never blocked by this — it only
matters once you've deliberately told the app it's a real deployment.

## What this deliberately doesn't claim to solve

**Cross-border data transfer.** The suggested free deployment path
(Hugging Face Spaces, Vercel) runs on US-based infrastructure, while this
system is designed to process what's arguably sensitive biometric data
about Zambian nationals under the Data Protection Act No. 4 of 2018. That
Act, like most data protection regimes, restricts transferring personal
data outside the country without specific safeguards. **This is not
resolved by anything in this codebase** — it's a hosting/legal decision,
not a code fix. If data residency matters for your deployment, look at a
regional host (Oracle Cloud's Always-Free tier has a Johannesburg,
South Africa region — same continent, not the same as in-country, but a
meaningfully different posture than US hosting) and get this reviewed by
someone qualified on the actual Act, not just an AI's best-effort reading
of it.

**Formal governance artifacts.** No DPIA (Data Protection Impact
Assessment), no designated DPO, no written breach-response runbook exist
for this project. The technical controls above support a well-run
process; they aren't a substitute for having one.

**Single-instance rate limiting.** Both rate limiters in this codebase
(login lockout, spotter report cooldown) are in-memory and per-process —
correct and effective for a single-server deployment, but would need to
move to shared storage (Redis) if you ever scale to multiple backend
instances behind a load balancer.

## Before any real deployment, rotate these

Every one of these has a working default so local development needs zero
setup — that convenience is exactly why they must change before anything
beyond your own machine can reach this server:

```bash
EDITH_JWT_SECRET=<generate a new long random string>
EDITH_ENCRYPTION_KEY=<python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
EDITH_SEED_ADMIN_PASSWORD=<a real password, not 'EDITH'>
EDITH_ENVIRONMENT=production
```
