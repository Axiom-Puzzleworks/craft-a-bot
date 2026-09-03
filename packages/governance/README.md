# @craftabot/governance

Guardrail mechanisms for agent loops, as a library: budgets, blocklists, a loop-breaker, an
approval gate, a policy-card compiler, a shell that turns any hosted guard service into
guardrails, a policy-decision-point input document, and the governance reports a trace can be
folded into. It depends on [`@craftabot/core`](../core) for the contracts (`Guardrail`,
`GuardrailContext`, `runGuardrailChain`, the event and record schemas) and on nothing else —
no world, no pack, no UI. ESLint holds that boundary in the source; `npm pack` is checked in
CI so the tarball holds it too.

It is the governance half of [Craft A Bot](../../README.md), kept separate from day one so it
could be used in real agent stacks (`docs/design-day2/08-GOVERNANCE-GUARDRAILS.md` §5). The
working example is [`examples/plain-node-agent`](../../examples/plain-node-agent) — a Node loop
with no Craft A Bot in it, gated three ways.

**Status:** `1.0.0-rc.1`. The API is what 1.0 will be. Publishing waits on `@craftabot/core`
being published first, since the contracts are its types; until then, use it from this
workspace.

## The contract it rests on

A guardrail is an object with an `id`, the `hooks` it runs at (`pre-think`, `pre-act`,
`post-act`) and a `check(ctx)` returning a verdict: `{ allow: true }`,
`{ allow: false, reason, disposition: 'block-action' | 'stop-run' }`, or
`{ pause: true, reason }` for a person to answer. A host builds a `GuardrailContext` from what it
knows — the tick, usage so far, the proposed call, the history it has kept — and runs
`runGuardrailChain(guardrails, hook, ctx, onChecked)`; the first verdict that is not an allow
wins, and `onChecked` sees every verdict so the host can put it on a trace.

## Three ways in

**Hand-written rules.** Six factories, each a `Guardrail`:

```ts
import { createStepBudgetGuardrail, createToolBlocklistGuardrail } from '@craftabot/governance';
import { runGuardrailChain } from '@craftabot/core';

const guardrails = [createToolBlocklistGuardrail(['delete_file']), createStepBudgetGuardrail(6)];
const outcome = await runGuardrailChain(guardrails, 'pre-act', ctx, (guardrail, verdict) => {
	console.log(guardrail.id, verdict);
});
```

Also `createActionBlocklistGuardrail`, `createTokenBudgetGuardrail`,
`createNoRepetitionGuardrail` (the loop-breaker) and `createApprovalModeGuardrail` (the human
approval gate). Their ids are exported beside them (`STEP_BUDGET_ID`, …).

**A policy card.** Declarative rules — a hook, a predicate over the proposed call, the
observation, usage, history or the world's own predicates, and a disposition — compiled to
guardrails:

```ts
import { compilePolicyCard } from '@craftabot/governance';

const guardrails = compilePolicyCard({
	id: 'example/no-outside-mail',
	title: 'No mail outside example.com',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'send_email' },
					{
						kind: 'not',
						expr: { kind: 'argument-matches', path: 'to', pattern: '@example\\.com$' }
					}
				]
			},
			then: 'block-action',
			reason: 'Mail may only be sent to example.com addresses.'
		}
	]
});
```

The card schema (`policyCardSchema`, `parsePolicyCard`) lives in `@craftabot/core`; patterns
are a bounded regular-expression subset checked at parse time. `evaluatePredicate` and
`predicateContextFor` are exported for a host that wants the predicate language on its own.

**A hosted guard service, through the shell.** Implement `GuardrailService` (from core) —
`screen(request)` returning findings by category with a record of the call — and let the shell
turn it into one guardrail per hook, with dispositions per category, a fail-closed dial, a
confidence floor, and the `guardrail.external` trace record:

```ts
import { createHostedGuardrails, hostedScreenConfigSchema } from '@craftabot/governance';

const guardrails = createHostedGuardrails({
	idPrefix: 'example/pii',
	service: piiScreen, // your GuardrailService
	serviceConfig: {},
	screening: hostedScreenConfigSchema.parse({ screenDecision: 'block' }),
	ctx: { fetch: globalThis.fetch, getCredential: (id) => process.env[id] },
	envelope: (ctx) => ({ agentId: ctx.spec.id, tick: ctx.tick })
});
```

`pdpRequestFor(ctx)` builds the input document a policy decision point (OPA, say) reads; the
shell attaches it to every request as `policyInput`.

## Reports

`@craftabot/governance/reports` folds a run's events into what a governance screen shows:
`summariseRun`, the incident log (`incidentsFromSummaries`), the safety-case worksheet
(`safetyCaseFromSummaries`, with evaluation and campaign evidence), telemetry by card and
cartridge, the guardrail trip mix, autonomy figures, the daily series and its drift flags
(`telemetrySeries`, `driftIn`), and `assertionEvaluator` for assertion cards as evaluators.
Every fold is pure; a headless host produces the same JSON the Workshop renders.

## What it does not do

It does not run a loop, call a model or hold a world — a host does. It does not phone home: a
hosted service's client is yours, and the only network calls are the ones you write. It makes
no compliance claim; `docs/governance-mapping.md` describes each mechanism in the vocabulary of
the frameworks it can be held against.

## Not allowed to depend on

Svelte, SvelteKit or any DOM API; any Craft A Bot pack, app or tool beyond `@craftabot/core`.
`scripts/check-governance-pack.mjs` fails CI if the tarball says otherwise.

Licence: Apache-2.0.
