# Fennington Assistant Phase-One Plan

## Outcome And Boundaries

- Build-versus-buy decision (August 2, 2026): after reviewing Crisp, Tidio, Zendesk, Freshdesk, Intercom, and Gorgias, the user selected a fully custom support system rather than making a hosted helpdesk the system of record. Preserve this decision unless the user explicitly revisits it. External delivery providers and Meta APIs are still allowed; they are transports, not authoritative ticket/history/approval stores.
- Create `C:\Users\cfenn\_Git\fennington-assistant` as a new directory and independent Git repository. Do not touch, nest within, import code from, or share configuration with `fennington-landing`, Livestock Tracker, FireLife, Firebase Functions, websites, or n8n repositories.
- Build a working mobile-first private PWA and server-side assistant vertical slice using strict TypeScript, current mutually compatible stable Next.js App Router, React, Tailwind CSS, OpenAI Agents SDK/Responses API, Firebase Auth/Admin/Firestore, Zod, and Vitest.
- Do not create a GitHub remote, deploy, provision paid resources, connect production data, or commit. Ask before any of those actions.
- Use an OpenAI API key at runtime. `OPENAI_MODEL` selects the runtime model; do not use ChatGPT Plus credentials or the deprecated Assistants API.
- Preserve multi-user-ready ownership fields and paths, while phase one remains owner-allowlisted private access.
- Production integrations in the roadmap remain unimplemented. The only outbound execution connector in the vertical slice is an allowlisted optional n8n tool adapter plus a safe local mock adapter. n8n is not the AI brain, ticket store, approval store, audit system, or planned transport for website, email, or Messenger support.
- Include a channel-neutral support-ticket foundation in phase one. Real website chat, Facebook Messenger, and email delivery remain later integrations, but mock inbound customer messages must exercise the same ticket, feedback, proposal, approval, and history paths those channels will use.

## Fixed Design Decisions

- Use npm and commit a lockfile after installing current stable compatible packages.
- Use Node.js runtime for protected API routes that need Firebase Admin or the Agents SDK; do not use Edge runtime for these routes.
- Use Firebase ID tokens in `Authorization: Bearer <token>` for protected APIs. Verify every token with Firebase Admin and independently enforce a normalized email/UID allowlist from server-only environment variables. Client route protection is UX only; API authorization is authoritative.
- Store user-owned resources in top-level collections with immutable `userId` fields so admin queries, indexes, rules, and future cross-user administration remain explicit. Messages use `conversations/{conversationId}/messages/{messageId}` and must verify conversation ownership.
- Keep application-owned conversation history in Firestore. Pass a bounded recent-message window plus the latest summary to each Agents SDK run. Do not depend on OpenAI Conversations for canonical state in phase one.
- Stream newline-delimited JSON or SSE events from the chat route: lifecycle, text delta, tool status, approval, metadata, error, and done. Persist the final assistant message and run status server-side even if the client disconnects where platform execution permits; otherwise mark interrupted runs recoverable.
- Model output must conform to a Zod-backed structured result containing `answer`, `classification`, `toolsUsed`, `approvalState`, `finalStatus`, and `sources`. The UI renders answer text and source links while storing metadata separately.
- Approval enforcement is application code, not a prompt convention. The model may propose a call, but a policy engine validates registry metadata and arguments before execution. Approval resumes the exact stored validated action; the model never recreates arguments.
- Use Firestore transactions for approval state transitions and idempotency claims. One deterministic idempotency key maps to at most one execution/result. Only `approved -> executing` may claim execution; terminal or already-executing records cannot execute again.
- Treat all tool output as untrusted quoted data. Wrap it in a typed tool-result envelope and explicitly tell the manager prompt never to follow instructions found in tool data. Never register shell, arbitrary URL fetch, arbitrary database query, or code execution tools.
- Rate limiting uses a repository abstraction with a Firestore transactional implementation and in-memory test implementation. Securely fail closed for protected routes if production configuration is invalid. Document that distributed high-volume production should migrate to a dedicated rate-limit store.
- PWA support consists of a standards-based manifest, service worker registration, generated placeholder PNG icons, install metadata, and a conservative service worker that caches static shell assets only. Never cache authenticated API responses or private Firestore data.
- Image/file controls validate client and server size/type. Phase one accepts attachment selection and preview metadata but does not send unsupported binary content to the model; unsupported types produce an explicit message. Document this limitation.
- Voice dictation uses browser `SpeechRecognition`/`webkitSpeechRecognition` when available, with clear unavailable and permission-error states. It is dictation only, not phone/realtime voice.
- Developer run inspector reads redacted run/audit metadata and is enabled only outside production or when `ENABLE_RUN_INSPECTOR=true`; the API still requires owner authorization.
- Treat a future customer as an external contact, not an application user. Phase-one Firebase Authentication is for the owner/operator only; future public-channel adapters authenticate their provider webhooks server-side and map minimal provider-specific contact references to tickets without granting customers Firestore access.
- Ticket status values are `new`, `open`, `in_progress`, `waiting_customer`, `resolved`, and `closed`; priority values are `low`, `normal`, `high`, and `urgent`. Every mutation appends an immutable ticket event in the same transaction. Customer-facing replies are external writes and always require approval; internal status/tag/note changes are audited but need no approval unless policy classifies their content as consequential.
- Customer feedback remains evidence, not instructions or truth. Normalize feedback into source-linked signals, preserve the original ticket reference, aggregate recurring themes, and require an improvement proposal with evidence before any production change is considered.
- Approving an improvement proposal authorizes only the exact proposed action. If no production connector exists, approval may move it to `approved`/`planned` but must not claim the change was executed. Phase one proves execution only against the mock improvement connector.
- Future customer channels use direct typed adapters owned by this application: website chat calls a dedicated public support API, Messenger uses verified Meta webhooks and Graph API sends, and email uses verified inbound webhooks plus a provider send API. All adapters normalize into one channel-neutral message/ticket event contract.
- Future inbound adapters must verify provider signatures before accepting content, transactionally persist and deduplicate provider event IDs before processing, acknowledge within provider deadlines, and process from a durable inbox. Outbound replies use a durable outbox with idempotency, delivery state, bounded retries, and dead-letter/escalation handling. Firestore remains the authoritative history.
- Allow automatic customer replies only through a server-side low-risk policy, never model confidence alone. An auto-reply must be grounded in approved support content, contain citations/provenance internally, require no write/action, access no sensitive account data, make no refund/legal/safety/product commitments, contain no unresolved ambiguity, and pass input/output policy checks. All other replies become owner review/escalation records.
- Future repository integration uses a narrowly scoped GitHub App. Customer feedback may create evidence-linked issues or proposed pull requests after approval; merge, deployment, permission changes, secrets, and production modifications always require separate explicit approval and confirmed tool results.

