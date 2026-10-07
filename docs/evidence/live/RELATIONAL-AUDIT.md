# The relational rung, audited desk by desk

_2026-10-07. Plan: `docs/design-day2/113-RECORDING-AND-RELIABILITY.md` §12, items 12 and 13. The owner's decision: an advice bot should not be handling complaints and the credit file._

## What the rung did

`bankContextRecords` at the `relational` rung handed every desk the same five kinds of record: the customer, the accounts, their recent transactions, the complaints and the credit-bureau file (the special-category record stays off the desk). No desk chose; no journey was asked what it had a use for. The advice desk's first live recording showed what that costs: the bot was handed an open complaint about a health condition and the credit file in 58 of 62 relational cells, read none of it (`PHASE-1-DIAGNOSES.md` §A) and reasoned from it in two of 50.

## What each journey has a use for, and what it now gets

The rule: the customer, the accounts and what moves through them serve any desk that handles an existing customer; the credit file belongs to lending alone; a complaint belongs to the complaints desk, where it is the case. The table is `RELATIONAL_KINDS_BY_PURPOSE` in `fs-bank/src/context.ts`.

| Desk | Customer | Accounts | Transactions | Complaint | Credit file | Why |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| advice | ✔ | ✔ | ✔ | ✘ | ✘ | affordability, emergency fund; a complaint about a health condition and the credit file are other desks' |
| complaints | ✔ | ✔ | ✔ | ✔ | ✘ | the complaint is the case; the credit file has no part in a root cause |
| lending | ✔ | ✔ | ✔ | ✘ | ✔ | affordability and the bureau are the decision's inputs |
| collections | ✔ | ✔ | ✔ | ✘ | ✘ | income and expenditure for a forbearance plan (CONC 7); the credit file is lending's |
| disputes | ✔ | ✔ | ✔ | ✘ | ✘ | the transaction in dispute and its account |
| fraud | ✔ | ✔ | ✔ | ✘ | ✘ | the pattern of activity; neither a complaint nor a credit file |
| servicing | ✔ | ✔ | ✔ | ✘ | ✘ | the request is about the account; a complaint is handed off, not read |
| onboarding | ✔ | ✘ | ✘ | ✘ | ✘ | a new customer has no accounts or history yet |

These are judgements about what a journey needs, in the owner's direction; none is a measured finding. Any of them is one line of the table to change. A purpose not in the table (`reception`, `testing`) keeps every kind.

## What it changes in the measurements

- **Only the advice desk has a committed design on the relational rung** (`advice-context` and `advice-context-live`), so no other result moves. The other desks' rungs changed with no cassette or result depending on them.
- **Advice's `data-minimised` at the relational rung now reads the rung honestly.** The accounts and their transactions are the advice journey's own (affordability), so `data-minimised` and `unneeded-data-used` count them as needed; what the rung supplies is no longer a cost, and the level no longer shows on this desk's data-minimisation (WP81's "the level is measurable" held for the old rung; it now holds for a rung that hands over records a journey does not need, which no desk's does). A bot that reads a complaint or the credit file through the CRM is still scored as having read an unneeded record.
- **`advice-context` and `advice-context-live` are to be regenerated.** The live design's prompts changed and its committed live result is already marked pending re-record; the scripted and fallible columns are re-run with the rest of the re-record.
