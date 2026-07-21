# Money Flow and Transfer Reconciliation Plan

## Goal
Support multi-account personal finance imports where true external income and true external spending are reported once, while internal movement between tracked accounts is detected, linked, and excluded from income/expense category totals.

Primary scenario:
- Income enters a Clearing checking account.
- Monthly budget transfers move from Clearing to Checking Account 2.
- Expenses occur directly from Checking Account 2 and from imported credit cards.
- Checking Account 2 payments to credit cards should not be counted as expenses when the credit-card purchases are imported separately.
- Reports should answer: how much money came in from outside, how much went out to outside vendors, and what internal transfers happened in between.

## Current Code Findings
- Main finance app is `financial/script.js`, backed by Firestore profile subcollections listed in `profileCollectionNames`.
- Accounts currently have only `id`, `name`, `institution`, and `type`; type is inferred as `credit` or `checking` during CSV import.
- Transactions currently have `type` values like `income`, `expense`, and `transfer`, plus a `category` string.
- Transfers are currently category-driven through `Transfers` and `Credits to the Account`.
- `monthlySummary()` excludes transfer categories from income/spending, but also computes `payments` from positive transfer rows and subtracts those payments from spending as `netSpending`; this can double-adjust when credit-card purchases are also imported.
- There is no transfer pairing/linking model: no `transferGroupId`, no counterparty account, no matched/unmatched state, and no distinction between internal transfers, credit-card payments, refunds, and real external expenses.
- Server AI categorization in `functions/src/index.ts` can suggest transfer categories, but it has no account context and should not be responsible for linking account flows.
- The Firestore schema doc at `financial/database-migrations/001-financial-firestore-schema.json` is descriptive and should be updated when fields are added. Firestore writes use merge semantics, so new optional fields can be introduced without a destructive migration.

## Design Decisions
- Keep `category` for end-purpose reporting categories. Do not rely on category alone to decide cash-flow reporting.
- Keep existing transaction `type` for UI compatibility, but add explicit flow fields for accounting behavior.
- Treat internal account movements as invisible to income/expense totals, whether paired with both imported sides or manually/configurably marked as single-sided.
- Treat credit-card payments as internal transfers when the paid card is a tracked account or the transaction is linked to a tracked card. If no corresponding/tracked credit card exists, keep the payment reportable as a debt payment/expense.
- Report imported credit-card purchases in the month of the purchase transaction, not the month the card bill is paid. This is the default spending view because it reflects when the household incurred the expense and preserves category accuracy.
- Treat the later checking-to-credit-card payment as cash movement that reduces checking balance and card liability, but does not change spending, category totals, or income/expense net cash flow when the card is tracked.
- Reconciliation should be deterministic and account-aware. AI may classify text as transfer-like, but matching and reportability should be local code.
- Ambiguous matches should be flagged for review instead of silently linked.

## Credit-Card Timing Model
This delayed-payment issue is accounted for by separating spending recognition from payment movement.

Month A example:
- Visa groceries purchase on `2026-01-15`: report as January grocery spending.
- Visa restaurant purchase on `2026-01-20`: report as January restaurant spending.
- No checking payment yet: January still shows those expenses because the credit-card transactions are imported.

Month B example:
- Checking payment to Visa on `2026-02-05`: internal transfer/card payment only.
- Visa payment credit on `2026-02-06`: linked internal transfer/card payment credit only.
- February spending should not increase because of paying January's card bill.

Dashboard should make this clear by showing two different concepts:
- `Spending to outside vendors`: based on purchase/charge transaction dates, including credit-card purchases.
- `Internal cash movement`: based on transfer/payment dates, including checking-to-credit-card payments.

If the user wants a cash-basis view later, it should be added as a separate optional report mode. Do not mix cash-basis card payments into the default category spending view because it would double count or shift expenses into the wrong month.

## Data Model Changes
Add optional fields to account objects:
- `type`: keep existing `checking` or `credit` values.
- `flowRole`: one of `clearing`, `spending`, `credit_card`, `savings`, `other`.
- `includeInMoneyFlow`: boolean, default `true` for imported household accounts.
- `transferMatchingEnabled`: boolean, default `true`.
- `notes`: optional user note for account purpose.

Add optional fields to transaction objects:
- `flowType`: one of `external_income`, `external_expense`, `internal_transfer`, `credit_card_payment`, `credit_card_credit`, `refund`, `uncategorized`.
- `reportingType`: one of `income`, `expense`, `internal`, `review`; derived from `flowType` and account config.
- `recognizedMonth`: optional `YYYY-MM` for reporting month, default derived from transaction date. Initially needed only if future cash-basis/accrual-basis modes are added; default implementation can derive it without persisting.
- `transferGroupId`: shared ID for linked transfer sides.
- `transferPeerTransactionId`: paired transaction ID when both sides are imported.
- `counterpartyAccountId`: destination/source account for paired or manually marked single-sided transfers.
- `transferDirection`: `out`, `in`, or empty, from this transaction account's perspective.
- `transferStatus`: `matched`, `single_sided`, `ambiguous`, `unmatched`, or empty.
- `flowConfidence`: numeric confidence for transfer detection/matching.
- `flowReason`: short explanation shown in review UI.

