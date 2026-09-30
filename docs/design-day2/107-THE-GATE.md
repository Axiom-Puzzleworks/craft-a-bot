# 107 — The Gate: a stack over the wire

> **Status (2026-09-30):** WP127 (`101-DAY7-ROADMAP.md` Phase AH; `100-TARGET-DESIGN-V7.md` §6.7, decision D20, tenet 38). Stage A is this note. Stage B is `packages/gate`, `craftabot gate serve | approve`. Stage C is the identity test and the Studio's *Use in… the Gate*.

**A reference implementation, not a product.** It has no authentication, no TLS, no tenancy and no rate limit, and it keeps its conversations in memory. It binds to loopback unless told otherwise. The page and the README say so first.

## 1. What it is

The Gate is an HTTP server in front of one upstream model. It speaks the OpenAI chat-completions wire on `POST /v1/chat/completions`, and it runs a **stack**, the same content the Studio builds (`89-…`), at the three loop points:
- **`pre-think`** over the request's messages;
- **`pre-act`** over each `tool_call` the upstream answers;
- **`post-act`** over what each call returned.

**It is the session's chain, not a copy of it.** `runGuardrailChain` runs the guardrails that `compileStackLoop` compiled from the stack, over a `GuardrailContext` built from the wire in place of a world.

## 2. The context, from the wire

| Field | From the wire | Unavailable off-world |
|---|---|---|
| `tick` | The conversation's turn, counted from 1 | |
| `usage` | Turns completed, plus the upstream's `usage.prompt_tokens` and `completion_tokens` summed per conversation | |
| `messages` | The request's messages, mapped to `ChatMessage` (`tool_calls` ↔ `toolCalls`, `tool_call_id` ↔ `toolCallId`) | |
| `response` | The upstream's first choice, as a `ChatResponse` (its first `tool_call` as `toolCall`, `usage`, `finishReason`) | |
| `proposed` | Each `tool_call`, `{ kind: 'tool', name, arguments }`, with the arguments parsed from their JSON string | |
| `result` | At `post-act`: the tool message answering the turn's call, `{ name, text: content, ok: true }` | whether the call succeeded: the wire does not say |
| `untrusted` | What `post-act` marked, as in a session (`106-…` §8.1) | |
| `history` | The Gate's own events for the conversation | the world's events |
| `worldState`, `world`, `observation` | absent | every `world-predicate` leaf reads false; `observation-contains` reads false |
| `spec` | A fixed identity (`GATE_SPEC`), the one shape a context must carry | |

**Where `post-act` runs.** The result of turn *N*'s call reaches the Gate as a `tool` message in request *N+1*. The Gate therefore runs `post-act` for turn *N* at the start of request *N+1*, over the tool messages it has not seen before, and then `pre-think` for turn *N+1*. `POST /v1/gate/conversations/{id}/end` runs the last `post-act` and writes `run.finished`.

> **Diverged from `100-…` §6.7:** it said "post-act over the assistant's text". The assistant's text is the upstream's *response*, which `pre-act` already has, and a result is what `post-act` means everywhere else (`106-…` §8.1). Running it over the tool message is what lets untrusted-content marking and taint work over the wire exactly as they do in a session.

**Conversations.** A conversation is named by the `x-craftabot-conversation` header, or by the digest of its first two messages when the client sends none.

## 3. Modes and each verdict's effect

| Verdict | `shadow` | `enforce` |
|---|---|---|
| `allow` | forwarded unchanged | forwarded unchanged |
| `annotate` | recorded | recorded, forwarded unchanged |
| `redact` at `pre-act` | recorded | the call's arguments carry the redacted text: the string argument the guard read is rewritten |
| `block-action` at `pre-act` | recorded | the `tool_call` is removed, and the assistant's content gains *The Gate refused `name`: reason*. If no call remains, `finish_reason` is `stop`. |
| `block-action` / `stop-run` at `pre-think` | recorded | no upstream call; the reply is an assistant message stating the reason, `finish_reason: 'stop'` |
| `stop-run` at `pre-act` or `post-act` | recorded | the reply's calls are removed, its content is the reason, `finish_reason: 'stop'`, and the conversation is closed: every later request gets the same reply |
| `pause` | recorded | `202` with `{ approvalId, reason }`, and the upstream's answer held |

