# Fennington Digital Product Operating System Plan

## Goal
Build a repeatable Fennington Digital Product Operating System (FD-POS) that turns a generated ebook into a reviewed, packaged, sellable digital product, then hands the approved product to website, Stripe fulfillment, and content-marketing automations.

This plan supersedes the prior one-off `14-Day Homestead Chore Tracker System` direction. The paid product for the current run is the ebook asset in `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 3\ebook-asset`, sold at `$17`, with supporting resources generated only after review/approval.

## Implementation Status And Resume Point
Last updated: 2026-08-02.

### Completed
- [x] Defined the FD-POS lifecycle, Firestore schemas, manifest shape, approval types, and quality gates.
- [x] Added generic digital-product registration, Stripe Product/Price, checkout, webhook fulfillment, access recovery, and private-download APIs.
- [x] Added Firebase Admin/service-secret authentication for n8n-to-Firebase calls.
- [x] Added admin-only Firestore rules for product assets, promises, tasks, approvals, packages, purchases, tokens, and Stripe events.
- [x] Added the Attempt 3 Backyard Livestock Planner registration and DOCX extraction scripts.
- [x] Built ebook Promise Review, named-human approval submission, source rewrite handling, and XLSX/CSV review tooling.
- [x] Corrected the two approved source rewrites in `Attempt 3/value-enhancer.docx`: manual calendar entry and non-medical observation records.
- [x] Separated paid-ebook promises from value-enhancer recommendations. Value-enhancer records now use `sourceIntent: proposal` and `inclusionStatus: NOT_INCLUDED`.
- [x] Added feasibility, one-time cash, labor, outsourcing, recurring-cost, dependency, and limitation estimates for value-enhancer proposals.
- [x] Added stored per-product `supervisorPolicy`, supervisor evaluation API/task orchestration, and `C:\Users\cfenn\_Git\n8n\workflows\FD-POS - Supervisor.json`.
- [x] Added `C:\Users\cfenn\_Git\n8n\workflows\FD-POS - Asset Builder.json` plus backend work, registration, completion, and approval gates.
- [x] Validated Functions TypeScript builds, Firestore rules, n8n workflow JSON, DOCX extraction, review submission, and approval-gate rejection in Firebase emulators.

### Current Pause Point
- [ ] User must review the 11 `PENDING` rows in `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\Attempt 3\product-review-v2.xlsx`, sheet `Value Enhancer Feasibility`.
- [ ] Allowed human feasibility decisions: `FEASIBLE`, `REWRITE_AS_STATIC`, `MOVE_TO_UPSELL`, or `REJECT`.
- [ ] Do not treat feasibility as inclusion. All 20 recommendations remain excluded from the `$17` product until a separate promotion/asset-generation approval.
- [ ] After review, submit the v2 feasibility decisions, create a proposed included-asset list, consolidate overlapping resources, and request explicit inclusion approval.

Latest supervisor result under the conservative policy:
- 20 value-enhancer proposals evaluated.
- 7 live, personalized, community, or ongoing-service proposals automatically rejected.
- 2 unsupported automation/medical ideas automatically changed to `REWRITE_AS_STATIC`.
- 11 proposals require human feasibility review.
- 0 proposals included by default.

Current supervisor settings are visible in the workbook's `Supervisor Policy` sheet and stored in the product manifest: static printables/spreadsheets allowed; prerecorded training, research-heavy, app-dependent, live-service, and ongoing-support work require review or are disabled; automatic inclusion is disabled; automatic recurring-cost threshold is `$0/month`.

### Resume Procedure
1. Inspect both repository worktrees before editing; there are intentional uncommitted implementation changes after the last pushed commits.
2. Read `product-review-v2.xlsx` and confirm all `Value Enhancer Feasibility` rows have final decisions.
3. Complete the v2 feasibility-decision import/submission path. Do not reuse the old promise-list importer as an inclusion approval.
4. Start Firebase emulators with the portable JDK 21 at `C:\Users\cfenn\AppData\Local\Temp\kilo\jdk-21\jdk-21.0.12+8` if system Java remains below 21.
5. Rehydrate emulator state with `npm run fd-pos:register-backyard-livestock` and `npm run fd-pos:promise-review-backyard-livestock`, then call `/digital-products/backyard-livestock-planner/supervisor/evaluate-proposals`.
6. Apply reviewed feasibility decisions, generate a separate inclusion proposal, and keep `inclusionStatus: NOT_INCLUDED` until explicit human promotion approval.
7. Only then consolidate approved ebook-required assets with promoted value-enhancer assets and run one stored Asset Builder test output.

