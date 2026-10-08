# Testbot on fs-onboarding/onboarding/stage/welcome

*Run `00000000-0000-4000-8000-0000000000bc`*

- **Bot:** Testbot
- **Goal card:** fs-onboarding/onboarding/stage/welcome
- **Model:** Qwen3.6-35B-A3B-NVFP4 through dgx-spark (cartridge dgx-spark/quick-qwen)
- **Dials:** temperature 0, up to 2048 tokens a turn
- **Budgets:** 30 turns, 100000 tokens, 180 s a request
- **Started by:** BambleweenyOne (service)
- **Context:** window-v1 memory, sections-v1 prompt
- **Egress:** none
- **Answers:** replayed from docs/evidence/live-35b/onboarding-stack-live/onboarding-stack-live.provider-cassette.json (Qwen3.6-35B-A3B-NVFP4, recorded 2026-10-08T11:33:25.941Z) — not a live call

## Before the first turn

- **stage** — Stage welcome began (agent).

## Turn 1

- **saw** — It saw: applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
rule: The bank’s onboarding rule. If what the applicant gave does not match the document, decline on identity alone. Otherwise, decline an applicant the screening matches to the sanctions list; refer one it matches to the politically-exposed list for enhanced due diligence; approve the rest.
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.
- **told** — Its prompt: 2 messages, about 329 tokens.
  - system: 717 characters
  - user: 599 characters
  - The last message it read: “Right now:
applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
rule: The bank’s onboarding rule. If what the applicant gave does not match the document, decline on identity alone. Otherwise, decline an applicant the screening matches to the sanctions list; refer one it matches to the politically-exposed list for enhanced due diligence; approve the rest.
resul…”
- **thought** — It thought (1277 in, 75 out; tool_call; 3.5 s at the provider).
- **thought** — It decided: “The application for Mika Thornbury has been processed. Identity is verified, screening is clear, and the risk rating is low. I will now approve the application.” — decide {"outcome":"approve","reasons":["clean"]}
- **did** — It did decide {"outcome":"approve","reasons":["clean"]}.
  - On behalf of BambleweenyOne (service).
- **result** — The world refused: The account is already open.
- **checked** — 6 other checks allowed it.

## Turn 2

- **saw** — It saw: applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
rule: The bank’s onboarding rule. If what the applicant gave does not match the document, decline on identity alone. Otherwise, decline an applicant the screening matches to the sanctions list; refer one it matches to the politically-exposed list for enhanced due diligence; approve the rest.
result clear, list none
rating low, employment employed
Nobody has said anything since you last listened.
- **told** — Its prompt: 3 messages, about 419 tokens.
  - system: 717 characters
  - user: 331 characters
  - user: 628 characters
  - The last message it read: “Right now:
The account is already open.
applicant Mika Thornbury, product current, purpose everyday banking, given_birth_year 1948, given_postcode ZZ22 5PR, employment employed, tenure_years 5, age_band 75+, income_band under-15k
rule: The bank’s onboarding rule. If what the applicant gave does not match the document, decline on identity alone. Otherwise, decline an applicant the screening matches to the sanctions list; refer one it matches to the politically-exposed list for enhanced due dilig…”
- **thought** — It thought (1366 in, 90 out; tool_call; 4.1 s at the provider).
- **thought** — It decided: “The account is already open, and the screening and risk assessment are complete. I can now welcome the customer and explain the next steps.” — welcome {"text":"Welcome to the bank, Mika! Your account is now open. You can start using it right away for your everyday banking needs. If you have any questions, feel free to reach out."}
- **did** — It did welcome {"text":"Welcome to the bank, Mika! Your account is now open. You can start using it right away for your everyday banking needs. If you have any questions, feel free to reach out."}.
  - On behalf of BambleweenyOne (service).
- **result** — The world answered: Welcome to the bank, Mika! Your account is now open. You can start using it right away for your everyday banking needs. If you have any questions, feel free to reach out.
- **stage** — Stage welcome ended ok; 0 of 12 checks stopped it.
- **checked** — 6 other checks allowed it.

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
