# 14-Day Homestead Chore Tracker Plan

## Fresh Session Execution Brief
- Primary implementation repo: `C:\Users\cfenn\_Git\fennington-landing`.
- Product asset folder: `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 2`.
- Livestock Tracker verification repo: `C:\Users\cfenn\_Git\livestock-tracker-app`.
- n8n workflow to extend later: `C:\Users\cfenn\_Git\n8n\workflows\ABK - v1.5.7.json`.
- Immediate goal: produce the sellable 14-day paper-based product, build `/chore-tracker/` on Fennington, and implement secure test-mode Stripe/Firebase purchase delivery. Do not deploy production or run live Stripe transactions without explicit approval.
- Required positioning: this is a `14-Day Homestead Chore Tracker System`, not an animal-startup planner. The paper method must be complete without Livestock Tracker. Livestock Tracker may be mentioned only as an optional digital alternative using verified features.
- Blocked/missing production inputs: real Stripe price ID, final price, exact refund policy, production secret values, and production deployment approval. Use placeholders/env names where needed; never ask for secrets in chat.
- Recommended execution order: product assets first, website shell and previews second, backend checkout/delivery third, n8n website-builder copy last. The n8n workflow should not deploy production or store Stripe secrets.

## Current Findings

### Product Assets Reviewed
- `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 2\ebook-asset.docx`
- `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 2\value-enhancer.docx`
- `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 2\download.png`

### Digital Product Review
- `ebook-asset.docx` is a narrative homestead organization blueprint, not a finished 14-day chore tracker system. It has useful sections on daily chores, livestock care, garden planning, harvest/resource logs, expenses, and weekly reviews, but it does not currently teach a day-by-day 14-day implementation process.
- `ebook-asset.docx` has 67 text paragraphs, 0 tables, 0 checkbox controls, 0 worksheet pages, 0 embedded media, A4 page size, and 1-inch margins. It is not customer-ready as a paper workbook because there is no writing space, no reusable checklists, no day pages, no assignment tables, and no printed tracking structure.
- `value-enhancer.docx` is bonus/upsell copy rather than a usable product file. It includes unsupported offer language such as a `$197` vault, Airtable/Notion dashboards, calendar sync, video mini-training, and lifetime updates. These claims should not be used unless those assets actually exist.
- `download.png` is a polished cover-style image, but it says `Never Miss a Chore Again: All-in-One Homestead Success Blueprint`, which does not match the requested final product name/promise. It can be used as visual inspiration, but the customer-facing cover should be rebuilt or replaced.
- The current product applies broadly to the homestead in places, but the strongest detailed guidance is livestock/garden/harvest/expense recordkeeping rather than a complete recurring chore-management routine.
- The current product is missing the required complete paper workflow: master chore list, clipboard/binder setup, morning/evening checklists, daily/weekly schedule, animal/area sections, assignments, notes, exception tracking, review process, and reusable post-14-day worksheets.
- The current product is not professionally ready to sell as-is: there are no final PDFs, no print-ready worksheets, no visual consistency checks, and no complete 14-day progression.

### Recommended Product Strategy Changes
- Reposition the product as `14-Day Homestead Chore Tracker System` rather than `Backyard Livestock Planner` or `All-in-One Homestead Success Blueprint`.
- Reuse useful source material from `ebook-asset.docx` where it supports the chore-system promise, but rebuild the product as an actionable workbook.
- Do not use unsupported bonus-vault claims from `value-enhancer.docx` unless separate assets are supplied.
- Keep the paper system complete and primary. Mention Livestock Tracker only as an optional digital alternative in a small number of natural locations.
- Avoid claiming Livestock Tracker has a general recurring chore checklist feature. Verified support includes animal/group tracking, production records, breeding/incubation tracking, health/vaccination/weight/feed record data structures, financial records with recurring expense flags, reminders/notifications, backup/export, cloud sync, and published iOS/Android links.

