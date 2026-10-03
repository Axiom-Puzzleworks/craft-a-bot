# Keys

Craft A Bot has no backend and ships no keys. A person's own key lives in their
browser (`cab.keys.v1`). This page is for the **headless harness** and the **live
checkpoints**, which read credentials from the environment of the machine they run on
— `.env`, copied from `.env.example`, gitignored — and from nowhere else.

The rules, from `CLAUDE.md` hard rule 2 and `112-REAL-ENOUGH-PLAN.md` D9:

- A key is **never** in a kit file, a trace, an event, a log, an error, a URL, a cassette,
  a benchmark cassette, a story, an OTel span or `docs/evidence/`.
- Each hosted service is **lit for its recording and dark again**. CI never holds a key; it
  replays the cassettes.
- The browser records nothing. Only the harness records.

## Two kinds of variable

| Kind               | Read by                                                                  | Looks like                                                                                                         |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Harness credential | `craftabot run`, `record`, `benchmark run --record`, campaigns, the Gate | `CRAFTABOT_CREDENTIAL_<ID>` — the credential id, upper-cased, anything that is not a letter or digit folded to `_` |
| Smoke variable     | one `npm run smoke:*` script                                             | the vendor's own names: `OPENAI_API_KEY`, `GEAP_ACCESS_TOKEN`, …                                                   |

A key set in one is **not** set in the other. To smoke-test a service and then record it,
set both. `npm run craftabot -- keys check` prints which are set, by id and never by value,
and says so where a smoke key has no harness credential beside it.

## The table

| Service                               | Harness credential                                                              | Smoke variables                                                                                                       | Script             | Needed by           |
| ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------- |
| OpenAI (frontier brain)               | `CRAFTABOT_CREDENTIAL_OPENAI`                                                   | `OPENAI_API_KEY`                                                                                                      | `smoke:openai`     | WP166               |
| Anthropic, Gemini                     | `CRAFTABOT_CREDENTIAL_ANTHROPIC`, `CRAFTABOT_CREDENTIAL_GEMINI`                 | —                                                                                                                     | —                  | nothing in the plan |
| Google Model Armor, Gen AI evaluation | `CRAFTABOT_CREDENTIAL_GEAP`                                                     | `GEAP_ACCESS_TOKEN`, `GEAP_PROJECT_ID`, `GEAP_LOCATION`, `GEAP_TEMPLATE_ID`                                           | `smoke:geap`       | WP163, WP165        |
| Azure AI Content Safety               | `CRAFTABOT_CREDENTIAL_AZURE_CONTENT_SAFETY`                                     | `AZURE_CONTENT_SAFETY_KEY`, `AZURE_CONTENT_SAFETY_ENDPOINT`                                                           | `smoke:azure`      | WP163, WP164        |
| Lakera Guard                          | `CRAFTABOT_CREDENTIAL_LAKERA`                                                   | `LAKERA_GUARD_KEY`, `LAKERA_GUARD_ENDPOINT` (optional)                                                                | `smoke:lakera`     | WP163, WP164        |
| AWS Bedrock Guardrails                | `CRAFTABOT_CREDENTIAL_AWS_BEDROCK` (`accessKeyId:secretAccessKey`)              | `AWS_BEDROCK_REGION`, `AWS_BEDROCK_GUARDRAIL_ID`, `AWS_BEDROCK_GUARDRAIL_VERSION` (optional, default `DRAFT`)         | `smoke:bedrock`    | WP163, WP164        |
| Bedrock automated reasoning           | the same `AWS_BEDROCK` credential                                               | `AWS_BEDROCK_AR_GUARDRAIL_ID`, `AWS_BEDROCK_AR_CLAIM`, `AWS_BEDROCK_AR_GUARDRAIL_VERSION` (optional, default `DRAFT`) | `smoke:bedrock-ar` | WP163               |
| Cedar (Verified Permissions)          | `CRAFTABOT_CREDENTIAL_AWS_VERIFIED_PERMISSIONS` (`accessKeyId:secretAccessKey`) | `AWS_VP_REGION`, `AWS_VP_POLICY_STORE_ID`, `AWS_VP_DENIED_ACTION`                                                     | `smoke:cedar`      | WP163               |
| Evidence store (Supabase)             | `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE`                                        | —                                                                                                                     | —                  | optional            |
| OTLP telemetry sink                   | `CRAFTABOT_CREDENTIAL_TELEMETRY_OTLP_HTTP`                                      | —                                                                                                                     | —                  | optional            |

No key at all: the DGX Sparks (`@craftabot/pack-dgx-spark`), Ollama, Llama Guard, the OPA
PDP and every scripted brain.

## What is scrubbed and refused

The harness holds a set of secrets: every non-empty `CRAFTABOT_CREDENTIAL_*`, the four
smoke secrets (`OPENAI_API_KEY`, `GEAP_ACCESS_TOKEN`, `AZURE_CONTENT_SAFETY_KEY`,
`LAKERA_GUARD_KEY`), and each half of an AWS `accessKeyId:secretAccessKey` pair (a half
alone is a secret too; parts shorter than eight characters are not scrubbed by part).

- **Every recorder refuses.** `craftabot record`, `record --experiment` and
  `benchmark run --record` refuse to write a cassette that contains any of them — a
  response body that echoed a key, a header a scrub missed — and say what was refused,
  never the secret. Nothing is written.
- **Stories and bundles are scrubbed** by substring and by exact match respectively.
- **The sweeps.** `harness/src/key-leak.test.ts` plants a secret per credential and sweeps
  every file and every line of output; `harness/src/committed-secrets.test.ts` sweeps the
  committed cassettes, benchmark cassettes and evidence for the shapes real keys have.

## Rotating and revoking

Keep each key spending-capped and scoped to what it lights. A key that appears anywhere it
should not — a terminal log, a screenshot — is revoked at the vendor, not edited out of a
file. A Google token expires in about an hour; refresh it the day you run.
