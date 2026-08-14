# `functions/` (codebase `default`, exported as `api`, `renderSite`, `unsubscribe`, `scheduledDiscoverNashvilleHvacLeads`)

See the root `AGENTS.md` first — this file only adds detail specific to this codebase.

## Layout

Almost everything lives in `src/index.ts` (~2,400 lines) — there is no route-per-file split. Route groups, all mounted on one Express app (`apiApp`), in roughly this order:

- **Health**: `GET /health` — no auth.
- **Admin leads dashboard** (`requireAdmin`): `GET /admin/leads`, `GET /admin/leads/:leadId`, `POST /admin/jobs/discover-nashville-hvac`, `POST /admin/leads/:leadId/reject`, `/call-task`, `/regenerate-preview`, `/rerun-audit`, `/approve-outreach`, `POST /admin/outreach/:messageId/send`.
- **Stripe**: `POST /stripe/webhook` (raw body + Stripe signature verification, not bearer auth), `POST /digital-products/:slug/create-checkout-session`, `POST /chore-tracker/create-checkout-session`, `POST /sites/:siteId/create-checkout-session` (admin-only, currently disabled/501).
- **Digital products / FD-POS asset-quality workflow** (`requireAdmin` or `requireAdminOrServiceSecret`): `/digital-products/register-draft`, `/:slug/promise-review`, `/:slug/supervisor-policy`, `/:slug/supervisor/evaluate-proposals`, `/:slug/state`, `/:slug/approvals/:approvalId`, `/:slug/asset-builder/work`, `/:slug/assets/register`, `/:slug/asset-builder/complete`.
- **Chore tracker public buyer flow** (no bearer auth — gated by a hashed, expiring `downloadTokens` document instead): `/chore-tracker/create-checkout-session`, `/purchase-status`, `/recover-access`, `/download`.
- **`renderSite`** (separate export): reads `sites/{slug}`, renders an inline HTML template, sets `X-Robots-Tag: noindex` under `/preview/**`.
- **`unsubscribe`** (separate export): decodes a base64url token, writes `suppressions` + marks the `outreach` doc unsubscribed.
- **`scheduledDiscoverNashvilleHvacLeads`** (separate export, `onSchedule`, daily 08:00 America/Chicago): Google Places Text Search/Details + website-audit heuristics + email scraping.

`functions/private-products/`: private static files served by the chore-tracker/digital-product download routes — not source code, don't treat as such in reviews.

## Auth

- `requireAdmin(req)`: Bearer Firebase ID token, then `decoded.admin === true` OR `decoded.email` in `ADMIN_EMAILS` env / Firestore `config/admin.allowlistedEmails`.
- `requireAdminOrServiceSecret(req)`: checks `x-fd-pos-secret`/`x-webhook-secret` header via `crypto.timingSafeEqual` against `FD_POS_SERVICE_SECRET` first (for the FD-POS PowerShell automation scripts in root `scripts/`), falling back to `requireAdmin`.

## Secrets

Declared via `defineSecret` and passed into the `api` export's `secrets: [...]`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CHORE_TRACKER`, `FD_POS_SERVICE_SECRET`, `RESEND_API_KEY`. Local emulator values live in `.secret.local` (gitignored) — never populate it with production values.

## When adding a route

- Pick `requireAdmin` or `requireAdminOrServiceSecret` explicitly; don't add an unauthenticated route unless it needs to be public for a concrete reason (webhook signature, token-gated download, intentionally public content) — document why in a short comment if it's not obvious.
- Apply `express.json()` on the specific route, not globally — the Stripe webhook route needs the raw body for signature verification and would break if JSON parsing ran first.
- If the route touches Firestore, check `firestore.rules` at the repo root for the matching collection and keep the server-side check and the rule in agreement.
