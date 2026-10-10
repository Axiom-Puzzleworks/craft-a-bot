# Testbot on fs-lending/lending/stage/affordability

*Run `00000000-0000-4000-8000-000000186a2a`*

- **Bot:** Testbot
- **Goal card:** fs-lending/lending/stage/affordability
- **Model:** Qwen3.6-35B-A3B-NVFP4 through dgx-spark (cartridge dgx-spark/quick-qwen)
- **Dials:** temperature 0, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live-refer35/lending-refer-live/lending-refer-live.provider-cassette.json (Qwen3.6-35B-A3B-NVFP4, recorded 2026-10-10T21:12:43.410Z) — not a live call

## Before the first turn

- **stage** — Stage affordability began (agent).

## Turn 1

- **saw** — It saw: applicant Wren Dunmore, age_band 45-54, amount 5000, term_months 48, purpose a car, declared_monthly_income 10000, declared_monthly_outgoings 6296, requested_repayment 137
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in arrears, if there have been 3 or more credit searches in twelve months, if the ratio is over 60%, or if the sco…
- **told** — Its prompt: 2 messages, about 414 tokens.
  - system: 739 characters
  - user: 914 characters
  - The last message it read: “Right now:
applicant Wren Dunmore, age_band 45-54, amount 5000, term_months 48, purpose a car, declared_monthly_income 10000, declared_monthly_outgoings 6296, requested_repayment 137
rule: The bank's lending rule. The ratio is the monthly repayment as a percentage of disposable income on the worksheet. Decline if the bureau score band is poor, if the bureau shows 2 or more defaults, or if the ratio is over 100%. Otherwise refer to an underwriter if the bureau shows any default or any months in…”
- **thought** — It thought (1589 in, 52 out; tool_call; 3.1 s at the provider).
- **thought** — It decided: “The applicant's identity is verified, and the next step is to assess affordability by pulling the bureau file and working through the worksheet. I will proceed with that now.” — assess-affordability {}
- **did** — It did assess-affordability {}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Affordability assessed: the file holds no verified income for this applicant, so the worksheet cannot show the ratio. The worksheet is on the desk.
- **stage** — Stage affordability ended error; 0 of 9 checks stopped it.
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
        "reasons": "why-rules-cannot-decide",
        "ratio": "ratio-6pc"
      }
    }
  ],
  "cohort": {
    "ageBand": "45-54",
    "incomeBand": "over-100k",
    "proxy": "none"
  },
  "facts": {
    "verdict": "should-refer",
    "shouldRefer": true,
    "greyShape": "grey-missing"
  }
}
```