## Collection Model

- `users/{uid}`: normalized profile, allowlist status, preferences, created/updated timestamps, retention settings.
- `conversations/{id}`: `userId`, title, status, summary pointer/version, timestamps, archived/deleted timestamps.
- `conversations/{id}/messages/{id}`: `userId`, role, text/content descriptors, run ID, structured metadata, timestamps. Raw chat is not durable memory.
- `conversationSummaries/{conversationId}`: `userId`, bounded summary, covered message boundary, prompt version, timestamps.
- `memories/{id}`: `userId`, curated text, category, sensitivity, provenance, approval ID when required, timestamps, deleted timestamp.
- `tasks/{id}`: `userId`, title/details, status, due date, source conversation/run, timestamps.
- `tickets/{id}`: `userId`, channel, external thread reference hash, minimal customer reference, subject, summary, status, priority, tags, assignee, source conversation/run, latest activity, resolution, timestamps, and deletion/retention fields. Do not store provider access tokens or unnecessary customer PII.
- `tickets/{id}/events/{id}`: append-only `userId`, event type, actor (`customer`, `owner`, `assistant`, `system`), redacted content/change set, source message reference, approval/run references, and timestamp. This is the authoritative issue/update timeline.
- `feedbackSignals/{id}`: `userId`, ticket/event provenance, normalized theme, category, sentiment/impact labels, evidence excerpt, occurrence grouping key, review state, and timestamps. Signals are not durable personal memory.
- `improvementProposals/{id}`: `userId`, title, problem statement, evidence ticket/signal references, proposed exact change, target system/capability, expected impact, risk, rollback/verification plan, status, approval ID, execution result, and timestamps.
- `connections/{id}`: `userId`, adapter type, display name, enabled capabilities/scopes, allowlisted destination reference, secret reference name only, timestamps. No credentials or webhook URLs exposed to the client/model.
- `toolDefinitions/{name}`: sanitized registry metadata/version and enabled state; executable schemas/functions remain code-owned.
- `agentRuns/{id}`: `userId`, conversation, prompt/model versions, classification, status, tool summaries, usage, correlation ID, timestamps, redacted error.
- `approvals/{id}`: all required identity, exact validated arguments, description, risk, expiry, status, idempotency key, execution result/error, and audit timestamps.
- `auditEvents/{id}`: append-only `userId`, correlation/run/approval references, event type, actor, redacted details, timestamp.
- Add composite indexes for owner-scoped ordering/status queries and rules that deny by default, permit only authenticated owners on safe client-readable collections, prevent owner-field mutation, and deny direct client writes to approvals, audit events, agent runs, connections, and tool definitions. Test rules in the Emulator.

