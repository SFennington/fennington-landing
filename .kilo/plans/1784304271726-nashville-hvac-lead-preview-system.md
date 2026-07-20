# Nashville HVAC Lead + Preview System Plan

## Goal

Build an MVP inside `fennington-landing` that creates a real Nashville HVAC prospecting system: discover qualified HVAC contractors, score website gaps, store leads/previews in Firebase, generate live preview pages, let the owner review/approve outreach from a protected admin page, and send a small number of compliant approved emails through Resend.

The first market is confirmed as `HVAC in Nashville`.

## Current Repo Context

- The repo is currently a mostly static Fennington site with `index.html`, trade sample folders (`electrical/`, `snow-removal/`, `landscaping/`), reusable templates under `templates/`, and a simple `server.js` Express/Nodemailer backend.
- There is no Firebase config currently in the repo.
- Polsia `siteproof-6` is not a complete lead/outreach system. It is useful as reference only for Google Places place-detail mapping, review caching, contractor page sections, and service-area/service-list derivation.
- Existing templates are static HTML/CSS/JS and should be preserved. The dynamic preview renderer should reuse this visual direction rather than replacing the site with the Polsia Next.js app.

## Decisions

- First segment: HVAC.
- First metro: Nashville, TN.
- Initial lead cap: 25 newly scored leads per day.
- Initial approved email cap: 10 sent emails per day.
- Data store: Firebase Firestore.
- Hosting/backend: Firebase Hosting + Cloud Functions.
- Admin auth: Firebase Auth with email allowlist.
- Lead source: official Google Places API first. Add third-party providers later only behind a provider adapter.
- Email provider: Resend with verified sending subdomain/domain auth.
- Outreach mode: manual-approved email sends only. No fully automated cold-email blast in MVP.
- SMS: later Twilio phase only. MVP stores phones and supports manual call tasks; no Google Voice automation.
- Live URLs: support `https://fennington.com/sites/:slug` always. Support `https://:slug.fennington.com` as primary live URL only after wildcard DNS/Firebase Hosting domain routing is verified.
- Preview SEO: unpaid/generated previews are `noindex,nofollow`; activated/live sites can be indexable.
- Stripe: design the data model and API seam for checkout/webhook activation, but keep payment activation behind a placeholder until product/price decisions are finalized.
- Email compliance: live sending remains disabled until physical mailing address, unsubscribe route, suppression list, and Resend DNS verification are configured.

## External Research Constraints

- Google Places Text Search supports categorical discovery, `minRating`, location restriction/bias, pagination, and fields like `rating`, `userRatingCount`, `websiteUri`, `nationalPhoneNumber`, `regularOpeningHours`, `businessStatus`, `types`, `primaryType`, and `displayName` depending on field mask/SKU.
- Google Places Place Details supports details by place ID, requires explicit field masks, and can return phone, rating, review count, website URL, address, hours, business status, photos/reviews depending on requested fields/SKU. It does not return email addresses.
- Google Places type filtering includes `plumber`, `electrician`, and `roofing_contractor` as Table A request types. HVAC does not appear as a clean first-class Table A request type, so Nashville HVAC discovery should use text queries like `HVAC contractor in Nashville TN`, `air conditioning repair Nashville TN`, and `heating contractor Nashville TN`, then filter by returned types/text.
- Firebase scheduled functions support recurring jobs. Firebase Hosting supports rewrites to Functions and static hosting, but wildcard subdomain behavior must be validated with the domain registrar/Firebase Hosting setup before making subdomains the only activation path.
- Resend requires verified sending domains/subdomains. Use a sending subdomain such as `outreach.fennington.com` or `mail.fennington.com` to isolate cold-outreach reputation from the root domain.
- FTC CAN-SPAM rules apply to commercial B2B email. Requirements include truthful headers, non-deceptive subject lines, ad disclosure, valid physical postal address, clear opt-out, honoring opt-outs, and monitoring vendors.
- Stripe Checkout supports hosted checkout sessions. Stripe webhook fulfillment must verify signatures, process `checkout.session.completed`, handle duplicate events, and not rely on client redirects alone.