### Livestock Tracker Verification
- App repo: `C:\Users\cfenn\_Git\livestock-tracker-app`
- Existing sales page: `C:\Users\cfenn\_Git\fennington-landing\livestock-tracker`
- Verified iOS URL: `https://apps.apple.com/us/app/livestock-tracker-app/id6758530813`
- Verified Google Play URL: `https://play.google.com/store/apps/details?id=com.sfennington.livestocktracker&pcampaignid=web_share`
- Verified app capabilities from code/site: animal and group tracking, records, egg/milk/meat logging, breeding/incubation workflows, financial records, notifications/reminders, cloud sync/backup/export depending on plan.
- Not verified: a generic recurring homestead chore checklist/task assignment feature. Sales/product copy should avoid that exact claim.

### Fennington Site Review
- Repo: `C:\Users\cfenn\_Git\fennington-landing`
- Hosting: Firebase Hosting, `public` is repo root, with `/api/**` rewritten to Cloud Function `api`.
- Active Firebase project: `fennington-financial` in `.firebaserc`.
- Backend: Cloud Functions v2 with Express, Firestore, Firebase Admin, CORS.
- Existing Stripe state: `functions/src/index.ts` has a disabled checkout placeholder at `/sites/:siteId/create-checkout-session` and a disabled `/stripe/webhook` placeholder. This is the correct place to extend instead of adding a second backend.
- Existing Firestore rules include `stripeEvents/{eventId}` admin-only, but no digital-product purchase/download collections yet.
- Existing analytics/cookie setup: no obvious sitewide GA, Plausible, cookie consent, or event framework was found.
- Existing brand: Fennington main site is blue/cyan business-tech styling; Livestock Tracker page is farm/app-specific blue with rural imagery. The chore tracker page should use Fennington trust/structure while shifting to practical homestead paper-system visuals.