Intentional uncommitted implementation work at pause time includes `functions/src/index.ts`, `package.json`, `scripts/fd-pos-register-backyard-livestock.js`, `scripts/fd-pos-submit-promise-approval.ps1`, new `scripts/fd-pos-export-product-review-v2.ps1`, and the n8n supervisor workflow. Do not discard these changes. Unrelated existing workspace/plan files must also remain untouched.

## Context Reviewed
- Repo: `C:\Users\cfenn\_Git\fennington-landing`.
- Current Firebase Hosting serves repo root and rewrites `/api/**` to Cloud Function `api`.
- Current Cloud Functions already include Stripe, Firestore, Resend, download-token, and hardcoded chore-tracker checkout/download logic.
- Firestore rules already include admin-only `digitalProducts`, `digitalPurchases`, `downloadTokens`, and `stripeEvents` collections.
- Current n8n ABK workflow: `C:\Users\cfenn\_Git\n8n\workflows\ABK - v1.5.7.json`.
- ABK currently does keyword research, pains, solutions, `$100M Offer`, title selection, outline, ebook copy, cover image, Claude HTML enhancement, Cloudinary upload, ConvertAPI DOCX export, and a value-enhancer DOCX.
- PaidCreators/PERC history reviewed at `G:\My Drive\Business\Digital Products\Backyard Livestock Planner 1\ChatGPT Plus History for Paid Creators Plan.txt`.
- Available PaidCreators context is short but establishes the desired higher-value structure: pillars, fixes within each pillar, concrete downloadable resources per fix, app/spreadsheet/paper implementation paths, and optional Livestock Tracker integration without making the app required.

## Core Decisions
- Use a hybrid system: n8n for generation/integration, Firestore for canonical product state, Firebase Functions for checkout/fulfillment/package APIs, Google Sheets or Firestore-backed review views for approvals.
- The Manager AI starts as an n8n workflow that reads product state, validates outputs, creates tasks, asks for approval, and triggers sub-workflows. It can later move into a Firebase app if orchestration logic becomes too complex.
- Do not build another hardcoded product flow. Convert the existing chore-tracker-specific backend into generic digital-product infrastructure.
- Stripe webhook should be one reusable endpoint for all products. New products get Stripe Products/Prices, not new webhook code.
- Human approval is required before generating extra promised assets, before publishing a sales page, before enabling live checkout, and before activating Content Reactor marketing.
- Marketing/content automation must consume only approved product metadata, approved claims, and live/launch-ready sales page URLs.

## Product Lifecycle
Use these product statuses as the canonical state machine:

1. `IDEA`
2. `ABK_GENERATING`
3. `EBOOK_GENERATED`
4. `SOURCE_REVIEW`
5. `PROMISE_EXTRACTION`
6. `PROMISE_APPROVAL_REQUIRED`
7. `SUPPORTING_ASSETS_GENERATING`
8. `SUPPORTING_ASSETS_REVIEW`
9. `PACKAGE_READY`
10. `SALES_PAGE_DRAFT`
11. `SALES_PAGE_APPROVAL_REQUIRED`
12. `STRIPE_DRAFT`
13. `STRIPE_READY`
14. `FULFILLMENT_READY`
15. `LAUNCH_READY`
16. `LIVE`
17. `CONTENT_MARKETING_READY`
18. `CONTENT_MARKETING_ACTIVE`
19. `BLOCKED`
20. `ARCHIVED`

Status changes must record `updatedAt`, `updatedBy`, `reason`, and the workflow/execution that caused the transition.

## Canonical Data Model
Add or formalize these Firestore collections. Keep all direct client access admin-only unless explicitly listed otherwise.

### `digitalProducts/{productId}`
Required fields:
- `productId`
- `slug`
- `name`
- `status`
- `priceCents`
- `currency`
- `primaryAssetPath`
- `sourceFolder`
- `salesPagePath`
- `supportEmail`
- `refundPolicyStatus`
- `approvalRequired`
- `stripeProductId`
- `stripePriceId`
- `fulfillmentPackageId`
- `approvedClaims`
- `blockedClaims`
- `brandRulesVersion`
- `createdAt`
- `updatedAt`