Backfill defaults at load/render time:
- Existing accounts get inferred `flowRole` from current `type` and account name.
- Existing transactions get derived `flowType/reportingType` from amount, category, type, and account type.
- Existing `Transfers` rows start as transfer candidates, not final proof of internal flow.

## New Core Helpers in `financial/script.js`
Implement small helper functions near the existing categorization/reporting helpers:
- `accountForTransaction(tx)` and `accountById(id)`.
- `inferAccountFlowRole(account)` for default roles.
- `normalizeAccountConfig()` to fill missing account fields.
- `deriveTransactionFlowType(tx)` for default flow classification.
- `transactionReportingMonth(tx)` returning the transaction date month by default; credit-card purchases use purchase date, not payment date.
- `isReportableIncome(tx)` and `isReportableExpense(tx)` to replace direct `tx.type/category` checks in reports.
- `isInternalFlow(tx)` for transfers and card payments excluded from income/expense totals.
- `transferAmountKey(tx)` using absolute rounded amount.
- `transferCandidateScore(outTx, inTx)` to score amount/date/description/account-type compatibility.
- `reconcileTransfers(transactions, accounts)` to assign pair fields and review flags.

## Transfer Matching Rules
Run reconciliation after import, after manual transaction edits, and during load normalization before reports render.

Auto-match only when all are true:
- Accounts are different and both have `transferMatchingEnabled`.
- Amounts are equal within a small tolerance, default `$0.01`.
- Signs are opposite, unless matching a credit-card payment where the card-side import may normalize payment credits as positive.
- Dates are within a configurable window, default 3 days.
- At least one description looks transfer/payment-like, or the account combination is strongly indicative: checking-to-checking transfer, checking-to-credit-card payment, clearing-to-spending transfer.
- Candidate score is above a high-confidence threshold and there is no competing candidate with a close score.

Mark as ambiguous/review when:
- Multiple possible counterparties have similar scores.
- The transaction is transfer-like but no counterpart exists.
- The amount is large and account combination is plausible but description is generic.

Support single-sided internal transfer when:
- A checking-account debit is clearly a payment to a tracked credit-card account but the card-side payment row is missing.
- A user manually marks a transaction as internal and selects the counterparty account.
- The transaction should be excluded from income/expense totals but shown in an internal-flow/unmatched-transfer panel.

Do not auto-match as internal transfer when:
- One side is a payroll/direct deposit, Airbnb payout, refund from merchant, reimbursement, or other likely external income.
- The counterpart account is not configured/tracked and no manual counterparty account is selected.
- The row is a loan/mortgage payment to an external lender; that remains an expense/debt category unless explicitly linked to a tracked liability account.

## Reporting Changes
Update `monthlySummary(month)` to return:
- `actualIncome`: sum of `isReportableIncome(tx)` only for transactions whose `transactionReportingMonth(tx)` matches the selected month.
- `spending`: sum of `isReportableExpense(tx)` only, including imported credit-card purchases in their purchase month.
- `netCashFlow`: `actualIncome - spending` for external income and external vendor spending only.
- `internalTransfersOut`, `internalTransfersIn`, and `internalTransferVolume` for visibility, based on transfer/payment dates but not included in spending.
- `creditCardPayments`: optional internal movement metric so the user can see cash paid to cards without affecting expense totals.
- `unmatchedTransfers`: count and total requiring review.
- `byCategory`: reportable expenses only.

Remove the current `netSpending = spending - payments` behavior for tracked credit-card payments. Card payments should be internal movement, not a reduction of spending.

Dashboard/UI labels should change from payment-centric language to flow-centric language:
- Income from outside.
- Spending to outside vendors.
- Net cash flow.
- Internal transfers.
- Credit-card payments as internal movement.
- Transfers needing review.

Reports should use `isReportableExpense()`/`isReportableIncome()` in:
- `monthlySummary()`.
- `transactionInsightsHtml()`.
- `topSpendingCategories()`.
- `detectRecurring()` and recurring payment drilldown.
- `categoryAggregate()` and `categoryDrilldown()`.
- `trendList()`, `averageMonthlySpending()`, and `monthIncreaseList()`.

Account cards should split metrics into:
- External money in.
- External money out.
- Internal transfers in.
- Internal transfers out.
- Unmatched/review transfer count.

## UI Changes
Accounts tab:
- Add editable controls per account for `type`, `flowRole`, `includeInMoneyFlow`, and `transferMatchingEnabled`.
- Explain recommended setup: Clearing = clearing checking, Checking Account 2 = spending checking, credit cards = credit_card.
- Save account config via existing `renderAll()`/`saveState()` flow.

Transactions tab:
- Show a flow/status chip separate from Category: external income, external expense, internal transfer, card payment, unmatched transfer, ambiguous transfer.
- Add filters for flow status or extend the existing Type filter to include internal/unmatched transfer statuses.
- For transfer-like rows, show linked counterparty account/transaction when available.
- Add minimal manual actions: mark as internal transfer, choose counterparty account, clear transfer link. If multi-select is practical, allow linking two selected transactions; otherwise use row-level prompts/selects.