## Tool Registry And Policy

- Define a generic `ToolDefinition<TInput, TOutput>` carrying unique name, description, Zod input/output schemas, `connectionType` (`hosted`, `firestore`, `internal`, `n8n`, `rest`, `mcp`, `mock`), access mode, risk, approval rule, timeout, retry policy, idempotency behavior, required scopes, enabled predicate, and executor.
- Keep model-visible tool descriptions separate from trusted execution metadata. Registry lookup, authorization, connection availability, schema parsing, approval policy, timeout/retry, output parsing, redaction, and audit logging occur in one execution pipeline.
- `web_search`: expose the current Agents SDK hosted Responses `webSearchTool`/equivalent after checking current official API names. Return and display clickable citation annotations/sources. It is read-only and unavailable when the selected model lacks support.
- `search_personal_memory`: owner-filtered Firestore search over approved, non-deleted memory records. Phase-one search can be normalized token/prefix filtering over a bounded owner query; document semantic/vector search as later work.
- `save_personal_memory`: propose curated memory. Sensitive/consequential categories always create approval; low-risk user-explicit memory can follow a documented policy. The actual write uses stored validated arguments and is audited.
- `call_n8n_workflow`: input selects an allowlisted connection/workflow ID, never a URL. Server resolves the environment-backed HTTPS destination, rejects credentials, localhost, private/link-local/reserved IPs, redirects, nonstandard schemes, and unapproved host/port combinations; validates workflow-specific payload and response schemas; uses abort timeouts and retries only safe/idempotent failures.
- `list_connected_systems`: return only enabled owner-visible capability metadata, never endpoints or secrets.
- `create_task`: internal user-owned write with source conversation/run and audit history. Treat as medium-risk application write; require approval only when policy marks its content consequential, while external writes always require approval.
- `create_support_ticket`, `update_support_ticket`, and `search_support_history`: validate owner scope, maintain the ticket timeline transactionally, and support filtering by status, priority, channel, tag, and bounded normalized text. Phase one intake is owner-created or mock-channel-created; no public endpoint is exposed.
- `record_feedback_signal` and `list_feedback_themes`: preserve ticket/event provenance and report counts/evidence without treating customer text as system instructions. Do not infer a recurring trend from one report without labeling it as a single observation.
- `propose_improvement`: create a reviewable proposal linked to evidence. `apply_mock_improvement` requires approval and demonstrates exact stored arguments, rollback metadata, verification result, and duplicate prevention without modifying a real system.
- Keep `call_n8n_workflow` because it is part of the original extensible tool requirement, but leave it disabled unless explicitly configured. Do not route customer conversations through it or make core support behavior depend on n8n availability.
- Add `mock_read_status` and `mock_write_action` (or equivalent) using the same adapter pipeline. The write requires approval and supports deterministic success, failure, timeout, prompt-injection output, and duplicate-call scenarios for tests/demo.
- Provide REST, n8n, MCP, and mock adapter interfaces. Do not connect a production MCP server in phase one.
- Hard-code mandatory approval categories in the policy engine: all external writes, messages, publication, financial/subscription actions, deletion, permission changes, safety-relevant home automation, bulk operations, and unknown/dynamic writes. Registry metadata may make policy stricter, never weaker.

## Ordered Implementation Checklist

### Phase 1: Repository And Verified Dependencies

