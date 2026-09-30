# The Gate

> **A reference implementation.** It has no authentication and no TLS, it serves one tenant, and it keeps its conversations in memory. It binds to loopback unless you pass `--allow-remote`. Run it on your own machine, in front of your own agent, to see what a stack would have done. Do not put it on a network.

The Gate runs a **stack**, the guardrail composition the Studio builds, in front of any agent that speaks the OpenAI chat-completions wire. The agent needs no change and no Craft A Bot import: point its base URL at the Gate, and the Gate forwards to the real model. The design is `docs/design-day2/107-THE-GATE.md`.

## Serve a stack

```bash
CRAFTABOT_GATE_UPSTREAM_KEY=… npm run craftabot -- gate serve --stack gate/stack/policy-card --upstream https://api.openai.com/v1 --mode shadow
```

**`--stack`.** A registered stack's id or a file:

- the five presets, `gate/stack/budgets`, `…/policy-card`, `…/approval`, `…/injection-defences` and `…/quarantined-reader`;
- any desk's stack;
- a file the Studio's _Use in… the Gate_ downloaded.

**`--mode`.**

- `shadow` changes nothing: every verdict is written to the trace and listed in the `x-craftabot-verdicts` response header.
- `enforce` acts on them, as below.

Start in shadow.

**The key.** `CRAFTABOT_GATE_UPSTREAM_KEY` is read at each call and sent only to the upstream. It is never on the trace, a header or a log.

**The rest of the options:**

- `--port` (8127 by default);
- `--principal` (who operates the Gate, on the trace);
- `--sink telemetry/file --sink-config '{"path":"gate.jsonl"}'` (stream every event).

## What it checks, and when

| Point       | Over                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `pre-think` | the request's messages, before the model sees them                      |
| `pre-act`   | each tool call the model answers, one chain per call                    |
| `post-act`  | what each call returned: the `tool` message in the agent's next request |

**Calls are actions.** A call through the Gate reaches the world, so approval mode and the action blocklist apply.

**What cannot be checked.** There is no world behind the wire, so a card leaf that asks the world reads false.

## What enforce does

| Verdict           | Effect                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| block (at a call) | the call is removed, and the reply says _The Gate refused `name`: reason_                                                                                |
| stop              | the reply is the reason, and the conversation is closed: every later request gets the same reply                                                         |
| pause             | `202` with an approval id; answer it with `npm run craftabot -- gate approve <id>` (or `deny`), and the agent re-sends with `x-craftabot-approval: <id>` |
| redact            | the call's `text` is rewritten                                                                                                                           |
| annotate          | recorded only                                                                                                                                            |

## The evidence

- **One conversation.** `GET /v1/gate/conversations/{id}/trace` returns its trace file, with its digest.
- **The day.** `GET /v1/gate/bundle` returns every conversation as one `craftabot-bundle`.
- **In the Audit Centre.** _Open a bundle…_ verifies the digest and stores the conversations as runs.
- **In the assurance pack.** The Gate's pack names the stack, the mode, the upstream and each conversation.

## The example

`examples/gated-agent` is an agent with no Craft A Bot in it and a scripted model, with the Gate between them running `stack.json`. It has four outcomes: calls made, a call refused by the policy card, a call refused by the blocklist, and a stop at the budget. Its README has the three commands to run it.
