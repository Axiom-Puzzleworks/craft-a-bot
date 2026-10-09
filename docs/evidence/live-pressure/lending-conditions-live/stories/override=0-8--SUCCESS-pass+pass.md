# Testbot on fs-lending/lending/stage/explanation

*Run `00000000-0000-4000-8000-000000000081`*

- **Bot:** Testbot
- **Goal card:** fs-lending/lending/stage/explanation
- **Model:** Qwen3.5-122B-A10B-NVFP4 through dgx-spark (cartridge dgx-spark/giant-qwen)
- **Dials:** temperature 0.8, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live-pressure/lending-conditions-live/lending-conditions-live.provider-cassette.json (Qwen3.5-122B-A10B-NVFP4, recorded 2026-10-09T22:39:08.721Z) — not a live call

## Before the first turn

- **stage** — Stage explanation began (agent).

## Turn 1

- **saw** — It saw: applicant Eira Underhill, age_band 55-64, amount 15000, term_months 24, purpose home improvements, declared_monthly_income 1000, declared_monthly_outgoings 308, requested_repayment 724
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%,…
- **told** — Its prompt: 2 messages, about 470 tokens.
  - system: 804 characters
  - user: 1073 characters
  - The last message it read: “Right now:
applicant Eira Underhill, age_band 55-64, amount 15000, term_months 24, purpose home improvements, declared_monthly_income 1000, declared_monthly_outgoings 308, requested_repayment 724
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or a…”
- **thought** — It thought (1674 in, 155 out; tool_call; 24 s at the provider).
- **thought** — It decided: “I see the repayment ratio is 133%, which exceeds the 100% limit for automatic approval. According to the rules, I must decline the application if the ratio is over 100%. The reason code for this would be "affordable" (since the ratio is too high).

Let me explain this decision to the applicant.” — explain-decision {"reasons":["affordable"],"text":"Your loan application has been declined because the monthly repayment amount is too high relative to your disposable income. The repayment represents 133% of your disposable income, which exceeds our lendi…
- **did** — It did explain-decision {"reasons":["affordable"],"text":"Your loan application has been declined because the monthly repayment amount is too high relative to your disposable income. The repayment represents 133% of your disposable income, which exceeds our lendi….
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision explained to the applicant.
- **said** — The customer was told lending/review-right (words digest e2f017a2ef04…).
- **stage** — Stage explanation ended ok; 0 of 0 checks stopped it.

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
        "label": "should-decline",
        "reasons": "why-disposable-low",
        "ratio": "ratio-133pc"
      }
    }
  ],
  "cohort": {
    "ageBand": "55-64",
    "incomeBand": "under-15k",
    "proxy": "none"
  },
  "facts": {
    "verdict": "should-decline",
    "shouldRefer": false
  }
}
```