### Missing Or Manual Configuration
- Stripe product/price ID for this digital product was not discoverable in the repo. Implementation should use env `STRIPE_PRICE_CHORE_TRACKER` and a placeholder until the real Stripe price is configured.
- Stripe secrets must be configured securely as Firebase secrets/env, never pasted into chat: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CHORE_TRACKER`.
- Support email can default to `support@fennington.com` based on existing Livestock Tracker page.
- Refund policy was not found for this digital product. Add conservative placeholder copy on-page and in FAQ until the exact policy is supplied.
- Stripe CLI is not currently installed, so local webhook testing either needs manual install, Firebase emulator tests using crafted requests for invalid signatures, or Stripe dashboard webhook test events after deployment to a test/staging endpoint.
- No Word/LibreOffice/Pandoc/PDF CLI was found in PATH. Use HTML/CSS print masters and browser/Playwright-based PDF rendering instead of relying on Word export.

### n8n Workflow Review
- Workflow inspected: `C:\Users\cfenn\_Git\n8n\workflows\ABK - v1.5.7.json`.
- The workflow has 31 nodes and is currently inactive. It starts from a chat trigger, turns a keyword into market research, pains, solutions, a `$100M Offer`, title options, ebook outline, generated cover, full ebook copy, Claude-enhanced HTML, Cloudinary HTML upload, ConvertAPI DOCX export, a value-enhancer document, and a final chat message with asset links.
- Current phases are explicitly documented in sticky notes as Phase 1 ideation/offer, Phase 2 digital asset creation, and Phase 3 value stacking/final asset delivery.
- It already uses OpenAI, Anthropic Claude via HTTP header auth, ConvertAPI, and Cloudinary. No website build, Stripe checkout, Firebase Hosting, GitHub, or deployment automation is present.
- Some prompts currently encourage broad direct-response/upsell outputs and can produce unsupported claims. For this product, the workflow should add guardrails so the website/product copy stays paper-system focused, does not reference FireLife, does not invent Livestock Tracker features, and does not create fake testimonials/scarcity/earnings claims.
- The workflow file includes placeholder Cloudinary upload URLs such as `YOUR_CLOUD_NAME`; confirm the imported n8n credential/config values before relying on automated output links.
- Recommendation: do not let n8n deploy directly to production or handle Stripe secret keys. Use n8n to generate a structured website content/design package and optionally create a GitHub PR or issue for review. Keep Stripe secrets, webhook setup, and deployment in Firebase/GitHub-controlled infrastructure.

## Implementation Plan

### Phase 1: Product Source And Review Deliverables
1. Preserve the original `.docx` files and `download.png` unchanged.
2. Create a new editable product source folder under the product directory, for example:
   - `final-source/14-day-homestead-chore-tracker-system.html`
   - `final-source/14-day-homestead-chore-tracker-system.css`
   - `final-source/worksheets.html`
3. Build a concise internal review section in the editable source or production notes documenting what changed from the original assets.
4. Treat the shift from the current broad blueprint into a true 14-day chore tracker as a required strategic rebuild based on the user request.

### Phase 2: Product Content Rebuild
1. Create a screen-friendly master version with:
   - Cover page using the final product name.
   - Short promise: build, test, and refine a paper-based homestead chore routine in 14 days.
   - Setup instructions for binder/clipboard, printed chore list, morning/evening checklists, daily/weekly schedule, animal/area sections, assignments, notes, and exception tracking.
   - Clear explanation that the app is optional, not required.
2. Create a logical 14-day progression:
   - Day 1: inventory every recurring chore.
   - Day 2: sort chores by homestead area and time of day.
   - Day 3: identify daily, weekly, seasonal, and exception-based tasks.
   - Day 4: build the master chore list.
   - Day 5: create morning and evening checklists.
   - Day 6: assign responsible people and backup owners.
   - Day 7: run the first full-day paper test.
   - Day 8: add notes and exception tracking.
   - Day 9: simplify repeated or unnecessary steps.
   - Day 10: add weekly schedule anchors.
   - Day 11: tighten animal/area sections.
   - Day 12: review missed chores and failure points.
   - Day 13: finalize the repeatable routine.
   - Day 14: complete the ongoing maintenance plan.
3. Include whole-homestead examples: poultry, goats, rabbits, garden, greenhouse, compost, water systems, tools, fences, feed/supplies, household-adjacent homestead work.
4. Add reusable worksheets with sufficient writing space:
   - Master chore inventory.
   - Homestead area/animal section planner.
   - Morning checklist.
   - Evening checklist.
   - Daily chore tracker with checkboxes, owner, notes, and exceptions.
   - Weekly schedule.
   - Task assignment/backups sheet.
   - Missed chore and exception log.
   - 14-day review worksheet.
   - Ongoing weekly review sheet.
5. Add optional Livestock Tracker mentions only where natural, using verified wording such as:
   - `Prefer to manage animal records and farm logs digitally? Livestock Tracker can help with animal groups, production records, breeding/incubation tracking, financial records, reminders, backups, and day-to-day livestock information.`
6. Do not reference FireLife in the product.

### Phase 3: Final Product Assets
1. Render final deliverables:
   - `14-Day-Homestead-Chore-Tracker-System-screen.pdf`
   - `14-Day-Homestead-Chore-Tracker-System-print.pdf`
   - `Reusable-Chore-Tracker-Worksheets.pdf`
2. Use print CSS with explicit page sizes, margins, page breaks, large writing areas, table header handling, and checkbox styling.
3. Generate preview images/mockups from actual final product pages for the sales page.
4. Visually inspect every generated PDF page for clipping, blank pages, overflow, broken tables, tiny text, awkward spacing, and inconsistent styling.
5. Keep editable source files available in the product folder alongside final PDFs.

### Phase 4: Website Page
1. Add a new sales page at `/chore-tracker/` inside the existing `fennington-landing` repo rather than creating a second site.
2. Add files:
   - `chore-tracker/index.html`
   - `chore-tracker/styles.css`
   - `chore-tracker/script.js`
   - `chore-tracker/success.html`
   - `chore-tracker/access.html` or an integrated access/recovery section.
3. Add page sections required by the prompt:
   - Hero with clear outcome-focused headline.
   - Problem explanation.
   - 14-day system description.
   - Who it is for.
   - What is included.
   - How the 14 days work.
   - Preview/mockups from actual product pages.
   - Paper-based system explanation.
   - Livestock Tracker optional digital alternative.
   - Pricing and purchase CTA.
   - FAQ.
   - Refund/privacy/terms links.
   - Contact/support info.
4. Add SEO metadata:
   - Unique title and meta description.
   - Open Graph title/description/image.
   - Product structured data only with accurate price once configured.
   - Search-friendly headings and copy.
5. Use a practical, organized homestead aesthetic while staying compatible with existing Fennington branding.
6. Add a link from the main Fennington products section to `/chore-tracker/`, without changing unrelated existing products unless necessary.
7. Do not include testimonials, fake urgency, unsupported earnings claims, or FireLife references.

### Phase 5: Secure Stripe Checkout
1. Add `stripe` to `functions/package.json` dependencies.
2. Refactor `functions/src/index.ts` so the Stripe webhook route receives the raw request body before `express.json()` is applied.
3. Add server endpoints under existing `/api/**` function:
   - `POST /api/chore-tracker/create-checkout-session`
   - `GET /api/chore-tracker/purchase-status?session_id=...`
   - `POST /api/chore-tracker/recover-access`
   - `GET /api/chore-tracker/download?token=...`
   - replace the placeholder `POST /api/stripe/webhook` with production-safe handling.
4. Checkout behavior:
   - Use `STRIPE_PRICE_CHORE_TRACKER` from secure config.
   - Create a Stripe hosted Checkout Session in payment mode.
   - Collect customer email through Stripe Checkout.
   - Set metadata such as `product_slug=chore-tracker` and `fulfillment_version`.
   - Redirect success to `/chore-tracker/success.html?session_id={CHECKOUT_SESSION_ID}`.
   - Redirect cancel to `/chore-tracker/?checkout=cancelled`.
   - Never expose Stripe secret keys in client code.
5. Webhook behavior:
   - Verify signatures with `STRIPE_WEBHOOK_SECRET`.
   - Handle `checkout.session.completed`.
   - Retrieve/verify line items and confirm the price ID matches `STRIPE_PRICE_CHORE_TRACKER`.
   - Use a Firestore transaction on `stripeEvents/{eventId}` for idempotency.
   - Record purchase in a collection such as `digitalPurchases/{purchaseId}`.
   - Hash customer email for lookup and recovery.
   - Create a time-limited download token stored hashed in Firestore.
   - Send or trigger purchase-confirmation email with the access link.
   - Avoid duplicate fulfillment/emails when Stripe retries the event.
6. Customer access:
   - Use time-limited secure download links as the simplest architecture.
   - Store the paid PDF outside Firebase Hosting public files. Prefer Firebase Storage private object if configured; otherwise package it in a non-public Cloud Functions private asset folder and stream only after token verification.
   - Add access recovery by email. The response should be generic whether an email exists or not.
   - Do not grant access based only on the success-page redirect.

### Phase 6: Firestore Rules And Data Model
1. Add admin-only Firestore rules for purchase and token collections, for example:
   - `digitalProducts/{productId}` admin-only writes, optional public read only if no secrets/prices are exposed.
   - `digitalPurchases/{purchaseId}` admin-only read/write.
   - `downloadTokens/{tokenId}` admin-only read/write.
   - `stripeEvents/{eventId}` already exists as admin-only.
2. Do not allow clients to read purchase or token data directly.
3. Server endpoints should be the only way to create checkout sessions, recover access, or download files.

### Phase 7: Email Fulfillment
1. Reuse existing Resend pattern from outreach if `RESEND_API_KEY` and from-email config are available.
2. Add product confirmation email content:
   - Product name.
   - Thank you line.
   - Secure access link.
   - Support email.
   - Refund/access recovery note.
3. If email config is missing in local/test mode, record purchase and token but show a clear server-side pending-email state for manual verification.

### Phase 8: Analytics
1. Because no existing sitewide analytics/cookie framework was found, add a small analytics wrapper that no-ops unless a configured provider exists.
2. Track intended events without adding invasive cookies by default:
   - Page view.
   - Checkout button click.
   - Checkout session created.
   - Purchase confirmed on success page after server verification.
   - Download started.
   - Access recovery submitted.
3. If a GA measurement ID or Firebase web analytics config is later supplied, wire the wrapper to it while respecting any future consent configuration.

### Phase 9: Testing Plan
1. Product asset testing:
   - Render screen PDF, print PDF, and worksheet PDF.
   - Visually inspect every page.
   - Check page breaks, margins, headings, tables, checkboxes, and writing space.
2. Website testing:
   - Desktop layout.
   - Mobile layout.
   - Keyboard navigation.
   - Form labels and focus states.
   - SEO/social metadata sanity check.
3. Backend/build testing:
   - `npm --prefix functions run build`.
   - `firebase emulators:start --only hosting,functions,firestore,auth` where feasible.
   - Production build command currently available: `npm run functions:build` from repo root.
4. Stripe test-mode scenarios:
   - Create checkout session with test price.
   - Successful payment with Stripe test card.
   - Cancelled checkout.
   - Duplicate webhook delivery does not duplicate purchase/email/token side effects.
   - Invalid webhook signature returns an error and creates no purchase.
   - Purchase access without payment is denied.
   - Recovery email flow creates a new valid token for legitimate purchases.
   - Missing/private product file returns a controlled error.
5. Do not run live transactions or deploy production without explicit authorization.

### Phase 10: Optional n8n Website-Build Workflow Extension
1. Preserve `ABK - v1.5.7.json` unchanged initially and create a copied workflow file such as `ABK - v1.5.8 Website Builder.json` for review/import testing.
2. Add a fourth sticky-note section: `PHASE 4: SALES WEBSITE BUILD PACKAGE`.
3. Add a new branch after `Upload HTML to Cloudinary` or after `Convert Value to DOCX` so the website package has access to:
   - Selected product title.
   - Offer summary.
   - Research brief.
   - Ebook HTML URL.
   - Cover/preview image URL.
   - Value enhancer output.
4. Add a `Build Website Brief` code node that normalizes workflow outputs into a strict JSON object:
   - `productName`
   - `slug`
   - `headline`
   - `subheadline`
   - `problemBullets`
   - `includedItems`
   - `howItWorks`
   - `paperSystemCopy`
   - `digitalAlternativeCopy`
   - `faq`
   - `seoTitle`
   - `metaDescription`
   - `ogDescription`
   - `previewImageUrl`
   - `checkoutPlaceholder`
   - `manualReviewWarnings`
5. Add an AI node named `Generate Sales Page Copy` with strict guardrails:
   - Must generate copy for a practical, paper-based homestead chore tracker.
   - Must not require an app to complete the system.
   - Must not invent Stripe price IDs, refund policies, testimonials, reviews, scarcity, earnings claims, or unsupported app features.
   - Must not reference FireLife.
   - Must describe Livestock Tracker only as an optional digital alternative using verified capabilities.
   - Must return strict JSON, not prose.
6. Add a code node named `Build Static Sales Page Files` that converts the JSON into downloadable binary files:
   - `chore-tracker/index.html`
   - `chore-tracker/styles.css`
   - `chore-tracker/script.js`
   - `chore-tracker/README-review-notes.txt`
7. Add a quality-gate code node named `Validate Website Package` that fails the workflow if output contains blocked terms or risky claims:
   - `FireLife`
   - fake testimonial markers
   - fake scarcity language
   - unverified app claims such as generic recurring chore checklist support
   - empty SEO title/meta description
   - missing checkout placeholder
8. Add a final output node that includes both product asset links and website package links in the chat response.
9. Optional later automation: add GitHub integration to create a branch and PR against `fennington-landing`, but only after manual review of the generated files. Required GitHub secret/token should live in n8n credentials, not in the JSON export.
10. Do not use n8n for final Firebase deployment. Deployment should remain a manual or CI-reviewed step after local build/test verification.

## Manual Actions Still Needed Before Production
- Create or identify the real Stripe product and test/live price for `14-Day Homestead Chore Tracker System`.
- Configure Firebase secrets securely:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_CHORE_TRACKER`
  - `RESEND_API_KEY` if purchase emails should be sent automatically.
- Confirm final price and refund policy text.
- Confirm whether the final paid PDF should be stored in Firebase Storage or bundled privately with the function.
- Add the deployed webhook endpoint in Stripe after implementation.
- Approve production deployment and live checkout testing.

## Definition Of Done For Implementation
- Final product teaches a complete paper-based chore system without requiring an app.
- Product includes polished screen, print, and reusable worksheet PDFs.
- PDFs are visually inspected page-by-page.
- Livestock Tracker is presented accurately as optional.
- `/chore-tracker/` exists under Fennington branding.
- Stripe Checkout is server-created and uses the configured product price.
- Webhook verifies signatures, records purchases, and is idempotent.
- Paid access is protected with time-limited links and recovery.
- Build/tests pass or any environmental blockers are documented.
- Remaining manual deployment/configuration steps are clearly documented.
