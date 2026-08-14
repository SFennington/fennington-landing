# Fennington Landing Engineering Guide

## Repository Boundaries

- This repository is the Firebase project `fennington-financial`. It is independent from `fennington-assistant` (a separate Firebase project and separate git repository, `SFennington/fennington-assistant`) — do not import code, secrets, or configuration between the two repositories without an explicit task. The assistant repository's engineering-task-management system tracks GitHub Issues/PRs against *this* repository (`SFennington/fennington-landing`) but does not live in it.
- Preserve unknown and uncommitted work. Do not commit, push, deploy, or change Firebase configuration unless explicitly authorized.
- Firestore `(default)` (region `nam5`) is canonical for leads, outreach, financial data, digital products, and site content. There is no other datastore.
- This repository has **no automated tests and no CI** today (see "Known Gaps" below). Treat that as a real constraint, not an oversight to silently work around — flag it when it affects a task, and prefer adding a test alongside any change to `functions/` or `functions-financial/` rather than leaving it untested indefinitely.

## Structure

- `functions/`: Cloud Functions codebase `default`, exported as `api` (leads admin, Stripe, HVAC lead discovery, chore-tracker checkout/download, digital-products asset-quality workflow), plus the separate exports `renderSite` (site preview/live rendering), `unsubscribe`, and the scheduled function `scheduledDiscoverNashvilleHvacLeads`. Almost everything lives in the single file `functions/src/index.ts` (~2,400 lines) — see `functions/AGENTS.md`.
- `functions-financial/`: Cloud Functions codebase `financial`, exported as `financialApi`. Deliberately kept separate from `functions/` so the household financial app's function doesn't need Stripe secrets to deploy. See `functions-financial/AGENTS.md`.
- `admin/leads/`: static, unbuilt vanilla-JS admin dashboard for HVAC lead generation (Firebase Auth Google sign-in + `requireAdmin`-gated calls to `/api/admin/**`).
- `financial/`: static, unbuilt vanilla-JS household financial app (`index.html`, `app.html`, `script.js` ~5,300 lines). Reads/writes Firestore directly from the client under `firestore.rules`; calls `functions-financial` only for the AI transaction-categorization endpoint.
- `chore-tracker/`, `livestock-tracker/`, `firelife/`: static marketing/product pages, mostly unrelated to each other and to the app above; `chore-tracker/` drives Stripe checkout + token-gated download through `functions/`.
- `templates/`: static HTML/CSS/JS scaffolding (`base/`, `hvac/`, `landscaping/`) used as the source for `renderSiteHtml()` in `functions/src/index.ts` — not a deployed app itself.
- `scripts/`: one-off and FD-POS (digital-product review pipeline) automation scripts, mostly PowerShell calling the admin-only/service-secret-gated `functions/` routes. `generate-chore-tracker-assets.js` and `migrate-financial-workspace.js` are dev-machine one-off scripts, not part of any deploy.
- Root `firebase.json`, `firestore.rules`, `firestore.indexes.json`: hosting rewrites, security rules, and composite indexes shared by both function codebases.

## Development Commands

- `npm run emulators` (root): Firebase Emulator Suite for hosting, functions, Firestore, and auth.
- `npm run functions:build` (root) or `npm run build` (inside `functions/` or `functions-financial/`): TypeScript build (`tsc`) — required before the emulator or a deploy picks up changes, since Hosting rewrites point at the compiled `lib/` output via each codebase's `predeploy` build step.
- `npm --prefix functions run serve`: build + start emulators scoped to `functions`, Firestore, auth, and hosting.
- There is no `npm test` in this repository yet (see "Known Gaps").

## Firebase Emulator Workflow

- `firebase.json` already wires `emulators.singleProjectMode: true` with `auth` (9099), `functions` (5001), `firestore` (8081), `hosting` (5000), and the Emulator UI (4000).
- Both function codebases declare secrets via `defineSecret` (Firebase Functions v2) and read local values from `functions/.secret.local` when running under the emulator — never commit real values there. `functions-financial/` has no equivalent `.secret.local` file checked in; add one locally (gitignored) with `OPENAI_API_KEY` if you need to exercise AI categorization against the emulator.
- Prefer testing admin-gated routes against the emulator with a custom-claim or `ADMIN_EMAILS`-listed test account rather than production credentials.

## Protected Code Areas

Treat these as high risk. Changes here need extra scrutiny and, ideally, a test added alongside the change even though the surrounding codebase doesn't have one yet:

- `functions-financial/` in its entirety, and the financial-app-only email allowlist. It is currently duplicated in **four** places and must stay consistent if ever changed: `firestore.rules` (`isAllowedFinancialUser()`), `functions-financial/src/index.ts` (`FINANCIAL_ALLOWED_EMAILS`), `financial/script.js` (`isAllowedFinancialUser`), and `financial/config.js` (`sharedWorkspace.memberEmails`). Do not weaken, bypass, or partially update this allowlist.
- `firestore.rules` and `firestore.indexes.json` — the rules are default-deny; every collection must be explicitly allowlisted. Financial collections require **both** `isAllowedFinancialUser()` and household/owner-scoping — never grant financial read/write on `isAdmin()` alone or vice versa.
- Stripe code (`functions/src/index.ts` webhook + checkout-session routes) and `stripeEvents`.
- Anything using `defineSecret`/Firebase Secret Manager, or the `secretValue()`/local-`.env` fallback helpers in either function codebase.
- `requireAdmin` / `requireAdminOrServiceSecret` (`functions/src/index.ts`) and `requireFinancialUser` (`functions-financial/src/index.ts`) — the only authorization gates in this repository. Both independently re-implement the same bearer-token-verify pattern; if you ever centralize them, keep the admin-claim-or-allowlist and financial-allowlist semantics exactly as they are today, and update all call sites in the same change.
- Deployment configuration (`firebase.json` rewrites/codebases, `firestore.rules`/`firestore.indexes.json`, anything under `functions*/package.json`'s `deploy`/`predeploy` scripts).

## Security Requirements

- Every new server-side route must explicitly choose one of the two authorization patterns already in place — `requireAdmin` (Firebase custom claim `admin:true` OR email in `ADMIN_EMAILS`/`config/admin.allowlistedEmails`) or `requireFinancialUser`/`requireUser` (bearer token + the financial email allowlist) — never invent a third pattern or leave a route unauthenticated without a specific reason (the few public routes — Stripe webhook, chore-tracker checkout/download, `renderSite`, `unsubscribe` — are public by design and protected by other means: Stripe signature verification, possession of a hashed expiring download token, or being intentionally public content).
- Never expose Stripe secret keys, the FD-POS service secret, the Resend API key, or the OpenAI API key to client code or logs. They must only ever be read via `defineSecret`/`secretValue()`.
- Do not add new financial data flows that skip Firestore rules or send financial records to any external service (including an AI provider) without an explicit, reviewed reason.
- Preserve the existing hosting rewrite order in `firebase.json` — `/api/financial/**` must stay listed before the general `/api/**` rewrite so it takes precedence.

## Coding Conventions

- Both function codebases are plain Firebase Functions v2 (`onRequest`/`onSchedule`) wrapping a single Express app per codebase — there is no framework beyond Express + `cors`. New routes should follow the existing pattern: `apiApp.get/post(...)`, `express.json()` applied per-route (not globally, since the Stripe webhook needs raw-body access), and a `try/catch` returning a JSON error shape consistent with neighboring routes.
- Static apps (`admin/leads`, `financial/`) are plain ES modules loading the Firebase Web SDK from the `gstatic.com` CDN — no bundler, no framework. Keep new client code in that same style unless a real justification exists to introduce a build step.
- TypeScript in both function codebases targets Node 22 with `tsc` only (no linter configured) — match existing formatting rather than introducing a new style.

## Deployment Restrictions

- **Never run a production deployment from an agent session.** `firebase deploy` (or the `functions/package.json` `deploy` script, which runs `firebase deploy --only functions,firestore,hosting`) requires explicit, separate human authorization every time, regardless of how confident a change appears.
- Do not rename or remove the exported Cloud Functions (`api`, `financialApi`, `renderSite`, `unsubscribe`, `scheduledDiscoverNashvilleHvacLeads`) without a migration plan — Hosting rewrites and any external references (Stripe webhook URL, `renderSite` links, etc.) depend on the current names and regions.
- Do not change `firebase.json` rewrites, `firestore.rules`, or `firestore.indexes.json` without confirming the change is additive/non-breaking to the routes and collections listed above.

## Known Gaps

Documented here rather than silently worked around, per the request that created this file:

- **No automated tests exist anywhere in this repository**, and there is no CI (the `.guthub/` directory is a leftover typo from an unrelated project template and has no functional effect — GitHub does not read a misspelled directory name). Prefer adding tests for new `functions/`/`functions-financial/` logic even without an existing harness to extend; a lightweight Node/Vitest setup is a reasonable starting point if a task specifically calls for it.
- The admin/financial authorization checks are duplicated independently between `functions/` and `functions-financial/` (separate npm packages, no shared internal package). A shared auth-utilities package would remove the duplication but has not been built — do not assume one exists.
- `server.js` (root) is a legacy local static-file/contact-form server unrelated to the Firebase Hosting + Functions deployment path (Hosting serves `.` statically per `firebase.json`'s `ignore` list, which excludes `server.js`). Do not confuse it with the deployed architecture.

## Definition of Done

- The change builds (`npm run functions:build` / `tsc` in the affected codebase) with no new TypeScript errors.
- Firestore rule changes are read through carefully against every collection they affect, including collections unrelated to the immediate change, since the ruleset is a single default-deny file.
- Secrets remain out of source control and out of logs; `git diff`/`git status` reviewed before considering a change complete.
- No production deployment was performed as part of the change.

## Code Review Rules

- Flag any change that widens `requireAdmin`, `requireAdminOrServiceSecret`, or `requireFinancialUser`, or that touches `firestore.rules`, for extra scrutiny — these are the entire security boundary for this repository.
- Flag any change to the financial email allowlist that updates fewer than all four locations listed under "Protected Code Areas."
- Flag any new outbound call from `functions/` or `functions-financial/` to a third-party service that wasn't already present (Stripe, OpenAI, Google Places, Resend today) — new external dependencies need a secrets/config plan, not just code.