## High-Level Architecture

Use Firebase as the backend and keep the current static site style.

- `public`/repo root static pages remain the public Fennington site.
- New Firebase Hosting rewrites route API calls to Cloud Functions.
- Firestore is the source of truth for leads, preview sites, outreach, suppression, jobs, and admin config.
- Cloud Functions handle scheduled discovery, Places lookups, website scoring, preview generation records, admin mutations, Resend sends, unsubscribe handling, and future Stripe webhooks.
- Admin page is a lightweight protected browser app under `/admin/leads` using Firebase Auth.
- Preview/live pages render from Firestore records at `/preview/:slug` and `/sites/:slug`. The same renderer can switch mode based on `site.status`.

## Primary URLs

- `/hvac/` static HVAC sample page.
- `templates/hvac/` reusable static HVAC template assets for generation/reference.
- `/preview/:slug` unpaid prospect preview page, `noindex,nofollow`.
- `/sites/:slug` activated/live site page, indexable when `site.status === "live"`.
- `/:slug.fennington.com` optional live subdomain route after wildcard DNS/Hosting is validated.
- `/admin/leads` protected lead review dashboard.
- `/unsubscribe/:token` one-click opt-out page.
- `/api/*` Firebase Functions endpoints.

## Firestore Collections

### `leads/{leadId}`

Fields:

- `placeId`: Google Places ID, unique logical key.
- `source`: `google_places`.
- `trade`: `hvac`.
- `market`: `nashville-tn`.
- `businessName`.
- `slug`.
- `rating`.
- `reviewCount`.
- `phone`.
- `formattedAddress`.
- `serviceArea`.
- `websiteUri`.
- `googleMapsUri`.
- `businessStatus`.
- `types`.
- `hours`.
- `photos` optional metadata only.
- `reviews` limited cached review snippets if returned by Details and legally usable for preview display.
- `websiteAudit`: object with status and flags.
- `qualification`: object with `passes`, `score`, `reasons`.
- `emailDiscovery`: object with `email`, `sourceUrl`, `confidence`, `status`.
- `outreachStatus`: `not_ready | email_ready | approved | sent | replied | bounced | unsubscribed | rejected | call_queue`.
- `previewSiteId`.
- `createdAt`, `updatedAt`, `lastScoredAt`, `lastContactedAt`.

### `sites/{siteId}`

Fields:

- `leadId`.
- `slug`.
- `businessName`.
- `trade`: `hvac`.
- `market`: `nashville-tn`.
- `status`: `preview | live | disabled`.
- `template`: `hvac`.
- `canonicalPath`: `/sites/:slug`.
- `previewPath`: `/preview/:slug`.
- `subdomain`: optional, DNS-safe lowercase slug.
- `seoIndexable`: boolean, false until live.
- `content`: normalized business/template content used by renderer.
- `source`: copied lead snapshot to keep preview stable.
- `stripe`: future-ready object with `checkoutSessionId`, `customerId`, `subscriptionId`, `activatedAt`.
- `createdAt`, `updatedAt`, `activatedAt`.

### `outreach/{messageId}`

Fields:

- `leadId`, `siteId`.
- `channel`: `email`.
- `toEmail`.
- `fromEmail`.
- `subject`.
- `html`.
- `text`.
- `status`: `draft | approved | sent | failed | bounced | complained | unsubscribed`.
- `resendEmailId`.
- `variant`.
- `approvedBy`, `approvedAt`, `sentAt`.
- `error`.

### `suppressions/{emailHash}`

Fields:

- `emailHash`.
- `emailLower` optional if acceptable; prefer hash if not needed in UI.
- `reason`: `unsubscribe | bounce | complaint | manual`.
- `createdAt`.
- `sourceMessageId`.

### `jobs/{jobId}`

Fields:

- `type`: `lead_discovery | website_audit | email_send`.
- `market`, `trade`.
- `status`: `running | complete | failed`.
- `startedAt`, `completedAt`.
- `counters`: candidate count, inserted, updated, skipped, errors.
- `errors`: capped array of safe error messages.