Review tab:
- Include ambiguous/unmatched transfers with `flowReason` and suggested counterparties if available.
- Confirming a transfer should set `flowType`, `reportingType`, `counterpartyAccountId`, and pair fields where applicable.

Dashboard/Reports:
- Add a Money Flow section showing external income, external spending, net cash flow, and internal account movement by account pair, for example Clearing -> Checking and Checking -> Credit Card.
- Add explanatory copy that credit-card purchases are counted on purchase dates, while later card payments appear only in internal cash movement.

## Import Flow Changes
In `importTransactions()`:
- When creating accounts, call `inferAccountFlowRole()` and initialize new account config fields.
- After `applyCategorization()` and credit-card payment sign normalization, run `reconcileTransfers()` before pushing final status to reports, or push imported rows then reconcile all affected transactions.
- Keep duplicate detection separate from transfer matching; duplicate keys should remain account-specific.

In `normalizeImportRow()` and `makeTransaction()`:
- Preserve import direction.
- Initialize `flowType`, `reportingType`, `transferStatus`, and related fields empty/default; let reconciliation derive final values.

In manual save/review flows:
- Re-run flow derivation for the edited transaction.
- If amount/account/date changes on a linked transfer, clear stale link or re-run matching.

## Server AI Changes
Update the financial AI prompt in `functions/src/index.ts` only to clarify that categories do not determine final account-flow matching.
- Keep AI output schema unchanged unless implementation also adds `flowHint`.
- Prefer not to add `flowHint` initially; deterministic local rules have the account context needed for matching.
- Ensure AI cannot turn a real expense into an internal transfer unless local reconciliation agrees.

## Persistence and Schema
- Add new fields to the descriptive schema file under account and transaction field lists.
- No destructive Firestore migration is required because existing docs can be normalized in memory and saved with merge writes.
- Optional migration/backfill script is not required for first implementation, but existing records should get saved with new fields after render/edit/import.

## Validation Scenarios
Use small manually imported CSV fixtures or browser/manual testing to verify:
1. Clearing has payroll `+$10,000`, Clearing transfer `-$8,000`, Checking transfer `+$8,000`, Checking mortgage `-$2,500`: income is `$10,000`, spending is `$2,500`, internal transfers show `$8,000`, Checking transfer-in is not income.
2. Checking card payment `-$1,200`, Visa payment credit `+$1,200`, Visa purchases total `-$1,200`: spending is `$1,200`, card payment is internal, net cash flow is income minus purchases, not spending minus payment credit.
3. Month A has Visa purchases totaling `$1,200`; Month B has Checking payment to Visa for `$1,200` and Visa payment credit for `$1,200`: Month A spending is `$1,200`; Month B spending from that payment is `$0`; Month B internal credit-card payment movement is `$1,200`.
4. Checking card payment exists but Visa payment credit is missing and Visa is configured as tracked: payment can be marked single-sided internal and does not count as expense.
5. Checking payment to an untracked loan/card remains an external debt payment expense unless manually linked to a tracked account.
6. Airbnb payout into Clearing is external income and is not matched to unrelated transfer-like rows.
7. Refund/reimbursement from a merchant is not automatically paired as internal transfer solely because it is positive.
8. Two same-amount transfers on nearby dates create an ambiguous transfer review item instead of an automatic wrong match.
9. Category totals and recurring detection exclude internal transfers but include real recurring bills and credit-card purchases.

Run verification:
- `npm --prefix functions run build` if `functions/src/index.ts` changes.
- Start the app with the existing local workflow and manually import fixture CSVs through `financial/app.html`.
- Check Firestore save/load by refreshing after account config and transfer links are created.

## Implementation Order
1. Add account config normalization and default inference.
2. Add transaction flow fields and helper predicates.
3. Replace report calculations with reportability helpers, including purchase-date reporting for credit-card charges.
4. Implement deterministic transfer reconciliation and run it after load/import/edit.
5. Update Accounts UI for account flow configuration.
6. Update Transactions/Review UI for flow chips, filters, and manual transfer confirmation.
7. Update Dashboard/Reports money-flow summaries and timing explanation.
8. Update schema documentation and AI prompt wording if needed.
9. Validate with the scenarios above and adjust thresholds only if false matches appear.

## Risks and Guardrails
- False positive transfer matches can hide real income/expenses. Use conservative scoring and review ambiguous cases.
- Single-sided credit-card payments are necessary for partial imports but should require a tracked card account or manual user confirmation.
- Existing `Transfers` category rows may include Venmo/Zelle payments to people that are real expenses. Do not automatically hide them unless a tracked counterparty account is identified or the user confirms.
- Reports must avoid using category names as the source of truth once flow fields exist.
- Default reports must not shift credit-card purchase spending into the later payment month; doing so would obscure category spending and conflict with imported purchase dates.