### `productAssets/{assetId}`
Required fields:
- `productId`
- `assetId`
- `name`
- `type`: `ebook`, `pdf`, `worksheet`, `spreadsheet`, `checklist`, `template`, `module`, `cover`, `zip`, `sales-page`, `other`
- `format`: `docx`, `pdf`, `html`, `xlsx`, `gsheet`, `csv`, `png`, `zip`, `md`, `json`
- `pathOrUrl`
- `source`: `abk`, `perc`, `manual`, `website-builder`, `package-builder`
- `status`: `DRAFT`, `NEEDS_REVIEW`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `MISSING`
- `qualityReview`
- `createdAt`
- `updatedAt`

### `productPromises/{promiseId}`
A promise is a customer-facing deliverable, feature, claim, bonus, app tie-in, upsell, or outcome in paid-product or sales copy. Value-enhancer recommendations use the same collection for traceability but must have `sourceIntent: proposal` and `inclusionStatus: NOT_INCLUDED` until explicitly promoted.

Required fields:
- `productId`
- `promiseId`
- `sourceAssetId`
- `sourceLocation`
- `text`
- `category`: `deliverable`, `feature`, `bonus`, `upsell`, `outcome`, `app-tie-in`, `price`, `support`, `refund`, `testimonial`, `scarcity`, `statistic`, `other`
- `riskLevel`: `low`, `medium`, `high`, `blocked`
- `classification`: `keep`, `needs_asset`, `needs_evidence`, `move_to_upsell`, `remove`, `rewrite`, `ignore`, `proposed`
- `sourceIntent`: `product-content`, `proposal`
- `inclusionStatus`: `CANDIDATE`, `NOT_INCLUDED`, `APPROVED_FOR_INCLUSION`
- `feasibility`
- `estimatedCashCostUsd`
- `estimatedLaborHours`
- `estimatedOutsourceCostUsd`
- `recurringCostEstimate`
- `limits`
- `supervisorDecision`
- `supervisorReason`
- `requiredAssetType`
- `approvedBy`
- `approvalStatus`: `PENDING`, `APPROVED`, `REJECTED`, `REWRITE_REQUIRED`
- `linkedAssetIds`
- `notes`
- `createdAt`
- `updatedAt`

### `productTasks/{taskId}`
Required fields:
- `productId`
- `taskId`
- `title`
- `workflow`
- `status`: `OPEN`, `RUNNING`, `WAITING_FOR_APPROVAL`, `DONE`, `FAILED`, `CANCELLED`, `BLOCKED`
- `priority`
- `inputRefs`
- `outputRefs`
- `error`
- `createdBy`: `manager-ai`, `user`, `workflow`, `system`
- `assignedTo`: `manager-ai`, `user`, `workflow-name`, `implementation-agent`
- `createdAt`
- `updatedAt`