### `config/{doc}`

Docs:

- `markets`: includes Nashville search bounding box/radius, queries, caps.
- `admin`: allowlisted admin emails.
- `email`: sending enabled flag, daily cap, physical mailing address, from domain/subdomain.
- `stripe`: enabled flag, product/price placeholders.

## Lead Qualification Rules

MVP candidate passes only if:

- Trade is HVAC-like based on query source and returned business name/types.
- Market is Nashville area.
- `businessStatus` is operational or not known closed.
- `rating >= 4.0`.
- `reviewCount >= 50` for this research-backed target. Keep `10+` as a lower bound field but do not prioritize unless the dashboard filter is changed.
- Has no website OR website audit indicates broken/basic/poor.

Website audit flags:

- `missing_website`: no `websiteUri`.
- `unreachable`: DNS/connect timeout.
- `http_error`: 4xx/5xx.
- `no_https`: final URL is HTTP only or invalid SSL.
- `facebook_or_directory_only`: final URL is Facebook, Angi, Yelp, Thumbtack, HomeAdvisor, Houzz, Google profile, Linktree, etc.
- `slow_response`: response exceeds configured timeout.
- `thin_content`: very low text length or placeholder copy.
- `missing_phone_or_cta`: no obvious phone/contact CTA in fetched HTML.
- `mobile_unfriendly_signal`: missing viewport or severe layout signal detectable from HTML.

Do not auto-send based on score. Admin approval is required.

## Daily Nashville HVAC Discovery Flow

1. Scheduled function runs once daily.
2. Load `config/markets.nashville-tn` and `config/email`.
3. Run official Google Places Text Search queries:
   - `HVAC contractor in Nashville TN`
   - `air conditioning repair Nashville TN`
   - `heating contractor Nashville TN`
   - `furnace repair Nashville TN`
4. Request minimal search fields needed for filtering and dedupe.
5. Dedupe candidates by `placeId`; secondarily by normalized phone and normalized business/address.
6. Fetch Place Details for candidates not seen recently.
7. Filter rating/review count/business status.
8. Audit listed website if present.
9. Create or update `leads`.
10. Generate or update `sites` preview record for qualified leads.
11. Attempt email discovery only from legitimate public sources:
    - If website exists and is reachable, scan homepage/contact/about pages for public emails.
    - Do not generate guessed emails.
    - Do not harvest private/personal emails from unrelated data sources.
12. Set `outreachStatus`:
    - `email_ready` when qualified and email found.
    - `call_queue` when qualified but no email found.
    - `not_ready` or `rejected` for non-qualified.
13. Stop after 25 newly scored qualified leads per day.
14. Write a `jobs` summary.

## Preview Generation

Use the HVAC template and dynamic Firestore data to render:

- Business name.
- Rating and review count.
- Service area.
- Phone.
- Address/hours where available.
- HVAC service list.
- Google review snippets if returned and acceptable to display.
- Clear CTA: call `413-255-1777`, email `Contact@fennington.com`, and future claim/activate button.

Preview mode must include:

- Banner: “Preview generated by Fennington.”
- `noindex,nofollow` metadata/header.
- No public claim that the contractor endorsed the site.

Live mode must include:

- No preview banner unless desired.
- Indexable metadata when `seoIndexable === true`.
- Live path at `/sites/:slug` and optional subdomain.

## HVAC Template Work

Create both:

- `/hvac/` static public sample page.
- `templates/hvac/` reusable template copy.

Style requirements:

- Match the structure and visual language of existing `electrical/`, `snow-removal/`, and `landscaping/` templates.
- Use HVAC-specific services and copy: AC repair, heating repair, system installation, maintenance, emergency service, ductwork/indoor air quality if appropriate.
- Replace generic 200+ reviews text in generated previews with actual lead review count.
- Keep mobile responsiveness consistent with existing templates.

## Admin Dashboard

Path: `/admin/leads`.

Auth:

- Firebase Auth client login.
- Backend admin endpoints verify ID token and allowlisted email/custom claim.

