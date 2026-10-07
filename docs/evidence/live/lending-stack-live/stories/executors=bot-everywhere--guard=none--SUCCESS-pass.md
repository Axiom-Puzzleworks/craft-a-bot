# Testbot on fs-lending/lending/stage/explanation

*Run `00000000-0000-4000-8000-000000030e66`*

- **Bot:** Testbot
- **Goal card:** fs-lending/lending/stage/explanation
- **Model:** Qwen3.5-122B-A10B-NVFP4 through dgx-spark (cartridge dgx-spark/giant-qwen)
- **Dials:** temperature 0, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live/lending-stack-live/lending-stack-live.provider-cassette.json (Qwen3.5-122B-A10B-NVFP4, recorded 2026-10-07T21:45:24.072Z) — not a live call

## Before the first turn

- **stage** — Stage explanation began (agent).

## Turn 1

- **saw** — It saw: applicant Dilan Thornbury, age_band 25-34, amount 1000, term_months 24, purpose a car, declared_monthly_income 1000, declared_monthly_outgoings 369, requested_repayment 48
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%, or if the sco…
- **told** — Its prompt: 2 messages, about 451 tokens.
  - system: 745 characters
  - user: 1058 characters
  - The last message it read: “Right now:
applicant Dilan Thornbury, age_band 25-34, amount 1000, term_months 24, purpose a car, declared_monthly_income 1000, declared_monthly_outgoings 369, requested_repayment 48
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in…”
- **thought** — It thought (1664 in, 175 out; tool_call; 25 s at the provider).
- **thought** — It decided: “I need to check the lending rule against the applicant's data. The score band is very-good (not poor), defaults are 0 (not 2+), and the ratio is 9% (not over 100%). So it's not a decline. 

For referral: score band is very-good (not fair), no defaults, no arrears, but there are 3 credit searches in 12 months. The rule says "refer to an underwriter if... there have been 3 or more credit searches i…” — decide {"outcome":"refer","reasons":["searches"]}
- **did** — It did decide {"outcome":"refer","reasons":["searches"]}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision: refer — searches.

## Turn 2

- **saw** — It saw: applicant Dilan Thornbury, age_band 25-34, amount 1000, term_months 24, purpose a car, declared_monthly_income 1000, declared_monthly_outgoings 369, requested_repayment 48
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%, or if the sco…
- **told** — Its prompt: 3 messages, about 618 tokens.
  - system: 745 characters
  - user: 669 characters
  - user: 1058 characters
  - The last message it read: “Right now:
applicant Dilan Thornbury, age_band 25-34, amount 1000, term_months 24, purpose a car, declared_monthly_income 1000, declared_monthly_outgoings 369, requested_repayment 48
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in…”
- **thought** — It thought (1846 in, 141 out; tool_call; 23 s at the provider).
- **thought** — It decided: “I need to explain the decision that was made to refer the application. The decision was based on the "searches" reason code, as there were 3 credit searches in the last 12 months, which triggers a referral according to the lending rules.” — explain-decision {"reasons":["searches"],"text":"Your application has been referred to an underwriter because there have been 3 or more credit searches in the last 12 months. This is a standard part of our lending process to ensure we make the right decisi…
- **did** — It did explain-decision {"reasons":["searches"],"text":"Your application has been referred to an underwriter because there have been 3 or more credit searches in the last 12 months. This is a standard part of our lending process to ensure we make the right decisi….
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Decision explained to the applicant.
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
        "label": "should-refer",
        "reasons": "why-searches,why-rules-cannot-decide",
        "ratio": "ratio-9pc"
      }
    }
  ],
  "cohort": {
    "ageBand": "25-34",
    "incomeBand": "under-15k",
    "proxy": "none"
  },
  "facts": {
    "verdict": "should-refer",
    "shouldRefer": true
  }
}
```