**Shadow echoes.** Every verdict other than `allow` is echoed in `x-craftabot-verdicts`, JSON, in both modes. A client may ignore it.

> **Diverged:** `100-…` §6.7 said a blocked call *"inserts a tool message stating the refusal"*. A completion response is one assistant message and cannot carry a tool message. The refusal is said in the assistant's content instead, which the agent reads on its next turn.

**The approval round-trip.** A `pause` holds the upstream's answer under an approval id, and writes `approval.requested`.
- **The operator answers** with `craftabot gate approve <id>` or `craftabot gate deny <id>`, which is `POST /v1/gate/approvals/{id}` with `{ approved }`. That writes `approval.resolved`.
- **The client re-sends its request** with `x-craftabot-approval: <id>`:
  - approved, it gets the held answer with the paused call kept;
  - denied, it gets the answer with that call refused, as a block;
  - still pending, it gets `202` again.

## 4. The trace

**What it writes.** Per conversation, the event types a session writes: `run.started` (with the principal from `--principal`), `prompt.composed`, `think.completed`, `guardrail.checked`/`tripped` with `componentId` and `point`, `approval.*`, `content.marked`, `decision` and `action.performed` for a forwarded call (its `result.narration` is *forwarded*), and `run.finished`.

**Where it goes.** Events go to an `EventBus` any `TraceSink` attaches to: `telemetry/file` by `--sink` in the harness. `GET /v1/gate/conversations/{id}/trace` returns the trace file with its digest, so the Audit Centre opens a conversation as it opens a run.

**Keys.** The upstream key is read from the environment (`CRAFTABOT_GATE_UPSTREAM_KEY`) at the call, sent as `Authorization`, and never written to an event, a header echo or a log. This is hard rule 2 in the harness's form, and the key-leak sweep covers the Gate.

## 5. Egress and the bind

**Egress.** Every call the Gate makes goes through core's `createEgressGuard` in `declared` mode, with one host declared: the upstream's. A hosted guard in the stack runs its offline stand-in: the Gate never calls a guard vendor, so the guard refuses every host but the upstream.

**The bind.** It binds `127.0.0.1` by default. Any other host needs `--allow-remote`, and the start line says it is unauthenticated.

## 6. The presets and the identity test

**The five presets** are Gate content (`packages/gate/presets/`), stacks over what the wire can see:

| Preset | Fits |
|---|---|
| `gate/stack/budgets` | step budget and token budget at `pre-think` |
| `gate/stack/policy-card` | the step budget, and the card `gate/policy/no-outside-mail` at `pre-act` |
| `gate/stack/approval` | approval mode `everything` at `pre-act` |
| `gate/stack/injection-defences` | untrusted-content marking at `post-act`, taint at `pre-act` |
| `gate/stack/quarantined-reader` | `fs-bank/guard/quarantined-reader` at `post-act`, taint at `pre-act` |

**The Studio-built fixture.** One more stack, saved as the Studio saves one (`stackRecord`), is `packages/gate/fixtures/studio-stack.json`.

**The identity test.** A session runs a scripted brain over the mock provider with the stack compiled into its guardrails, in a world whose calls are tools. The test then replays the same conversation through the Gate, on a port, in front of an upstream that answers each turn as the mock did:
- each request carries the prompt the session composed at that turn;
- the Gate's `post-act` for a turn reads the tool message carrying that turn's result;
- the conversation is ended as the session ended.

**What must match.** The `guardrail.checked` sequences are equal, byte for byte, over `{ tick, guardrailId, hook, verdict, componentId, point }`, for each preset and the fixture. It runs on every push.

## 7. What is not built

- authentication, TLS and tenancy;
- streaming (`stream: true` is refused with `400`);
- more than one upstream;
- persistence of conversations across a restart;
- a Workbench screen for the Gate beyond the Studio's *Use in…*, which writes the stack file and the command line.

## 8. Stage notes
