> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward. `14-BRICK-REFERENCE-DESIGNS.md` §4.1 resolves the cartridge-defaults debt (defaults are display-only in V1.0) and specifies the Brain brick target design.
> This file is a verbatim copy of `docs/design/06-LLM-PROVIDERS.md` carried into the standalone Day 2 set; only this banner has been added.

# 06 — LLM Providers, Cartridges & Keys

> How the LLM brick talks to real models: the provider abstraction, the OpenAI out-of-the-box pack, bring-your-own-key handling, and the LLM Multi-Pack expansion pattern.
> Prerequisite reading: `01-ARCHITECTURE.md`, `02-AGENT-MODEL.md`.

---

## 1. Product shape

- **In the box (V1): OpenAI.** One provider, a small curated set of **model cartridges**. First-run is deliberately simple: one battery slot, one cartridge family.
- **Everything else is an expansion.** Anthropic Claude, Google Gemini, Ollama/local, and others arrive later as the **LLM Multi-Pack** (matching the existing box art: cartridges with personalities — Storyteller, Explainer, Researcher, Planner, Coder, Creator). This is a *merchandising* decision; the code is multi-provider from day one.
- **Bring your own key.** No Craft A Bot accounts, no proxy, no metering. The user's key, the user's bill, plain-English explanation in the battery compartment.

## 2. Provider abstraction (`@craftabot/core`)

The engine consumes one interface; packs implement it:

```ts
export interface LLMProvider {
  id: string;                                  // "openai", "mock", later: "anthropic", ...
  name: string;
  keyRequirement: 'required' | 'none';         // ollama/mock: none
  validateKey(key: string): Promise<KeyCheck>; // cheap auth ping for the battery meter
  chat(req: ChatRequest, opts: { signal: AbortSignal; onToken?: (t: string) => void }): Promise<ChatResponse>;
}

export interface ChatRequest {
  model: string;                               // provider-native model id from the cartridge
  messages: ChatMessage[];                     // system/user/assistant/tool
  tools?: ToolSchema[];                        // JSON-schema tool definitions
  temperature: number;
  maxTokens: number;
}

export interface ChatResponse {
  text: string;                                 // assistant prose ("thought")
  toolCall?: { name: string; arguments: unknown } | null;  // at most one honoured (V1 rule)
  usage: { inputTokens: number; outputTokens: number };
  raw: unknown;                                 // exact wire response, for the trace
  finishReason: 'stop' | 'tool_call' | 'length' | 'filtered' | 'other';
}
```

Rules:

- **Normalisation happens in the pack.** Each provider pack translates wire formats to `ChatResponse`; the engine never sees provider-specific JSON (but the trace stores `raw`).
- **One tool call honoured per tick** (`02-AGENT-MODEL.md` §5). If a model returns several, the first is used and the trace notes the rest were ignored.
- **No SDKs** — raw `fetch` (`05-TECH-STACK.md` §9).
- The **mock provider** implements this same interface with scripted responses (tests, demo mode, offline development).

## 3. Cartridge model

A cartridge = a provider + model + friendly persona wrapper:

```ts
export interface CartridgeDefinition {
  id: string;                     // "openai/quick-thinker"
  providerId: string;             // "openai"
  model: string;                  // provider-native id, e.g. "gpt-5-mini"
  displayName: string;            // "Quick Thinker"
  blurb: string;                  // one-liner on the cartridge label
  stats: { words: 1|2|3; reasoning: 1|2|3; speed: 1|2|3 };  // the Multi-Pack comparison-chart dots
  costHint: 'low' | 'medium' | 'high';   // relative, with "your key, your bill" copy
  defaults: { temperature: number; maxTokens: number };
}
```

The stats dots reproduce the Multi-Pack box's "Choose the right model" chart (words/reasoning/speed) — comparing models on legible axes is itself a lesson. The flip side of every cartridge shows the real model name, so the toy never hides the truth.

## 4. V1 OpenAI pack (`@craftabot/pack-openai`)

Three cartridges — enough to teach "different brains behave differently" without a wall of choices:

| Cartridge | Model (initial mapping) | Blurb | Stats (W/R/S) |
|---|---|---|---|
| **Quick Thinker** | `gpt-5-mini` | Fast and cheerful; great for first builds | 2/2/3 |
| **Deep Thinker** | `gpt-5` | Slower, but plans ahead | 3/3/1 |
| **Penny Thinker** | `gpt-5-nano` | Tiny and thrifty; watch it struggle with hard goals! | 1/1/3 |

**Model IDs live in one catalogue file** (`packs/openai/src/catalogue.ts`) with no hard-coding elsewhere — OpenAI renames models often; updating the catalogue must be a one-file PR. "Penny Thinker struggling" is a designed teaching moment (model capability matters), so keep a genuinely weak model in the line-up.

Wire details: OpenAI Chat Completions API, `stream: true` (SSE), tool definitions via native `tools`/`function` format, usage taken from the final streamed chunk (`stream_options: {"include_usage": true}`).

## 5. Browser calls & CORS reality