Features:

- Filter by market, trade, status, score flags, email availability, review count, rating.
- Lead table with business name, rating, review count, phone, website flags, email status, preview link, outreach status.
- Lead detail drawer/page with Places data, website audit, preview URL, discovered email/source, generated email draft.
- Actions: approve email, reject lead, mark call task, send approved email, edit draft before approval, regenerate preview, rerun website audit.
- Daily counters: new leads today, approved emails today, sent emails today, remaining send cap.

## Email Outreach

Provider:

- Resend API.
- Recommended sending subdomain: `outreach.fennington.com` or `mail.fennington.com`.

Pre-launch requirements before live sending can be enabled:

- Resend domain verified.
- SPF/DKIM/DMARC configured.
- `CONTACT_EMAIL` / reply-to set to `Contact@fennington.com`.
- Valid physical mailing address or registered mailbox configured.
- `/unsubscribe/:token` implemented.
- Suppression list enforced.

Sending rules:

- Only send to leads with `outreachStatus === approved`.
- Enforce 10/day cap server-side.
- Check suppression list before sending.
- Record all sends in `outreach`.
- Keep body under ~100 words for initial variants.
- Include specific personalization: business name, actual rating/review count, website-gap observation, preview link.
- Include CTAs: preview link, call `413-255-1777`, reply to `Contact@fennington.com`.
- Include compliant footer and one-click unsubscribe.

Initial email variants:

- Variant A: “Your Google reviews could be doing more.”
- Variant B: “I made a quick website preview for {{businessName}}.”
- Variant C: “{{reviewCount}} reviews, but no strong website?”

Do not use deceptive subject lines such as pretending to be a customer or Google.

## Stripe Activation Seam

Implement data/API placeholders, but keep UI disabled or “coming soon” until Stripe offer is finalized.

Future endpoints:

- `POST /api/sites/:siteId/create-checkout-session`.
- `POST /api/stripe/webhook`.

Activation behavior:

- Checkout session metadata includes `siteId`, `leadId`, and `slug`.
- Webhook verifies Stripe signature and handles `checkout.session.completed`.
- Webhook is idempotent by storing processed Stripe event IDs.
- On successful payment, set `sites/{siteId}.status = live`, `activatedAt`, and `seoIndexable = true`.
- Do not trust success redirect alone.

## Firebase Hosting/Functions Setup

Add Firebase project configuration in implementation:

- `firebase.json` with Hosting rewrites for API Functions and dynamic site routes.
- `firestore.rules` with public read allowed only for safe published site data, admin-only writes, and no direct public access to leads/outreach.
- `firestore.indexes.json` for admin filters.
- `functions/` Node/TypeScript project using Firebase Functions v2 where practical.

Suggested Functions:

- `scheduledDiscoverNashvilleHvacLeads`.
- `apiGetLeadAdminList`.
- `apiGetLeadDetail`.
- `apiApproveOutreach`.
- `apiSendApprovedOutreach`.
- `apiRenderPreviewData` or renderer data endpoint if static shell fetches JSON.
- `apiUnsubscribe`.
- `apiStripeWebhook` placeholder/future.
- `apiCreateCheckoutSession` placeholder/future.

Secrets/config:

- `GOOGLE_PLACES_API_KEY`.
- `RESEND_API_KEY`.
- `RESEND_FROM_EMAIL`.
- `CONTACT_EMAIL=Contact@fennington.com`.
- `BUSINESS_PHONE=413-255-1777`.
- `ADMIN_EMAILS`.
- `OUTREACH_PHYSICAL_ADDRESS` required before send enabled.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` future.

## Security And Compliance

- Never expose API keys to client JS.
- Admin endpoints require verified Firebase Auth token and allowlist.
- Public site data endpoint must return only sanitized site content, never lead audit internals or outreach records.
- Sanitize all rendered business/review/template fields to prevent injection.
- Avoid storing unnecessary personal data.
- Add rate limiting or App Check for public mutation endpoints if any are added.
- Enforce suppression list and unsubscribe before every send.
- Store consent/outreach status history for auditability.
- Treat phone outreach as manual tasks only in MVP.

## Rollout Steps

1. Add Firebase project scaffolding and emulator-compatible Functions/Firestore setup.
2. Add HVAC static sample page and `templates/hvac/` using existing trade template style.
3. Define shared lead/site/outreach schemas and validation utilities.
4. Implement Google Places provider adapter for Nashville HVAC Text Search and Place Details.
5. Implement website audit utility with safe fetch timeouts and simple scoring flags.
6. Implement Firestore upsert/dedupe for leads and sites.
7. Implement scheduled daily capped discovery job with dry-run/manual-trigger support.
8. Implement preview/site renderer for `/preview/:slug` and `/sites/:slug` using Firestore site records.
9. Implement Firebase Auth admin page and admin APIs.
10. Implement Resend email draft/send flow with server-side cap and suppression enforcement.
11. Implement unsubscribe route and suppression collection.
12. Add Stripe placeholder fields/endpoints behind disabled UI or config flag.
13. Configure Firebase Hosting rewrites and validate path-based live sites.
14. Validate wildcard subdomain feasibility separately; do not block MVP on it.

## Validation Plan

Local/emulator:

- Run Firebase emulators for Functions, Firestore, Auth, and Hosting.
- Seed a fake Nashville HVAC lead and verify preview renders.
- Run discovery in dry-run mode with a low cap and confirm no writes if dry-run is enabled.
- Verify dedupe by repeated `placeId`.
- Verify website audit handles missing, 404, timeout, HTTP-only, and directory-only URLs.
- Verify admin endpoints reject unauthenticated and non-allowlisted users.
- Verify admin can approve an email but send is blocked if compliance config is incomplete.
- Verify suppression blocks sending.
- Verify `/unsubscribe/:token` suppresses the email and updates outreach status.
- Verify previews include `noindex,nofollow`; live sites can become indexable only when status is live.

Production smoke tests:

- Deploy Firebase Hosting/Functions to a test channel first.
- Confirm `/hvac/`, `/preview/test-slug`, `/sites/test-slug`, and `/admin/leads` load.
- Run manual discovery for Nashville with cap 3 before enabling schedule.
- Approve and send only to a controlled internal/test email through Resend first.
- Check Resend logs and headers for DKIM/SPF alignment.
- Confirm daily email cap enforcement.

## Out Of Scope For MVP

- Fully automated cold email blasting.
- Automated SMS or Google Voice texting.
- Paid lead enrichment APIs unless email discovery quality is too low after MVP.
- Association directory scraping or gated member-list access.
- n8n orchestration unless Firebase Functions prove insufficient.
- Custom-domain purchasing/management for customers.
- Full Stripe auto-activation until price/product is finalized.
- Multi-city expansion to Austin/Charlotte.
- Multi-trade expansion to plumbing/electrical/landscaping/general contractors.

## Known Risks

- Google Places may not surface all HVAC businesses because HVAC is not a clean Table A type; text query coverage must be measured.
- Google Places does not provide emails; many best leads with no website will land in call queue rather than email-ready queue.
- Displaying Google review text may have policy constraints; validate allowed usage before relying on review snippets in public previews.
- Cold email deliverability can be damaged by poor lists, missing compliance footer, high bounce rate, or over-sending. Keep the 10/day cap until results are reviewed.
- Wildcard subdomains on Firebase Hosting may require DNS/Hosting verification that is separate from normal path routing. Keep `/sites/:slug` as the guaranteed fallback.

## Future Expansion

- Add Austin and Charlotte after Nashville lead quality is reviewed.
- Add plumbers and electricians next; both have clearer Google Places type support.
- Add third-party provider adapter for Outscraper/Apify/SerpAPI if official Places API volume is insufficient.
- Add Twilio SMS only with compliant opt-in/consent strategy.
- Add Stripe Checkout activation once pricing is decided.
- Add CSV/Sheets export for manual workflows.
- Add association/community outreach tracking as separate CRM channels.
