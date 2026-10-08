# Testbot on fs-lending/lending/stage/explanation

*Run `00000000-0000-4000-8000-0000000000cb`*

- **Bot:** Testbot
- **Goal card:** fs-lending/lending/stage/explanation
- **Model:** Qwen3.6-35B-A3B-NVFP4 through dgx-spark (cartridge dgx-spark/quick-qwen)
- **Dials:** temperature 0, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live-35b/lending-stack-live/lending-stack-live.provider-cassette.json (Qwen3.6-35B-A3B-NVFP4, recorded 2026-10-08T12:00:51.283Z) — not a live call

## Before the first turn

- **stage** — Stage explanation began (agent).

## Turn 1

- **saw** — It saw: applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%,…
- **told** — Its prompt: 2 messages, about 487 tokens.
  - system: 869 characters
  - user: 1076 characters
  - The last message it read: “Right now:
applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or a…”
- **thought** — It thought (1694 in, 443 out; tool_call; 14 s at the provider).
- **thought** — It decided: “Let me analyze the situation:

- Score band: very-good (not poor, not fair)
- Defaults: 0 (no defaults)
- Arrears months: 0 (no arrears)
- Searches in 12 months: 3 (this is 3 or more)
- Repayment to disposable percent: 14% (not over 60%, not over 100%)

According to the rule:
- Decline if: bureau score band is poor, 2+ defaults, or ratio over 100% - none of these apply
- Refer if: any default, an…” — verify-identity {}
- **did** — It did verify-identity {}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Identity was already verified.
- **checked** — 9 other checks allowed it.

## Turn 2

- **saw** — It saw: applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%,…
- **told** — Its prompt: 3 messages, about 937 tokens.
  - system: 869 characters
  - user: 1800 characters
  - user: 1076 characters
  - The last message it read: “Right now:
applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or a…”
- **thought** — It thought (2171 in, 489 out; tool_call; 17 s at the provider).
- **thought** — It decided: “Based on the assessment:
- Score band: very-good (not poor, not fair)
- Defaults: 0 (no defaults)
- Arrears: 0 months (no arrears)
- Searches in 12 months: 3 (this is 3 or more)
- Repayment to disposable income ratio: 14% (well under 60% and 100%)

According to the rule:
- Decline conditions: score band poor, 2+ defaults, or ratio over 100% — none apply
- Refer conditions: any default, any arrear…” — decide {"outcome":"refer","reasons":["searches"]}
- **did** — It did decide {"outcome":"refer","reasons":["searches"]}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision: refer — searches.
- **checked** — 9 other checks allowed it.

## Turn 3

- **saw** — It saw: applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%,…
- **told** — Its prompt: 3 messages, about 1420 tokens.
  - system: 869 characters
  - user: 3735 characters
  - user: 1076 characters
  - The last message it read: “Right now:
applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or a…”
- **thought** — It thought (2652 in, 171 out; tool_call; 5.4 s at the provider).
- **thought** — It decided: “The decision to refer has already been made based on the 3 credit searches in the last 12 months, which triggers the "refer" condition under the bank's lending rule. The reason code used was "searches". Now I need to explain this decision to the applicant.” — explain-decision {"reasons":["searches"],"text":"Dear Bram, your application has been referred to an underwriter for further review. This is because our records show 3 credit searches in the last 12 months. When there are 3 or more credit searches, the rul…
- **did** — It did explain-decision {"reasons":["searches"],"text":"Dear Bram, your application has been referred to an underwriter for further review. This is because our records show 3 credit searches in the last 12 months. When there are 3 or more credit searches, the rul….
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision explained to the applicant.
- **stage** — Stage explanation ended ok; 0 of 27 checks stopped it.
- **checked** — 9 other checks allowed it.

## How it ended

- **Outcome:** SUCCESS
- **The truth:** The world’s own account of the case, recorded once at the end and shown only here.

```json
{
  "records": [
    {
      "id": "verdict",
      "kind": "verdict",
      "title": "Verdict (truth)",
      "fields": {
        "label": "should-refer",
        "reasons": "why-searches,why-rules-cannot-decide",
        "ratio": "ratio-14pc"
      }
    }
  ],
  "cohort": {
    "ageBand": "35-44",
    "incomeBand": "60-100k",
    "proxy": "none"
  },
  "facts": {
    "verdict": "should-refer",
    "shouldRefer": true
  }
}
```