- `api.openai.com` accepts direct browser calls (CORS) with `Authorization: Bearer <key>`; this is the V1 path. The dashboard-style warning about exposing keys in web apps does not apply: **the key is the user's own and never leaves their machine except to OpenAI.**
- Future packs, for the record: Anthropic supports browser calls with the `anthropic-dangerous-direct-browser-access: true` header; Gemini supports browser keys with referrer restrictions; Ollama is localhost (its CORS is user-configured via `OLLAMA_ORIGINS`). Any provider that genuinely cannot do CORS would need a tiny optional proxy — that decision is deferred to the Multi-Pack milestone and **must not** shape V1 (no proxy in V1).
- All provider base URLs are fixed constants in the pack. The UI never constructs URLs from user input (no "custom endpoint" field in V1 — an SSRF/phishing foot-gun for beginners; revisit for Ollama later with `localhost`-only validation).

## 6. Key handling ("batteries")

- **Storage:** `localStorage` key `cab.keys.v1` — a JSON object `{ [providerId]: string }`. Plaintext, documented as such: client-side encryption with no user secret would be theatre, and V1 has no backend to hold anything safer. The battery compartment copy says exactly this in friendly terms ("Your battery is stored in this browser only. Anyone who can use this browser profile could see it — don't use a shared computer for your good keys.").
- **Scope discipline (enforced by code review + tests):**
  - Keys are read only inside provider packs at call time.
  - Never in: kit files, traces, exports, event payloads, error messages, console logs, URLs.
  - A unit test greps serialised kit files and traces for the stored key value after a full run round-trip — CI fails if it ever appears.
- **Validation ping:** `validateKey` calls the cheapest possible authenticated endpoint (`GET /v1/models`) to light the battery meter. Result cached until the key changes.
- **Removal:** eject battery = delete key + clear cached validation. "Forget everything" in settings clears all storage.
- **Recommended-practice copy:** encourage users to create a *separate, spending-capped API key* for Craft A Bot; the battery compartment links each provider's key-management page.

## 6a. What the live API actually does (WP7 findings)

> **Amended 2026-08-12 (WP7):** the following were found by running the live smoke test against a real key. Every one of them passed the offline fixture suite first, because a hand-written fixture only ever rejects what its author thought to reject.

**Keys come back to you.** OpenAI's 401 body quotes the rejected key inside its own message — `Incorrect API key provided: sk-…`. That message flows into `ProviderError.message`, the `error` event, the trace, and any export. `redactSecrets` (§ `04`) matches whole string values and therefore cannot catch a key embedded in a sentence. Provider packs must scrub their own key out of every error before it leaves the pack, by substring replacement; the pack is the last layer that knows the secret. Hard rule 2 depends on this, not merely on "never pass the key into the error module".

**The GPT-5 family rejects `temperature`.** Any value other than the default is a hard 400 (`Unsupported value: 'temperature' does not support 0.7 with this model`), so the parameter must be omitted entirely rather than clamped. The temperature dial is therefore inert for these cartridges, and their defaults record the real value (1) rather than an aspirational one.

**Reasoning models spend the output budget before they speak.** GPT-5 models reason invisibly against `max_completion_tokens`. Measured live, "say hello in under ten words" cost **384 reasoning tokens** at the default setting; at `maxTokens: 300` the budget was exhausted during reasoning and the model returned an empty completion with `finish_reason: length`. Two consequences:

- Cartridges set `reasoning_effort` explicitly, mapped to the `reasoning` stat already printed on the cartridge label — Penny `minimal`, Quick `low`, Deep `medium`. This makes that stat real rather than decorative, and keeps spend on thinking the player can actually read (hard rule 3).
- Token budgets must leave room for reasoning *and* a reply. The original 200–500 defaults were below the measured reasoning cost alone.

**A bare tool call is a valid answer.** A model may return a tool call with no text at all; that is a decision, not a streaming failure. Nothing may treat "no text tokens" as an error. In practice the engine's own prompt (§ `02` §8, "think briefly — out loud") reliably produces narration *and* an action together, which is what keeps the thought bubble populated.

## 7. Error normalisation

Provider packs map wire failures to a small typed set the UI can render in kit language (`03-UI-UX-DESIGN.md` §9):

| `ProviderError.kind` | Meaning | Kit copy hook |
|---|---|---|
| `bad-key` | 401/403 | "This battery isn't charged" |
| `rate-limited` | 429 (+ retry-after if present) | "The brain needs a breather" (auto-retry with countdown) |
| `quota` | Billing/quota exhausted | "This battery is flat — check your OpenAI account" |
| `filtered` | Provider safety refusal | Shown honestly as a provider refusal in the trace |
| `network` | Offline/DNS/CORS | "Can't reach the brain factory" |
| `provider-down` | 5xx | Retry once, then surface |
| `malformed` | Unparseable response | Trace "the bot mumbled" path (`03-UI-UX-DESIGN.md` §9) |

Raw error payloads always attach to the trace event; friendly copy is a layer, never a replacement.

## 8. The LLM Multi-Pack (forward design, not V1 scope)

- Ships as pack(s) adding cartridges across providers, presented exactly as the box art: six personality cartridges with the comparison chart, "CHOOSE · CONNECT · PROMPT · COMPARE".
- Persona cartridges may bind the *same* provider model with different default personalities/dials (e.g. Storyteller = high temperature + storyteller personality fragment) — teaching that behaviour = model × configuration, not just model.
- New battery slots appear per provider automatically from `keyRequirement`.
- A **"Compare"** bench feature (two cartridges, same goal, side-by-side runs) is the Multi-Pack's headline feature — noted here so V1's session/trace design doesn't preclude two concurrent sessions. (`AgentSession` is already instance-scoped; the UI is the only single-session assumption, which is acceptable.)