### `productApprovals/{approvalId}`
Required fields:
- `productId`
- `approvalId`
- `approvalType`: `promise-list`, `proposal-feasibility`, `asset-generation`, `asset-quality`, `sales-page`, `stripe-live`, `launch`, `content-marketing`
- `status`: `PENDING`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED`
- `summary`
- `items`
- `reviewerNotes`
- `createdAt`
- `decidedAt`

### `productPackages/{packageId}`
Required fields:
- `productId`
- `packageId`
- `version`
- `status`: `DRAFT`, `VALIDATING`, `READY`, `FAILED`, `SUPERSEDED`
- `includedAssetIds`
- `zipPathOrStorageObject`
- `manifestPathOrStorageObject`
- `validationResults`
- `createdAt`
- `updatedAt`

### Existing fulfillment collections
Keep and generalize:
- `digitalPurchases/{purchaseId}`
- `downloadTokens/{tokenHash}`
- `stripeEvents/{eventId}`

## Product Manifest
Every ABK/PERC run must produce a `product-manifest.json` with this minimum shape:

```json
{
  "schemaVersion": "1.0",
  "productId": "backyard-livestock-planner-001",
  "slug": "backyard-livestock-planner",
  "name": "Backyard Livestock Planner",
  "priceCents": 1700,
  "currency": "usd",
  "sourceFolder": "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3",
  "primaryAsset": {
    "name": "ebook-asset",
    "pathOrUrl": "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/ebook-asset.docx",
    "type": "ebook"
  },
  "valueEnhancer": {
    "pathOrUrl": "G:/My Drive/Business/Digital Products/Backyard Livestock Planner 1/Attempt 3/value-enhancer.docx",
    "type": "strategy-doc"
  },
  "targetAudience": "backyard livestock owners, small farms, and homesteaders",
  "approvedImplementationPaths": ["paper", "spreadsheet", "Livestock Tracker app optional"],
  "claimsPolicy": {
    "noFakeTestimonials": true,
    "noFakeScarcity": true,
    "noUnsupportedAppFeatures": true,
    "appIsOptional": true
  },
  "fulfillment": {
    "deliveryMode": "zip-or-private-files",
    "tokenTtlDays": 7
  }
}
```

## PERC-Style Asset Creation Rules
Use the PaidCreators/PERC structure as the preferred product method:

- Product content should be organized into pillars/phases.
- Each pillar should contain practical fixes or steps.
- Each fix should map to one or more concrete resources.
- Resources can be printable PDFs, spreadsheets, app setup companion pages, checklists, templates, phase modules, or review worksheets.
- For each pillar, include an action summary and a short implementation path.
- Each implementation path must say whether the user can complete the system on paper, in a spreadsheet, or optionally in Livestock Tracker.
- Livestock Tracker must be positioned as optional unless the product is explicitly an app subscription or app-based product.
- App feature claims must be limited to verified capabilities: animal/group tracking, production records, breeding/incubation workflows, health/vaccination/weight/feed record data structures, financial records with recurring expense flags, reminders/notifications, backup/export, cloud sync, and published iOS/Android availability.
- Do not claim generic chore checklist/task assignment support unless verified in the app.

## Promise Extraction and Approval
Add a Promise/Asset Review workflow before any supporting assets are generated.

Workflow responsibilities:
1. Read the ebook and value enhancer assets.
2. Extract all mentioned resources, bonuses, templates, spreadsheets, PDFs, app tie-ins, upsells, prices, and claims.
3. Classify each item into `keep`, `needs_asset`, `needs_evidence`, `move_to_upsell`, `remove`, or `rewrite`.
4. Flag high-risk content: fake urgency, testimonials, unsupported statistics, unsupported app claims, lifetime access claims, prices not in manifest, refund claims, and bonuses that do not exist.
5. Create `productPromises` records.
6. Create one `productApprovals` record with the proposed deliverable list.
7. Stop until approval is received.

Approval output must let the reviewer approve, reject, rewrite, or move each item to upsell. Supporting assets are generated only for approved promises classified as `needs_asset` or `keep` with missing linked assets.

## Manager AI Responsibilities
Build a Manager AI orchestrator workflow that runs manually and on a safe schedule. It should:

1. Load active `digitalProducts` not in terminal states.
2. Identify the next valid lifecycle transition.
3. Create or update `productTasks`.
4. Trigger n8n sub-workflows only when prerequisites are satisfied.
5. Create approval records when human review is required.
6. Validate that every sales-page claim maps to an approved promise or asset.
7. Validate that every package file exists before moving to `PACKAGE_READY`.
8. Validate Stripe readiness before moving to `STRIPE_READY`.
9. Validate fulfillment readiness before moving to `LAUNCH_READY`.
10. Prevent Content Reactor activation until product is `LIVE` or explicitly `CONTENT_MARKETING_READY`.
11. Record each action in `systemRuns` or `productTasks`.
12. Mark products `BLOCKED` with a reason when a required dependency fails.

Manager AI must not:
- deploy live changes without approval;
- publish social content;
- create unsupported product claims;
- turn on live Stripe checkout without approval;
- generate unapproved bonuses/resources.

## n8n Workflow Changes
Do not mutate the existing ABK workflow in place at first. Copy it and version forward.

### ABK Upgrade Workflow
Create a new workflow copy such as `ABK - v1.6.0 Product Manifest.json`.

Required changes:
1. Keep current ideation/research/ebook/cover/value-enhancer generation.
2. Add a structured `Build Product Manifest` node after primary asset and value-enhancer links exist.
3. Add guardrails to the value enhancer prompt: it may propose assets and upsells, but must mark them as proposed, not included, until approved.
4. Add output fields for pillar/fix/resource mapping when the product uses the PERC-style method.
5. Add a `Register Product Draft` node that writes the manifest to Firestore or sends it to a Firebase endpoint.
6. Output all asset links, manifest JSON, warnings, and next required approval.

### Promise Review Workflow
Create a workflow such as `FD-POS - Promise Review.json`.

Triggers:
- manual trigger with `productId`;
- optional webhook from Manager AI.

Outputs:
- `productPromises` records;
- `productApprovals` record;
- review summary.

### Approved Asset Builder Workflow
Create a workflow such as `FD-POS - Asset Builder.json`.

Responsibilities:
- read approved promises;
- generate only approved resources;
- create printable/PDF/spreadsheet/app companion assets where requested;
- store outputs;
- write `productAssets` records;
- mark items needing manual creation as `MISSING` or `BLOCKED`.

### Package Builder Workflow
Create a workflow such as `FD-POS - Package Builder.json`.

Responsibilities:
- assemble approved ebook plus approved supporting assets;
- create a package manifest;
- create a ZIP or registered private-file set;
- verify all approved promises have linked assets or approved rewrites/removals;
- write `productPackages`.

### Website Builder Workflow
Create a workflow such as `FD-POS - Website Builder.json`.

Responsibilities:
- generate sales page copy from approved product manifest, approved assets, approved promises, and package contents;
- never use unapproved value-enhancer claims;
- generate static files or a PR-ready website package;
- create a `sales-page` asset record;
- create a `sales-page` approval.

### Content Reactor Integration
Treat `fennington-content-reactor` as a separate system/repo that consumes approved product records.

Content Reactor should not ingest raw ABK output directly. It should ingest:
- approved product manifest;
- approved sales URL;
- approved claims;
- approved source content;
- product package metadata;
- brand rules.

## Firebase Backend Changes
Convert hardcoded chore tracker functionality into generic digital-product infrastructure.

### New or generalized endpoints
- `POST /api/digital-products/register-draft` admin-only or signed n8n webhook secret protected.
- `POST /api/digital-products/:slug/create-stripe-product` admin-only; creates Stripe Product and one-time Price.
- `POST /api/digital-products/:slug/create-checkout-session` public; creates Stripe Checkout session for active product.
- `GET /api/digital-products/:slug/purchase-status?session_id=...` public but generic and privacy-safe.
- `POST /api/digital-products/:slug/recover-access` public; generic response regardless of purchase existence.
- `GET /api/digital-products/download?token=...&file=...` public token-gated download.
- `POST /api/stripe/webhook` generic; one reusable endpoint for all digital products.

### Webhook behavior
- Verify Stripe signature.
- Handle `checkout.session.completed`.
- Read `product_slug` and `product_id` metadata.
- Retrieve line items.
- Verify the purchased Stripe price matches the active `digitalProducts/{productId}.stripePriceId`.
- Use `stripeEvents/{eventId}` transaction for idempotency.
- Create or update `digitalPurchases/{sessionId}`.
- Create hashed download token.
- Send generic product access email via Resend when configured.
- Avoid duplicate emails/tokens for webhook retries.

### Fulfillment storage
Choose one primary storage mode during implementation:
- preferred: Firebase Storage private objects with signed/token-gated function downloads;
- acceptable interim: Cloud Functions private asset folder for small files, but this is less scalable for repeated products.

Do not put paid assets under Firebase Hosting public files.

## Stripe Automation Rules
- Use one persistent Stripe webhook endpoint for all products.
- New product automation creates a Stripe Product and Price only after `PACKAGE_READY` and sales-page draft exists.
- Stripe metadata must include `product_slug`, `product_id`, `package_version`, and `environment`.
- Never create live Stripe prices unless the product has `stripe-live` approval.
- Store Stripe IDs in `digitalProducts`.
- Checkout must refuse products that are not `LIVE`, `LAUNCH_READY`, or explicitly enabled for test checkout.

## Website Rules
Generated sales pages must:
- use only approved product name, price, package contents, and claims;
- list the exact included files/assets;
- distinguish included bonuses from proposed upsells;
- include support email and refund/access language;
- avoid fake testimonials, fake scarcity, fabricated statistics, and unsupported app features;
- include a clear checkout CTA bound to the generic product slug;
- have no live checkout until Stripe and fulfillment are ready.

For the current product, do not sell the unusable generated chore-tracker PDFs. The paid item is the `ebook-asset` product with approved supporting resources.

## Approval Gates
Required approvals:
1. `promise-list`: approve customer-facing deliverables/claims from the paid ebook.
2. `proposal-feasibility`: evaluate value-enhancer recommendations for feasibility, cost, limits, and recurring obligations; all remain not included by default.
3. `asset-generation`: approve which feasible proposals or missing promised resources should be created and included.
4. `asset-quality`: approve generated supporting assets.
5. `sales-page`: approve generated sales page copy/files.
6. `stripe-live`: approve creating/enabling live Stripe pricing if not test-only.
7. `launch`: approve publishing/deployment/live checkout.
8. `content-marketing`: approve Content Reactor activation.

The permanent `FD-POS - Supervisor` workflow runs after extraction. It reads the product's stored `supervisorPolicy`, may automatically mark low-cost static proposals feasible or reject disallowed live/ongoing services, and sends threshold exceptions to human review. A supervisor feasibility decision never changes `inclusionStatus` from `NOT_INCLUDED`; promotion into the paid package requires a separate inclusion/asset-generation approval.

Approval interface can start in Google Sheets and later become a Firebase admin page. Firestore remains the source of truth.

## Quality Gates
Before `PACKAGE_READY`:
- every approved included deliverable has an approved asset;
- every unsupported claim is removed, rewritten, or moved to upsell;
- primary ebook exists and is readable;
- package manifest exists;
- no paid files are in public hosting.

Before `SALES_PAGE_APPROVAL_REQUIRED`:
- sales page references only approved claims/assets;
- price matches manifest;
- no blocked terms/claims appear;
- app is optional unless product is app-specific.

Before `LAUNCH_READY`:
- Stripe product/price exists;
- webhook endpoint is configured;
- fulfillment package exists;
- access email is configured or manual fulfillment fallback is documented;
- test checkout path succeeds;
- duplicate webhook test is idempotent.

Before `CONTENT_MARKETING_ACTIVE`:
- product is live or explicitly marketing-ready;
- source material is approved;
- Content Reactor dry-run is enabled by default;
- approval is required by default.

## Current Product Recovery Plan
For `Backyard Livestock Planner 1`:
1. Register a new `digitalProducts` draft for `backyard-livestock-planner` with price `$17`.
2. Attach the current `ebook-asset` as the primary paid asset.
3. Attach `value-enhancer` as a source for promise extraction, not as an automatically included product.
4. Run Promise Review against the ebook and proposal extraction against the value enhancer.
5. Run `FD-POS - Supervisor` using stored cost, labor, recurring-cost, service, app, research, and auto-inclusion settings.
6. Review only proposal exceptions, then explicitly promote selected feasible proposals for inclusion.
7. Generate only approved included supporting resources using the PERC-style pillar/fix/resource method.
8. Package ebook plus approved resources.
9. Generate a sales page from the approved package.
10. Create Stripe Product/Price from the manifest after package readiness.
11. Enable test checkout and fulfillment.
12. Launch only after approvals and validation pass.
13. Hand approved product record to Content Reactor.

## Content Reactor Plan Boundary
The provided Content Reactor prompt should become a separate implementation plan/repo after FD-POS product registry and approved-product handoff are defined.

Required adjustment to that prompt before implementation:
- Replace hardcoded initial products with `products` loaded from FD-POS where possible.
- Keep initial Fennington examples, but ensure source data comes from approved product records.
- Content Reactor must not market draft/unapproved product output.
- Content Reactor must log generated ideas/content against `productId` and use approved claims only.

## Security
- Do not put API keys in workflow JSON, repo files, logs, or webhook responses.
- Use n8n credentials for OpenAI, Anthropic, ConvertAPI, Cloudinary, Google Sheets, Blotato, and Firebase/API auth.
- Use Firebase secrets for Stripe, Resend, and any backend-only credentials.
- Use a shared secret or signed service token for n8n-to-Firebase registration endpoints.
- Firestore rules keep product operations collections admin-only unless a public read model is deliberately added later.

## Failure Modes
- ABK generates unsupported claims: Promise Review flags and blocks them.
- Value enhancer proposes bonuses not included in product: classify as `proposed` or `upsell`, not included.
- Asset generation fails: asset becomes `MISSING` or task `FAILED`; product cannot reach `PACKAGE_READY` unless promise is rejected/rewritten.
- Stripe creation succeeds but Firestore write fails: Manager creates reconciliation task; checkout stays disabled until product record is complete.
- Webhook retries: `stripeEvents` idempotency prevents duplicate fulfillment.
- Email not configured: purchase is recorded, token is created, status indicates `pending_config`; manual resend/recovery path remains available.
- Content Reactor tries to use draft product: Manager blocks activation.

## Validation Plan
Implementation agent should validate in this order:
1. Firestore rules compile.
2. Functions build with `npm --prefix functions run build`.
3. Generic product registration endpoint rejects unauthenticated requests.
4. Product draft can be registered in emulator/test environment.
5. Promise Review creates `productPromises` and `productApprovals` without generating assets.
6. Approved Asset Builder generates only approved assets.
7. Package Builder refuses missing approved assets.
8. Generic checkout session uses product-specific Stripe price from Firestore, not hardcoded env names.
9. Stripe webhook validates signature and rejects wrong price/product combinations.
10. Duplicate webhook delivery has no duplicate purchase/email/token side effects.
11. Tokenized downloads serve only package-approved private files.
12. Sales page does not show live checkout before product is enabled.
13. Content Reactor dry-run consumes approved product metadata only.

## Implementation Order
- [x] 1. Create schemas/config docs for product manifest, statuses, approvals, promise classifications, and quality gates.
- [x] 2. Add/genericize Firebase backend data model and endpoints.
- [x] 3. Replace hardcoded chore-tracker constants and routes with generic digital-product logic.
- [x] 4. Add admin/service authentication for n8n-to-Firebase calls.
- [ ] 5. Add product package storage strategy. Backend path validation exists; real Google Drive/Firebase Storage connector remains pending.
- [ ] 6. Upgrade ABK copy into a versioned workflow that outputs a product manifest.
- [x] 7. Build Promise Review workflow, including separate proposal-feasibility evaluation.
- [x] 8. Build initial XLSX approval/feasibility interface. A future Firebase admin page remains optional.
- [ ] 9. Build Approved Asset Builder workflow. Foundation and API gates exist; storage connector and one-asset end-to-end test remain pending.
- [ ] 10. Build Package Builder workflow.
- [ ] 11. Build Website Builder workflow.
- [ ] 12. Build Manager AI workflow. The policy-based Supervisor sub-workflow exists; full lifecycle orchestration remains pending.
- [ ] 13. Run the current Backyard Livestock Planner through the new process. Paused at value-enhancer feasibility review.
- [ ] 14. Only after this system works, implement Content Reactor as a separate repo/workflow system consuming approved FD-POS product records.

## Out Of Scope For First Implementation
- Full custom Firebase admin dashboard, unless Google Sheets approvals prove insufficient.
- Automatic live deployment to Firebase Hosting.
- Automatic creation of a new Stripe webhook per product.
- Direct social network APIs.
- Automatically granting Livestock Tracker subscription access; this needs a separate app subscription entitlement design.
- Fully automated Skool/module hosting. The first version can generate module text/assets and mark hosting steps as manual.

## Open Questions For Implementation Agent To Confirm At Build Time
- Whether private fulfillment files should use Firebase Storage immediately or a transitional private function folder.
- Whether approval UI should start in Google Sheets or be built into the existing admin site.
- Exact file format of `ebook-asset` and `value-enhancer` on disk if they are folders, DOCX files, HTML files, or Cloudinary/ConvertAPI links.
- Whether the current product should be named `Backyard Livestock Planner`, `Backyard Chicken Command Center`, or another final customer-facing title.
- Final refund policy language.

## Definition Of Done
- A product can be registered from ABK output using a manifest.
- Manager AI can identify and create the next required task.
- Promises from ebook/value-enhancer are extracted and held for approval.
- Supporting assets are generated only after approval.
- Product package includes only approved assets.
- Website copy is generated only from approved claims/package contents.
- Stripe Product/Price creation is generic and repeatable.
- One generic webhook fulfills all digital products by product metadata.
- Current Backyard Livestock Planner can be moved through the lifecycle in test mode.
- Content Reactor handoff is defined and blocked until product is approved/live.
