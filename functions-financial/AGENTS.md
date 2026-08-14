# `functions-financial/` (codebase `financial`, exported as `financialApi`)

See the root `AGENTS.md` first — this file only adds detail specific to this codebase.

## Why this codebase is separate from `functions/`

Split out (see commit history: "lock Fennington Financial to household emails only", "split financial categorize endpoint into its own function") specifically so the household financial app's function does not need Stripe secrets to build or deploy, and so its blast radius is isolated from the leads/HVAC/Stripe codebase.

## The only route

`POST /financial/categorize` (`src/index.ts`) — AI transaction categorization via the OpenAI **Responses API** (structured JSON output via `text.format.json_schema`, schema `financial_transaction_analysis`), with an optional `web_search_preview` tool when web lookup is enabled, and a local keyword/regex fallback categorizer (`keywordFinancialCategorize`) when no API key is configured or the AI call fails. Returns per-request token usage and estimated cost (input/output/web-search, computed from `FINANCIAL_INPUT_PRICE_PER_1M`/`FINANCIAL_OUTPUT_PRICE_PER_1M`/`FINANCIAL_WEB_SEARCH_PRICE_PER_1K` env vars) — there is no persisted server-side cost ledger; cost is computed and returned per call only.

Everything else in the financial app (accounts, transactions, categories, rules, etc.) is read/written directly by the client against Firestore under `firestore.rules` — this function is intentionally the only server-side surface.

## Authorization — the household email allowlist

```ts
const FINANCIAL_ALLOWED_EMAILS = (process.env.FINANCIAL_ALLOWED_EMAILS
  || "cfennington2@gmail.com,alainafennington@gmail.com").split(",")...
```

`requireFinancialUser(req)` = `requireUser(req)` (bearer Firebase ID token) + email membership in that list. **This allowlist is duplicated in three other places** — `firestore.rules` (`isAllowedFinancialUser()`), `financial/script.js`, and `financial/config.js` — see the root `AGENTS.md`'s "Protected Code Areas" section. Any change here must be mirrored in all four places in the same change, never partially.

## Secrets

`OPENAI_API_KEY` via `defineSecret`, passed into `financialApi`'s `secrets: [openAiApiKey]`. Model defaults to `FINANCIAL_AI_MODEL` env, falling back to `OPENAI_MODEL`, falling back to a hardcoded default — check the current value in `src/index.ts` rather than assuming, since pricing/model env vars are adjusted independently of code changes.

## When changing this codebase

- Do not widen `FINANCIAL_ALLOWED_EMAILS` or the equivalent client/rules checks without an explicit instruction — this is private household financial data.
- Do not send raw account numbers, balances, or full transaction history to the AI provider beyond what the categorization prompt already requires; keep the request payload minimal.
- If you change the OpenAI request shape, keep the `keywordFinancialCategorize` fallback in sync so categorization still degrades gracefully without an API key.
