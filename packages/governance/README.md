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

**Status:** `1.0.0` (WP126, `docs/design-day2/101-DAY7-ROADMAP.md`). The API below is the 1.0
surface: readers and the guardrail components joined it at 1.0, and every export carries a doc
comment (`scripts/governance-exports.mjs`, run as a test). It rests on `@craftabot/core` 1.x
for the contracts and `@craftabot/metrics` for the drift and calibration folds; publishing
waits on those two being published first, and until then it is used from this workspace, or
from the three tarballs `scripts/check-governance-install.mjs` packs and installs.

## The contract it rests on

A guardrail is an object with an `id`, the `hooks` it runs at (`pre-think`, `pre-act`,
`post-act`) and a `check(ctx)` returning a verdict: `{ allow: true }`,
`{ allow: false, reason, disposition: 'block-action' | 'stop-run' }`, or
`{ pause: true, reason }` for a person to answer. A host builds a `GuardrailContext` from what it
knows — the tick, usage so far, the proposed call, the history it has kept — and runs
`runGuardrailChain(guardrails, hook, ctx, onChecked)`; the first verdict that is not an allow
wins, and `onChecked` sees every verdict so the host can put it on a trace.

## Four ways in

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

**A reader, as a guard.** A `Reader` answers typed questions — a choice, a _noul_ (a probability
that something is so), a score — with a confidence (`104-READERS.md`). Three kinds ship:
`ruleReader` (a function per question, at confidence 1), `hostedReader` (a classification
service behind a line) and `llmReader` (a chat model constrained to the options, reading
log-probabilities where the provider gives them). `readerComponent` fits one noul at a point,
blocking or annotating at a threshold:

```ts
import { readerComponent, ruleReader } from '@craftabot/governance';

const reader = ruleReader({
	id: 'example/reader/identifier',
	name: 'Identifier spotter',
	description: 'Says whether a call carries an identifier.',
	answers: ['noul'],
	rules: { identifier: (subject) => /\b[A-Z]{2}\d{6}[A-Z]\b/.test(JSON.stringify(subject)) }
});
const guard = readerComponent({
	id: 'example/guard/identifier',
	name: 'Identifier spotter',
	description: 'Records a call that carries an identifier.',
	reader,
	questionId: 'identifier',
	question: { type: 'noul', instructions: 'Does this call carry a national identifier?' },
	points: ['pre-act']
});
const guardrails = guard.compile({ verdict: 'annotate' }, deps, { kind: 'pre-act' });
```

## Components

Every mechanism above is also a `GuardrailComponent` (from core): an id, the points it decides
at, the verdicts it can give, its cost and connection, a config schema and `compile`, which turns
a config into guardrails at a point (`85-COMPONENTS.md`). The built-ins (`stepBudgetComponent`,
`actionBlocklistComponent`, …), `policyCardComponent`, `guardServiceComponent` and the egress
gate are exported, with `compileComponents` to compile a stack's fits in one call.

Four answer indirect injection — an instruction planted in something the agent reads
(`106-BENCHMARK.md` §8):

- `untrustedContentComponent` marks what a tool answered as untrusted at `post-act`; a host that
  honours the verdict's `mark` wraps it in the prompt as data.
- `taintComponent` refuses, at `pre-act`, a call whose argument carries marked text — value
  taint: four shared words, or a long value whole. It does not follow a paraphrase.
- `quarantinedReaderComponent({ reader, questions })` lets a reader alone read the result, asked
  with nothing to act with, and replaces it with the reader's answers.
- `redTeamSeatComponent` names the adversarial counterpart; it only annotates.

The policy leaves `content-is-untrusted` and `taint-reaches` are evaluated by
`evaluatePredicate` over `GuardrailContext.untrusted`.

## Reports

`@craftabot/governance/reports` folds a run's events into what a governance screen shows:
`summariseRun`, the incident log (`incidentsFromSummaries`), the safety-case worksheet
(`safetyCaseFromSummaries`, with evaluation and campaign evidence), telemetry by card and
cartridge, the guardrail trip mix, autonomy figures, the daily series and its drift flags
(`telemetrySeries`, `driftIn`), `reasonsUsed` — what a decision had in hand when it was made,
the first field of the explain-this-decision fold — `genericControlMap`, the NIST, EU AI Act,
ISO/IEC 42001 and OWASP ASI rows a host registers as the control map's generic half — and
`assertionEvaluator` for assertion cards
as evaluators, the Guardrail Catalogue's coverage (`coverageReport`, `coverageSummary`, with what
a benchmark measured), and the assurance pack (`assurancePackFor`) with its two renderers.
Every fold is pure; a headless host produces the same JSON the Workshop renders.

## What it does not do

It does not run a loop, call a model or hold a world — a host does. It does not phone home: a
hosted service's client is yours, and the only network calls are the ones you write. It makes
no compliance claim; `docs/governance-mapping.md` describes each mechanism in the vocabulary of
the frameworks it can be held against.

## Not allowed to depend on

Svelte, SvelteKit or any DOM API; any Craft A Bot pack, app or tool beyond `@craftabot/core`
and `@craftabot/metrics`.
`scripts/check-governance-pack.mjs` fails CI if the tarball says otherwise.

Licence: Apache-2.0.