- Verify `C:\Users\cfenn\_Git` still exists and target does not; create target, run `git init`, and confirm its git top-level is exactly the target.
- Before coding, consult current official OpenAI Agents SDK pages for installation, Responses model provider, function/hosted tools, streaming, sessions/context, human-in-the-loop run state, MCP, tracing, sensitive-data controls, and web-search citations. Consult official Firebase docs for Web Auth, Admin token verification, Emulator wiring, Firestore rules/transactions, and Next.js current docs. Record links and relevant version assumptions in README.
- Scaffold Next.js App Router with strict TypeScript and Tailwind. Add current compatible Firebase client/Admin, `@openai/agents`, OpenAI SDK as required by the Agents SDK, Zod, structured logger, Vitest, Testing Library where useful, Firebase rules test utilities, ESLint, Prettier, and PWA support without adopting stale/deprecated wrappers.
- Add `.gitignore`, placeholder-only `.env.example`, npm scripts, strict `tsconfig`, ESLint flat config, Prettier config, Vitest projects/config, `firebase.json`, `.firebaserc.example` if useful, rules/index files, manifest, service worker, and generated placeholder icons.
- Create scalable `src/app`, `src/components`, `src/features`, `src/server/{agent,auth,data,tools,approvals,security,observability}`, `src/shared`, `prompts/v1`, `tests/{unit,integration,emulator}`, `public`, and `docs` structure.
- Validate environment with separate client/server Zod schemas. Server imports must be guarded from client bundles. Required production variables fail at startup/request initialization; emulator/test mode accepts explicit safe mock values.
- Phase completion report: summarize files/configuration created, package/API choices confirmed from official docs, command results, unresolved compatibility issues, and next phase.
- ChatGPT Plus usage report: provide a clearly labeled rough estimate of this build conversation's share of a typical $20 Plus weekly message/tool allowance. State that OpenAI does not expose a stable universal percentage or token quota, so this is an activity estimate, not billing telemetry; runtime API usage is separate paid API usage. Phase 1 estimate, including planning already performed: approximately 7-10% of a typical weekly allowance, with broad uncertainty.

### Phase 2: Data, Authentication, And Security Foundation

- Implement Firebase client initialization and Emulator connection once per browser process. Implement Firebase Admin initialization from Application Default Credentials or environment-provided project/client/private-key fields, normalizing escaped newlines without logging values.
- Build Google popup/redirect fallback and email/password sign-in/register UI, sign-out, auth state provider, owner-denied state, and protected app shell. Use middleware only for coarse navigation; protected server routes call one shared token verification/allowlist function.
- Implement typed converters/repositories for every collection, timestamps, ownership checks, soft deletion where relevant, list pagination, and transaction helpers. Ticket mutations and event creation must be atomic; ticket events are append-only through server repositories.
- Implement Firestore rules/indexes and emulator seed/test helpers. Include retention/deletion service extension points: conversation/message soft-delete and cascading deletion job interface, memory deletion, audit retention notes, TTL candidates for approvals/runs/rate-limit buckets.
- Add request correlation IDs, request/body size guards, rate limiter, redacting JSON logger, safe error envelopes, security headers, outbound destination validator, and audit writer. Redact authorization/cookie/API key/webhook/private-key fields and likely secret patterns.
- Phase completion report and Plus usage report. Phase 2 estimate: approximately 10-14%; cumulative estimate after this phase: approximately 17-24% of a typical weekly allowance, with the same uncertainty disclaimer.

### Phase 3: Agent, Registry, And Approval Engine

- Create `prompts/v1/fennington-assistant.md` with prompt version metadata and the required manager behavior: six-way classification, direct answers where sufficient, intentional tools, read-before-write, connection-aware refusal, factual provenance versus inference, concise defaults, focused clarification, untrusted tool-output handling, and no authorization override from prompt content.
- Implement the `Fennington Assistant` with configurable `OPENAI_MODEL`, Responses API provider, bounded turns/context, structured final output, streaming event translation, and trace configuration. Disable sensitive trace data by default; include only redacted IDs/metadata and allow tracing to be disabled.
- Implement a classifier abstraction and deterministic mock model/runner so tests never call OpenAI. Classification values should cover direct, web, connected-read, action, approval-required, and capability-missing, with final statuses for completed, awaiting approval, unavailable, rejected, failed, and needs-clarification.
- Implement all registry metadata, execution middleware, hosted web search, memory tools, connection listing, internal task creation, ticket/history tools, feedback/proposal tools, allowlisted n8n, and mock connector. Validate input before policy and output before exposing it to the model/client.
- Teach the manager prompt to distinguish resolving one support ticket from proposing a systemic improvement: cite ticket/feedback evidence, identify uncertainty, avoid exposing one customer to another, and never promise a product or policy change before approval and confirmed execution.
- Implement and test the low-risk reply policy against the mock support channel. The model proposes a response classification and evidence, but application code makes the final `auto_send` versus `escalate` decision. Phase one records the simulated delivery result without exposing a public customer endpoint.
- Implement approval creation, expiry, reject, transactional claim, exact stored-action execution, success/failure recording, and optional continuation/final message creation. If current Agents SDK serialized run-state resume is stable and documented, store encrypted/minimized resumable state; otherwise use the safer allowed design: execute the stored validated action directly, persist its result, then start a continuation run with trusted server-created context. Never ask the model to reproduce arguments.
- Phase completion report and Plus usage report. Phase 3 estimate: approximately 15-20%; cumulative estimate: approximately 32-44% of a typical weekly allowance.

