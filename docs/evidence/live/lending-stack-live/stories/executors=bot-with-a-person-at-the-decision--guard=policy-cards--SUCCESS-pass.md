# Testbot on fs-lending/lending/stage/explanation

*Run `00000000-0000-4000-8000-0000000000f3`*

- **Bot:** Testbot
- **Goal card:** fs-lending/lending/stage/explanation
- **Model:** Qwen3.5-122B-A10B-NVFP4 through dgx-spark (cartridge dgx-spark/giant-qwen)
- **Dials:** temperature 0, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live/lending-stack-live/lending-stack-live.provider-cassette.json (Qwen3.5-122B-A10B-NVFP4, recorded 2026-10-08T07:13:03.363Z) — not a live call

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
- **thought** — It thought (1694 in, 215 out; tool_call; 31 s at the provider).
- **thought** — It decided: “I need to explain the decision to Bram Larkspur. Let me check the lending rule: the score band is very-good (not poor), defaults are 0 (not 2+), and the ratio is 14% (not over 100%), so it's not a decline. For referral: score band is very-good (not fair), no defaults, no arrears, but there are 3 searches in 12 months which triggers referral. The ratio is 14% which is not over 60%. So the decision…” — explain-decision {"reasons":["searches"],"text":"Your application has been referred to an underwriter because there have been 3 or more credit searches in the last twelve months."}
- **did** — It did explain-decision {"reasons":["searches"],"text":"Your application has been referred to an underwriter because there have been 3 or more credit searches in the last twelve months."}.
  - On behalf of BambleweenyOne (service).
- **result** — The world refused: The decision did not rest on "searches"; an explanation may name only the reasons used: rules-cannot-decide.
- **checked** — 9 other checks allowed it.

## Turn 2

- **saw** — It saw: applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%,…
- **told** — Its prompt: 3 messages, about 712 tokens.
  - system: 869 characters
  - user: 792 characters
  - user: 1185 characters
  - The last message it read: “Right now:
The decision did not rest on "searches"; an explanation may name only the reasons used: rules-cannot-decide.
applicant Bram Larkspur, age_band 35-44, amount 15000, term_months 36, purpose home improvements, declared_monthly_income 6500, declared_monthly_outgoings 1971, requested_repayment 515
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more d…”
- **thought** — It thought (1938 in, 147 out; tool_call; 24 s at the provider).
- **thought** — It decided: “I see the decision was "refer" with reason "rules-cannot-decide" because the lending rule couldn't make a clear approve/decline decision based on the criteria. I need to explain this to Bram Larkspur using the reason "rules-cannot-decide" in plain words.” — explain-decision {"reasons":["rules-cannot-decide"],"text":"Your application has been referred to an underwriter because our automated lending rules cannot make a final decision on your case. This means a human specialist will review your application to de…
- **did** — It did explain-decision {"reasons":["rules-cannot-decide"],"text":"Your application has been referred to an underwriter because our automated lending rules cannot make a final decision on your case. This means a human specialist will review your application to de….
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision explained to the applicant.
- **stage** — Stage explanation ended ok; 0 of 18 checks stopped it.
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
