# plain-node-agent

A Node agent loop with no Craft A Bot world, pack or UI in it, gating every tool call through
`@craftabot/governance` the way the engine does — the proof behind
`08-GOVERNANCE-GUARDRAILS.md` §5's last row (WP50, `38-GOVERNANCE-1-0.md` §4.2).

```bash
npm ci            # from the repo root — one install for the workspace
npm run build     # builds core, governance and this example
npm run example:governance
```

A scripted brain proposes seven tool calls. Before each, the loop runs `runGuardrailChain` at
`pre-think` and then at `pre-act` over three kinds of guardrail:

- **hand-written rules** — `createToolBlocklistGuardrail(['delete_file'])` and
  `createStepBudgetGuardrail(6)`;
- **a policy card** — `compilePolicyCard` over one rule: `send_email` is blocked when `to` does
  not match `@example\.com$`;
- **a hosted guard service through the shell** — `createHostedGuardrails` over the example's own
  `GuardrailService`, a local PII screen that flags a national-insurance number in the proposed
  call. A vendor's client would call out here; the shell around it is the same.

Each verdict is printed as the engine would put it on a trace (`guardrail.checked`,
`guardrail.tripped`, `tool.executed`, `run.finished`). `src/index.test.ts` asserts the four
outcomes: the outside email blocked by the card, the NI number caught by the screen, the delete
refused by the blocklist, the budget stopping the run.
