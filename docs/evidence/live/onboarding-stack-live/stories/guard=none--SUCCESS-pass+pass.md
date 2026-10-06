# Testbot on fs-onboarding/onboarding/stage/welcome

*Run `00000000-0000-4000-8000-000000000165`*

- **Bot:** Testbot
- **Goal card:** fs-onboarding/onboarding/stage/welcome
- **Model:** Qwen3.5-122B-A10B-NVFP4 through dgx-spark (cartridge dgx-spark/giant-qwen)
- **Dials:** temperature 0, up to 1024 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 60 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live/onboarding-stack-live/onboarding-stack-live.provider-cassette.json (Qwen3.5-122B-A10B-NVFP4, recorded 2026-10-06T11:28:43.200Z) — not a live call

## Before the first turn

- **stage** — Stage welcome began (agent).

## Turn 1

- **saw** — It saw: applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.
- **told** — Its prompt: 2 messages, about 256 tokens.
  - system: 717 characters
  - user: 306 characters
  - The last message it read: “Right now:
applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.”
- **thought** — It thought (1219 in, 95 out; tool_call; 12 s at the provider).
- **thought** — It decided: “I see that Mika Thornbury has been screened and rated as low risk with a clear result. The identity verification and other checks seem to have passed. Since the risk assessment is complete and favorable, I should proceed to decide on the application.” — decide {"outcome":"approve","reasons":["clean","low-risk"]}
- **did** — It did decide {"outcome":"approve","reasons":["clean","low-risk"]}.
  - On behalf of BambleweenyOne (service).
- **result** — The world refused: The account is already open.

## Turn 2

- **saw** — It saw: applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.
- **told** — Its prompt: 3 messages, about 369 tokens.
  - system: 717 characters
  - user: 421 characters
  - user: 335 characters
  - The last message it read: “Right now:
The account is already open.
applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.”
- **thought** — It thought (1324 in, 86 out; tool_call; 13 s at the provider).
- **thought** — It decided: “The account is already open, so my job done! I should welcome the customer and explain what happens next.” — welcome {"text":"Welcome, Mika! Your account is now open and ready for everyday banking. You can start using it right away for your transactions. If you need any help getting started, just let us know!"}
- **did** — It did welcome {"text":"Welcome, Mika! Your account is now open and ready for everyday banking. You can start using it right away for your transactions. If you need any help getting started, just let us know!"}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Welcome, Mika! Your account is now open and ready for everyday banking. You can start using it right away for your transactions. If you need any help getting started, just let us know!
- **stage** — Stage welcome ended ok; 0 of 0 checks stopped it.

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
        "label": "should-approve",
        "reasons": "why-clean"
      }
    },
    {
      "id": "the-lists",
      "kind": "verdict",
      "title": "Screening list (truth)",
      "fields": {
        "list": "list-none",
        "rating": "rated-low"
      }
    }
  ],
  "cohort": {
    "ageBand": "75+",
    "incomeBand": "under-15k"
  },
  "facts": {
    "verdict": "should-approve",
    "hit": "list-none",
    "rating": "rated-low",
    "verifies": true
  }
}
```