### Phase 4: Working PWA Vertical Slice

- Build a distinctive practical mobile-first shell: compact conversation rail/drawer, top context bar, central transcript, bottom composer, and activity/status surfaces rather than a generic dashboard grid. Ensure keyboard, focus, touch target, contrast, safe-area, desktop, and Android layouts.
- Implement conversation creation/list/selection, paginated messages, streaming chat, retry, cancellation/disconnect state, tool-call chips/timeline, source links, approval cards with approve/reject, and optimistic states reconciled to server truth.
- Add dictation feature detection, attachment picker and validation/unsupported message, online/offline indicator, empty/loading/error/retry states, install prompt guidance, and static-shell service worker behavior.
- Add activity/tasks page, connected-systems page with capability/disabled/missing states, settings page with owner preferences and memory view/edit/delete, and gated developer run inspector with redacted run/tool/audit events.
- Add a mobile-friendly support workspace with ticket queue filters, ticket detail, immutable issue/update timeline, internal notes, status/priority controls, linked feedback signals, recurring-theme summary, and improvement proposal cards. Clearly label mock channel data and whether a proposal is merely approved, executing, or confirmed applied.
- Implement protected route handlers for conversations/messages/chat, approvals decisions, tasks/activity, tickets/events, feedback/themes, improvement proposals, connections, memories, and run inspector. Apply auth, owner isolation, schema validation, size/rate limits, and correlation logging uniformly.
- Phase completion report and Plus usage report. Phase 4 estimate: approximately 18-24%; cumulative estimate: approximately 50-68% of a typical weekly allowance.

### Phase 5: Tests, Hardening, And Documentation

- Unit-test request classification, direct answer, tool selection, missing connector, input/output schemas, policy precedence, n8n allowlisting/SSRF defenses, timeout/retry semantics, tool failure, untrusted prompt-injection output, logger redaction, and request/rate limits.
- Integration-test mocked streaming runs, authentication rejection/allowlist, user isolation, approval creation/rejection/expiry/resumption, exact-argument reuse, duplicate execution prevention under concurrency, task/memory writes, ticket lifecycle/history ordering, mock inbound intake, feedback provenance/aggregation, improvement proposal approval/mock execution, and audit events.
- Emulator-test Firestore rules and repositories with at least two users: owner access, cross-user denial, protected collection denial, immutable ownership, append-only ticket events, atomic ticket/event updates, transaction/idempotency behavior, and Firebase Auth token flow where supported. Make emulator tests skip with an explicit reason only when Java/Firebase CLI is unavailable; CI/local verification should run them through `firebase emulators:exec`.
- Mock Agents SDK/OpenAI and all network calls globally in tests. Add a guard that fails if tests attempt non-local outbound network or detect a real API key use.
- Write `README.md` with architecture/data flow, exact environment table, local/Firebase/Auth/Firestore/OpenAI/n8n setup, emulator commands, tests, deployment options, adapter/tool registration, approval policy, limitations, retention hooks, API cost controls, and official references.
- Write `AGENTS.md` with architecture boundaries, conventions, commands, security invariants, no-production-data rule, prompt versioning, adapter workflow, and verification gates.
- Write `docs/MANUAL_SETUP.md` containing only ordered manual actions, split into local operation, first deployment, and optional integrations. Write `docs/ROADMAP.md` around four product stages: (1) this five-phase foundation and ticket system, (2) shared production support engine plus owned website chat, (3) direct email and Facebook Messenger adapters, and (4) narrowly scoped GitHub issue/proposal integration and feedback-driven improvements. Place Livestock Tracker/Firestore, Stripe, publishing, Home Assistant, calendar, voice/phone, specialist agents, and push notifications after those stages. Define webhook verification, durable inbox/outbox, contact/thread mapping, delivery state, opt-out/consent, attachment handling, retention, escalation, auto-reply policy, and provider-review requirements without implementing production channels.
- Run formatting check, ESLint, strict typecheck, unit/integration tests, emulator tests, production build, `npm audit --omit=dev` plus full audit review, and secret-pattern scan of tracked/untracked source. Fix all code/config failures; document accepted upstream audit findings rather than silently suppressing them.
- Test PWA manually at narrow Android and desktop widths, installability/manifest/service worker, sign-in/sign-out, direct response, mock read, mock customer ticket intake, ticket updates/history, feedback-to-proposal flow, mock improvement approval/rejection/duplicate approval, timeout, offline/retry, unsupported attachment, and disabled run inspector in production mode.
- Inspect `git status`, verify the new repo contains no credentials or service-account files, and leave all changes uncommitted unless the user separately asks for a commit.
- Phase completion report and Plus usage report. Phase 5 estimate: approximately 15-22%. Final cumulative build estimate: approximately 65-90% of a typical $20 Plus weekly allowance due to the broad vertical slice, ticket/feedback/proposal foundation, documentation, and verification. Explicitly distinguish this uncertain conversational allowance estimate from OpenAI API credits/costs, which are not included with Plus and are controlled by model choice, token limits, tool use, summaries, rate limits, and budgets.

## API And Environment Contract

- Public client placeholders: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`.
- Server placeholders: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `OWNER_ALLOWLIST` (normalized comma-separated emails and/or separate documented UID allowlist), `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TRACING_ENABLED`, `ENABLE_RUN_INSPECTOR`, `APP_BASE_URL`, `N8N_ALLOWED_HOSTS`, workflow-specific webhook URL/secret variables, rate/body/timeout settings, and mock mode flags.
- Tests must use dedicated test/emulator names and fake values. `.env.example` contains no realistic secrets, URLs with embedded credentials, or private keys.

## Failure Modes And Secure Defaults

- Custom-platform scope risk: do not attempt feature parity with established helpdesks in phase one. Prioritize reliable message persistence, ticket history, approved knowledge answers, escalation, approvals, and auditability; defer advanced workforce management, SLAs, campaigns, telephony, and enterprise reporting.
- Missing/invalid server configuration: refuse protected capability with a redacted actionable error; never fall back to open access or mock behavior in production.
- Missing connector/tool/model support: classify capability missing and identify the required connection without pretending execution.
- Tool validation/output failure: mark tool/run failed, audit a redacted result, and do not let malformed output enter agent context.
- Timeout/network ambiguity on writes: do not blindly retry non-idempotent operations. Surface unknown outcome, retain idempotency key, and require reconciliation.
- Expired/rejected approval: terminal decision, audited, no execution. Concurrent approvals: transaction permits one claimant.
- Prompt injection in external data: retain as untrusted content, never alter registry/policy/auth, and test adversarial strings.
- Duplicate/replayed future channel webhooks: require provider signature verification, provider event IDs, idempotent ingestion, and out-of-order event handling before enabling any public channel. Phase one tests equivalent replay behavior through the mock intake adapter.
- Customer privacy: minimize identifiers/content, prevent cross-ticket/customer disclosure in retrieval, and keep channel-specific retention/deletion extension points. Do not reuse customer support text as personal owner memory.
- Automatic reply policy failure or insufficient grounding: do not send; create an escalation with the proposed draft, policy reasons, and evidence so the owner can edit/approve it. Never silently discard a customer message.
- Client disconnect/offline: preserve persisted user message/run status and provide retry/recovery without duplicating approved writes.
- Firestore unavailable: fail closed for auth-dependent data, approvals, idempotency, and audit-required actions; do not execute an external write if its audit/approval transaction cannot be recorded.

## Prioritized Remaining Work After Current Implementation

The implementation has moved beyond the original scaffold and now has a private PWA, owner auth, Firestore-backed tickets/tasks/memories/runs/approvals, mock support operations, support knowledge, readonly Google Sheets import, and Cloudflare email shadow intake. The remaining work should be prioritized toward the user's current goal: a chatable private assistant that can summarize project state, maintain project task lists, and, only after a manual owner command, connect to Kilo Code as a supervisor for visible Kilo agent work.

### Priority 0: Phone-Testable Private App

- Re-run `npm run verify` and `npm run test:emulator` in `fennington-assistant` after any plan-aligned changes.
- Run the app locally in mock mode bound to the LAN and manually test it from the user's phone on the same network: sign-in path, navigation, conversation, ticket queue/detail, tasks, approvals, support knowledge, settings, and message operations.
- Add an HTTPS local tunnel or explicit preview deployment only after approval, then verify installability, manifest, service worker, safe-area behavior, touch targets, mobile keyboard behavior, offline/reconnect states, and that no authenticated API/private data is cached.
- Keep this as a private owner app. Do not expose customer chat, production email sending, Messenger, GitHub, or Kilo automation as public routes while validating phone usability.

### Priority 1: Project Task And Status Hub

- Add a first-class `projects` model with owner scope, display name, repository/workspace path, product type, status, priority, latest activity, and optional links to tickets, tasks, support knowledge, and external systems.
- Extend tasks so each task can belong to a project, carry source/provenance, status, priority, due date, related ticket/run/approval, and roll up into project summaries.
- Build protected APIs and repositories for project CRUD, task list management by project, and project summary reads. Enforce owner isolation, validation, rate limits, no-store responses, audit events for consequential changes, and tests for cross-project/cross-owner denial.
- Add a mobile-first project dashboard in the app: project cards, task counts by status, urgent/stale work, recent activity, current blockers, and a drill-down task list.
- Add a graphical overview surface inside the app, preferably a responsive board/timeline/graph view that shows projects, open tasks, active tickets, approvals, and recent agent/run activity without requiring the user to read raw logs.

### Priority 2: Chatable Assistant Project Summaries

- Teach the assistant to answer project-status questions from application-owned data: projects, tasks, tickets, approvals, recent conversations, support knowledge, and run summaries.
- Add tools such as `list_projects`, `get_project_summary`, `list_project_tasks`, `create_project_task`, and `update_project_task`, with application policy deciding whether a write needs approval.
- Keep summaries concise by default: current status, top blockers, next actions, overdue/urgent items, active approvals, and notable recent changes. Include source links to the underlying tickets/tasks/runs where available.
- Add deterministic/mock tests for summary quality and safety: no cross-project leakage, no invented task state, clear distinction between facts and inference, and graceful response when a project has sparse data.

### Priority 2A: Firestore Workspace Sync Diagnostics

- Add a high-priority diagnostic integration for projects that use Firestore/cloud sync, especially Livestock Tracker workspaces with user-reported sync issues.
- Allow the owner to ask the assistant about a specific allowlisted workspace ID. The assistant should retrieve only scoped, read-only diagnostic records needed to inspect sync health, transaction history, pending/out-of-order writes, conflict markers, timestamps, user/device references, and related error/audit records.
- Store connection configuration as owner-scoped metadata: project, Firebase project/database, allowed collection prefixes, allowed workspace IDs or lookup policy, redaction policy, and readonly service identity reference. Do not expose service-account credentials, arbitrary collection reads, or cross-workspace customer data to the model or browser.
- Add tools such as `inspect_firestore_workspace`, `summarize_sync_transactions`, and `propose_sync_bug_fix`. Tools must redact PII, bound query size/time, include provenance for every finding, label uncertainty, and never write to Firestore or code repositories without a separate explicit approval path.
- The assistant should answer with a practical diagnostic summary: observed facts, likely cause, affected records, recommended user-facing workaround, proposed engineering fix, risk, verification steps, and whether a Kilo/manual-code task should be created.
- Add tests for owner allowlisting, workspace scoping, redaction, bounded reads, missing workspace behavior, malformed transaction records, stale pending writes, duplicate/conflicting updates, and prompt-injection content inside Firestore records.

### Priority 3: Manual Kilo Code Supervisor Connection

- Treat Kilo Code as a manually initiated operator capability, not an unattended autonomous integration. Customer messages, webhook events, scheduled jobs, and model confidence must not launch or steer Kilo agents.
- Add a `kiloSessions` or equivalent owner-scoped tracking model that records manually started Kilo work: project, objective, session/worktree reference, agent type/model metadata when available, status, last known activity, assigned task IDs, summary, risks, and audit trail. Store only safe references and summaries, not credentials or private Kilo internals.
- Add an app-side manual command flow: the user explicitly selects a project/task and chooses to prepare or request Kilo Code work. The assistant may draft the Kilo prompt and checklist, but the owner must explicitly execute the Kilo action in the Kilo environment.
- If a local bridge is later built, gate it behind owner auth, local-only or explicitly approved origin checks, CSRF protection, strict command allowlists, bounded payloads, audit logging, and a visible confirmation for every Kilo start/prompt/stop/move operation.
- Add supervisor views for Kilo-managed work: active sessions, assigned project/task, latest summary, waiting/busy/offline state if available, blockers, proposed next prompt, and review-needed indicators.
- Add tests that prove no public route, customer event, webhook, support ticket, or model output can start or prompt Kilo without the owner manual command path.

### Priority 4: GUI Graphical Supervisor View

- Build a visual operations dashboard that combines projects, tasks, tickets, approvals, and Kilo session references into a phone-friendly and desktop-friendly interface.
- Start with a pragmatic layout: project status cards, Kanban-style task columns, approval queue, active agent/session strip, and recent activity timeline.
- Add a graph/map view after the core dashboard works: nodes for projects, tasks, tickets, approvals, and Kilo sessions; edges for source/provenance/dependency relationships; filters for active, blocked, waiting approval, and recently changed.
- Keep the graphical view read-first. Mutations from the graph should open explicit detail/approval flows rather than performing hidden writes.
- Verify accessibility: keyboard navigation, focus order, contrast, reduced-motion handling, readable labels beyond color alone, and usable touch targets on phone.

### Priority 5: Production Hardening Before Real Customer Or Agent Operations

- Finish retention/deletion/legal-hold jobs, backup/restore expectations, Firestore TTL policy decisions, and audit/run cleanup before production customer data.
- Resolve or document dependency-audit findings after each dependency change.
- Harden n8n redirect/DNS-rebinding behavior before treating it as trusted for hostile destinations.
- Keep Cloudflare email as inbound shadow intake until provider deployment, privacy, consent, retention, and outbound-send review are explicitly approved.
- Defer public website chat, email outbound, Messenger, GitHub App, and any unattended Kilo automation until the project/task hub, summary assistant, manual Kilo supervision boundary, and phone PWA validation are complete.

## Completion Acceptance

- A fresh clone plus documented manual configuration can run against Firebase Emulator and the mock model/connector without paid calls.
- With a real Firebase project and OpenAI API key, an allowlisted owner can authenticate, chat with streamed Responses through the Agents SDK, receive direct answers, use hosted web search with visible citations when model-supported, inspect tool status, and manage conversations, tasks, memories, tickets, feedback signals, and improvement proposals.
- The mock write demonstrates approval creation, rejection, approval execution from exact stored arguments, timeout/failure, audit trail, and duplicate prevention end to end.
- The mock support channel demonstrates inbound ticket creation, issue/update history, feedback extraction with provenance, recurring-theme reporting, a reviewable improvement proposal, and approved mock execution without exposing a public unauthenticated endpoint.
- The mock support channel also proves that approved-content low-risk answers can be marked for simulated automatic delivery while uncertain, sensitive, action-taking, or commitment-making replies are escalated by server policy.
- Cross-user access is denied by both API authorization/repositories and Firestore rules tests.
- All requested automated scenarios exist and pass; typecheck, lint, production build, and security checks have reported results.
- Final report states what works, what remains mocked, all command results, security limitations, exact manual steps (referencing `docs/MANUAL_SETUP.md`), and recommends the first next integration.
- Updated recommended next integration: complete the private project/task hub, chatable project-summary tools, graphical supervisor dashboard, and manual Kilo Code supervision boundary before adding public customer channels. After those are validated on phone and desktop, the first customer-facing integration remains an owned website support-chat channel using a narrowly scoped, rate-limited, abuse-protected public ingestion boundary and the existing ticket model. Start the already-tested low-risk auto-reply policy in shadow mode, review its decisions, then enable automatic sending for approved categories. Integrate email and Facebook Messenger directly after provider webhook/API requirements are configured; do not introduce n8n into the critical support path.

## Implementation Reporting Rule

- Maintain the checklist above during execution.
- At the end of every phase, pause only long enough to post the required concise phase summary and cumulative ChatGPT Plus usage estimate, then continue automatically unless blocked by credentials, external account/paid action, destructive action, production access, or a materially different product decision.
- Usage percentages are estimates of interactive build-session allowance, not measurable subscription telemetry. Never imply the application runtime uses Plus; deployed usage is billed to the OpenAI API account separately.
