/**
 * **The control mechanisms** (WP132, `110-CONTROL-SUITE-PLAN.md` §4.1): the
 * product's fixed behaviour that constrains, measures or records a bot — the
 * engine's, the workflow runtime's, the Gate's, the hosted shell's, and the
 * folds that turn runs into evidence. A mechanism is never fitted: it is
 * there, or a host turns it with the setting `configuredBy` names. Each one
 * says where it lives and how a reader sees it act (`observedAs`: an event
 * type, a report field, a screen), so the catalogue's `implementedBy`
 * resolves to something that can be opened rather than to prose.
 *
 * A mechanism's id is `{package}/{name}`. The list is content, like the
 * catalogue: adding behaviour that guards a bot means adding its row here,
 * and the Control Inventory (WP133) refuses an entry naming a mechanism
 * this list lacks.
 */
export interface ControlMechanism {
	id: string;
	name: string;
	summary: string;
	/** The source files, from the repository root. */
	where: string[];
	/** How a reader sees it act: event types, report fields, screens. */
	observedAs: string[];
	/** The setting that turns it, when one does; absent means fixed. */
	configuredBy?: string;
	/** The work package it landed in. */
	since: string;
}

const m = (mechanism: ControlMechanism): ControlMechanism => mechanism;

/** Every declared mechanism, grouped by where it lives: the engine, the desk, the workflow, the hosted shell, the Gate, the monitor pack, the folds. */
export const CONTROL_MECHANISMS: readonly ControlMechanism[] = [
	// ------------------------------------------------------------------ the engine
	m({
		id: 'core/trace',
		name: 'The trace and its digest',
		summary:
			'Every prompt, decision, action and verdict arrives as a typed event; the record is digested over its parsed events.',
		where: ['packages/core/src/schemas/events.ts', 'packages/core/src/persistence/run-record.ts'],
		observedAs: ['the Run Lab', 'run.finished'],
		since: 'WP0'
	}),
	m({
		id: 'core/principal',
		name: 'Principal, delegation and attestation',
		summary:
			'Who a run acts for, who approved what, and the guardrails each action passed — written only when the host names one.',
		where: ['packages/core/src/session/agent-session.ts', 'packages/core/src/schemas/shared.ts'],
		observedAs: ['run.started', 'approval.resolved', 'action.performed'],
		configuredBy: 'SessionOptions.principal',
		since: 'WP65'
	}),
	m({
		id: 'core/stop',
		name: 'Stop',
		summary: 'A person ends any run at any tick; the run finishes STOPPED_BY_USER.',
		where: ['packages/core/src/session/agent-session.ts'],
		observedAs: ['run.finished'],
		since: 'WP0'
	}),
	m({
		id: 'core/failover',
		name: 'Provider failover',
		summary:
			'A provider in front of several asks each in turn on an unavailable, slow or rate-limited answer; think.completed says who served and who failed.',
		where: ['packages/core/src/failover.ts'],
		observedAs: ['think.completed.response.servedBy'],
		configuredBy: 'the provider list a host builds, and the failure kinds that fail over',
		since: 'WP148'
	}),
	m({
		id: 'core/request-timeout',
		name: 'The provider request timeout',
		summary:
			'A provider call that does not answer within its timeout is aborted and reaches the trace as an error.',
		where: ['packages/core/src/session/budgets.ts'],
		observedAs: ['error'],
		configuredBy: 'SessionOptions.budgets.requestTimeoutMs (default 60 s)',
		since: 'WP3'
	}),
	m({
		id: 'core/provider-fault',
		name: 'The provider-fault injection',
		summary:
			'A scenario can fault the provider at a tick; the run goes on and the trace says what failed and what was retried.',
		where: ['packages/core/src/session/agent-session.ts', 'packages/core/src/schemas/scenario.ts'],
		observedAs: ['error', 'provider.retried'],
		configuredBy: 'a scenario’s provider-fault injection',
		since: 'WP72'
	}),
	m({
		id: 'core/redact-say',
		name: 'Redaction applied to what the bot says',
		summary:
			'The first redact verdict at pre-act rewrites the outgoing line before it reaches the world or the trace.',
		where: [
			'packages/core/src/session/agent-session.ts',
			'packages/core/src/session/guardrail-chain.ts'
		],
		observedAs: ['action.performed.redacted'],
		since: 'WP96'
	}),
	m({
		id: 'core/untrusted-wrap',
		name: 'Untrusted content wrapped as data',
		summary:
			'A tool result marked untrusted is wrapped between markers in the prompt and kept on the run’s untrusted list.',
		where: [
			'packages/core/src/session/agent-session.ts',
			'packages/core/src/session/prompt.ts',
			'packages/core/src/session/memory.ts'
		],
		observedAs: ['content.marked'],
		since: 'WP124'
	}),
	m({
		id: 'core/memory-trace',
		name: 'Memory writes on the trace',
		summary: 'Every notebook write is an event; nothing a bot remembers is off the record.',
		where: ['packages/core/src/session/memory.ts'],
		observedAs: ['memory.updated'],
		since: 'WP0'
	}),
	m({
		id: 'core/memory-label',
		name: 'The notebook write’s label',
		summary:
			'A notebook write made after the bot read unquarantined untrusted content carries source untrusted on its memory.updated: the context’s label, whatever the words.',
		where: ['packages/core/src/session/agent-session.ts'],
		observedAs: ['memory.updated.source'],
		since: 'WP141'
	}),
	m({
		id: 'core/risk-tier',
		name: 'Risk tiers on actions',
		summary:
			'Every world action and service-line operation declares observe, reversible or irreversible; approval reads it.',
		where: ['packages/core/src/types/brick.ts', 'packages/core/src/types/service-line.ts'],
		observedAs: ['approval.requested'],
		since: 'WP24'
	}),
	m({
		id: 'core/group-token-budget',
		name: 'The group’s token budget',
		summary: 'A token cap across every seat of a group episode, at the group chokepoint.',
		where: ['packages/core/src/session/session-group.ts'],
		observedAs: ['guardrail.tripped'],
		configuredBy: 'the group’s token budget',
		since: 'WP29'
	}),
	m({
		id: 'core/group-chokepoint',
		name: 'The group chokepoint',
		summary:
			'Every seat’s actions in a group episode pass one chain, where the group’s observers and breakers sit.',
		where: ['packages/core/src/session/session-group.ts'],
		observedAs: ['group.started', 'guardrail.checked'],
		since: 'WP29'
	}),
	m({
		id: 'core/kit-requires',
		name: 'Kit-file requirements and semver ranges',
		summary:
			'A kit file names the packs and versions it was built from; an import outside the range is refused.',
		where: ['packages/core/src/semver.ts', 'packages/core/src/persistence/kit-export.ts'],
		observedAs: ['the import’s version-mismatch notice'],
		since: 'WP52'
	}),
	m({
		id: 'core/agent-card',
		name: 'The agent card',
		summary: 'A machine-readable inventory of a built bot: bricks, cartridge, tools, policies.',
		where: ['packages/core/src/persistence/agent-card.ts'],
		observedAs: ['the assurance pack’s inventory'],
		since: 'WP33'
	}),
	m({
		id: 'core/cassette-digest',
		name: 'Cassette and prompt digests',
		summary:
			'Every recorded line and provider answer is keyed by a digest of what was asked; a replay that asks anything else misses.',
		where: ['packages/core/src/provider-cassette.ts'],
		observedAs: ['error.kind cassette-miss'],
		since: 'WP58'
	}),
	m({
		id: 'core/disclosure',
		name: 'Mandatory disclosures on the trace',
		summary:
			'A desk action that must tell the customer something says it in registered words; the host writes disclosure.given with the digest of the words said.',
		where: [
			'packages/core/src/session/agent-session.ts',
			'packages/desk/src/desk-world.ts',
			'packages/packs/fs-bank/src/disclosures.ts'
		],
		observedAs: ['disclosure.given'],
		since: 'WP145'
	}),
	m({
		id: 'core/build-digest',
		name: 'The build digest and the changed build',
		summary:
			'A digest over a bot’s goal card, knobs and every brick’s config, on the kit file; a run of a build other than the one validated says so on run.started.',
		where: ['packages/core/src/build-digest.ts', 'packages/core/src/session/agent-session.ts'],
		observedAs: ['run.started.changed', 'craftabot kit digest'],
		configuredBy: 'the build named as validated',
		since: 'WP147'
	}),
	m({
		id: 'core/pack-digest',
		name: 'The pack content digest and its pins',
		summary:
			'A digest over every tool, action and sense description, card and stack a pack carries; a host pins it, and the registry refuses a pack that differs.',
		where: ['packages/core/src/pack-digest.ts', 'packages/harness/packs.lock.json'],
		observedAs: ['the registration refusal', 'craftabot packs lock --check'],
		configuredBy: 'a host’s pins (the harness pins every shipped pack)',
		since: 'WP141'
	}),
	m({
		id: 'core/export-scrub',
		name: 'The export scrub',
		summary:
			'Every export passes an exact-match scrub of the vault’s keys — the backstop behind keys never entering a record.',
		where: ['packages/core/src/persistence/redact.ts'],
		observedAs: ['[key-redacted] in an export'],
		since: 'WP4'
	}),
	m({
		id: 'core/key-vault',
		name: 'The key vault',
		summary:
			'Keys live in the browser’s vault or the harness’s environment, read only by a provider at call time; timed entries expire.',
		where: ['apps/workbench/src/lib/state/keys.ts', 'packages/harness/src/credentials.ts'],
		observedAs: ['Settings’ batteries'],
		since: 'WP0'
	}),
	m({
		id: 'core/key-leak-test',
		name: 'The key-leak test',
		summary:
			'CI proves a key set in the vault never reaches an event, a record, an export or a URL.',
		where: ['apps/workbench/src/lib/state/key-leak.test.ts'],
		observedAs: ['CI'],
		since: 'WP0'
	}),
	// ------------------------------------------------------------------ the desk
	m({
		id: 'desk/record-classification',
		name: 'Record classification and the special-category rule',
		summary:
			'Every desk record is public, personal or special-category; a special-category record never enters the context ladder.',
		where: ['packages/core/src/types/desk-world.ts', 'packages/desk/src/desk-world.ts'],
		observedAs: ['the case file’s classification chips'],
		since: 'WP59'
	}),
	m({
		id: 'desk/brief-separation',
		name: 'Records apart from instructions',
		summary:
			'The desk’s brief keeps the case’s records apart from the bot’s instructions, so a record reads as data.',
		where: ['packages/desk/src/desk-world.ts'],
		observedAs: ['the prompt'],
		since: 'WP53'
	}),
	m({
		id: 'fs-bank/purpose-gating',
		name: 'Purpose-gated lines',
		summary:
			'A bank line answers a special-category read only for the purpose it declares, and refuses the rest.',
		where: ['packages/packs/fs-bank/src/lines/shared.ts'],
		observedAs: ['tool.executed'],
		since: 'WP59'
	}),
	// ------------------------------------------------------------------ the workflow
	m({
		id: 'workflow/validate-against',
		name: 'Stage schemas',
		summary:
			'Every stage’s input and output are validated against its JSON schema before anything reads them.',
		where: ['packages/workflow/src/validate.ts'],
		observedAs: ['stage.completed'],
		since: 'WP79'
	}),
	m({
		id: 'workflow/boundary-chain',
		name: 'The stage-boundary chain',
		summary:
			'Guards at a stage’s input and output, whatever executes it: block, stop, pause to a person, redact, annotate.',
		where: ['packages/workflow/src/run.ts', 'packages/governance/src/components/stage-guards.ts'],
		observedAs: ['stage.completed.guards'],
		configuredBy: 'StageSpec.guards, WorkflowConfig.stack and stageStacks',
		since: 'WP95'
	}),
	m({
		id: 'workflow/bounds',
		name: 'The journey’s bounds',
		summary:
			'A journey runs at most 64 stages and digests a value over 16 KiB rather than carrying it.',
		where: ['packages/workflow/src/run.ts'],
		observedAs: ['the workflow run’s outcome'],
		configuredBy: 'RunWorkflowOptions.maxStages (64) and valueCap (16 KiB, since WP148)',
		since: 'WP79'
	}),
	m({
		id: 'workflow/reader-gate',
		name: 'The reader’s confidence gate',
		summary:
			'A reader stage below its threshold, or hearing a steer, hands the case to its else — a rule or a person.',
		where: ['packages/workflow/src/reader.ts'],
		observedAs: ['reader.answered.gated'],
		configuredBy: 'ReaderExecutor.gate',
		since: 'WP117'
	}),
	m({
		id: 'workflow/deadlines',
		name: 'Stage deadlines and the overdue case',
		summary:
			'A stage’s deadline in journey ticks; a stage done past it is recorded overdue and written stage.overdue, and the bank clock lists the case as an incident.',
		where: ['packages/workflow/src/run.ts', 'packages/workflow/src/bank.ts'],
		observedAs: ['stage.overdue', 'BankRun.counts.overdue'],
		configuredBy: 'a stage’s deadline',
		since: 'WP146'
	}),
	m({
		id: 'workflow/override-reason',
		name: 'Overrides and their reasons',
		summary:
			'A person’s decision against the case’s recommendation is recorded as an override, with the reason given, on the stage’s approval and on approval.resolved.',
		where: ['packages/workflow/src/run.ts'],
		observedAs: ['approval.resolved.override', 'StageRecord.approval.reason'],
		since: 'WP146'
	}),
	m({
		id: 'workflow/appeal',
		name: 'The appeal, as a handoff to review',
		summary:
			'A contested adverse decision is handed to the bank’s review journey with kind appeal; the run records the handoff and the review decides it.',
		where: ['packages/workflow/src/run.ts', 'packages/packs/fs-bank/src/appeal.ts'],
		observedAs: ['WorkflowRun.handoff.kind', 'the Pipeline’s handoff link'],
		since: 'WP145'
	}),
	m({
		id: 'workflow/handoff',
		name: 'Handoffs and their chain',
		summary:
			'A case handed to another desk carries the item and the chain of desks it passed, never the first desk’s state.',
		where: ['packages/workflow/src/run.ts'],
		observedAs: ['WorkflowRun.handoff', 'WorkflowRun.handoffs'],
		since: 'WP102'
	}),
	m({
		id: 'workflow/human-stage',
		name: 'The human stage',
		summary:
			'A stage a person executes — the four-eyes decision — answered by the reviewer model in a campaign.',
		where: ['packages/workflow/src/run.ts', 'packages/workflow/src/reviewer.ts'],
		observedAs: ['StageRecord.by'],
		since: 'WP80'
	}),
	m({
		id: 'workflow/autonomy-ceilings',
		name: 'Autonomy levels and their ceilings',
		summary:
			'A configuration names its level and the ceiling per decision right; a decision above its ceiling is counted as a breach — or, with `enforce`, held for a person where it is recorded (WP139).',
		where: [
			'packages/workflow/src/human-load.ts',
			'packages/workflow/src/run.ts',
			'packages/evals/src/campaign.ts'
		],
		observedAs: [
			'the report’s ceilingBreachRate',
			'approval.requested',
			'the workflow/ceiling verdict'
		],
		configuredBy: 'WorkflowConfig.autonomy (level, ceilings, enforce)',
		since: 'WP80'
	}),
	// ------------------------------------------------------------------ the hosted shell
	m({
		id: 'hosted/fail-closed',
		name: 'Fail closed',
		summary:
			'A guard service that cannot answer stops the run with the cause could-not-check, unless its config says allow-with-note.',
		where: [
			'packages/governance/src/hosted/verdict.ts',
			'packages/governance/src/hosted/config.ts'
		],
		observedAs: ['guardrail.tripped.cause'],
		configuredBy: 'the service config’s onFailure and timeoutMs',
		since: 'WP39'
	}),
	m({
		id: 'hosted/hook-clamp',
		name: 'The verdict clamp per hook',
		summary:
			'A service’s block or ask at pre-think or post-act, where there is no action to refuse, becomes a stop.',
		where: ['packages/governance/src/hosted/verdict.ts'],
		observedAs: ['guardrail.tripped'],
		since: 'WP39'
	}),
	// ------------------------------------------------------------------ the Gate
	m({
		id: 'gate/shadow',
		name: 'The Gate in shadow',
		summary:
			'A stack runs over an agent’s live traffic and records every verdict without applying one.',
		where: ['packages/gate/src/gate.ts'],
		observedAs: ['x-craftabot-verdicts', 'the Gate’s bundle'],
		configuredBy: 'craftabot gate serve --mode shadow',
		since: 'WP127'
	}),
	m({
		id: 'gate/enforce',
		name: 'The Gate enforcing',
		summary:
			'A stack refuses, stops, holds for approval or redacts an agent’s traffic on the chat-completions wire.',
		where: ['packages/gate/src/gate.ts'],
		observedAs: ['x-craftabot-verdicts', 'the Gate’s bundle'],
		configuredBy: 'craftabot gate serve --mode enforce',
		since: 'WP127'
	}),
	m({
		id: 'gate/loopback',
		name: 'The Gate’s loopback bind and single upstream',
		summary: 'The Gate binds loopback unless told otherwise and calls one declared upstream host.',
		where: ['packages/gate/src/server.ts', 'packages/gate/src/gate.ts'],
		observedAs: ['the serve command’s refusal'],
		configuredBy: 'craftabot gate serve --allow-remote',
		since: 'WP127'
	}),
	// ------------------------------------------------------------------ the monitor pack
	m({
		id: 'monitor/group-circuit-breaker',
		name: 'The group circuit breaker',
		summary:
			'A group episode is stopped after a set number of refusals, before a failure cascades.',
		where: ['packages/packs/monitor/src/rules.ts'],
		observedAs: ['guardrail.tripped'],
		configuredBy: 'a stack’s group refusalLimit',
		since: 'WP48'
	}),
	m({
		id: 'monitor/watch-rules',
		name: 'The Watchbot’s rules',
		summary:
			'Going in circles, all talk and a refusal storm, flagged by a second seat watching the trace.',
		where: ['packages/packs/monitor/src/rules.ts'],
		observedAs: ['guardrail.checked'],
		configuredBy: 'a stack’s group watchFor',
		since: 'WP48'
	}),
	// ------------------------------------------------------------------ the folds
	m({
		id: 'evals/campaign',
		name: 'Campaigns and their gates',
		summary:
			'A bot over a matrix of scenarios, guards and seeds, gated on what it did; the shipped ones run in CI.',
		where: ['packages/evals/src/campaign.ts'],
		observedAs: ['/workshop/campaigns', 'the campaign report'],
		since: 'WP38'
	}),
	m({
		id: 'evals/evaluators',
		name: 'Evaluators',
		summary:
			'A judgement over a finished run — a check, a rubric or a hosted judge — recorded beside it and read by a campaign’s gates.',
		where: ['packages/core/src/types/evaluator.ts', 'packages/evals/src/evaluators.ts'],
		observedAs: ['/workshop/evaluators', 'evaluation records', 'the campaign report'],
		configuredBy: 'a campaign’s evaluators and gates',
		since: 'WP43'
	}),
	m({
		id: 'evals/adversary',
		name: 'The adversary tier',
		summary: 'Scripted adversaries and the red-team seat probe a bot inside a campaign.',
		where: ['packages/evals/src/campaign.ts', 'packages/desk/src/red-team.ts'],
		observedAs: ['the campaign report'],
		since: 'WP38'
	}),
	m({
		id: 'evals/benchmark',
		name: 'The benchmark',
		summary:
			'Every guard on the same adversarial rows, with precision and recall and their intervals.',
		where: ['packages/evals/src/benchmark.ts'],
		observedAs: ['/workshop/benchmarks'],
		since: 'WP123'
	}),
	m({
		id: 'evals/experiment',
		name: 'Experiments',
		summary:
			'Factors and levels over a template, analysed into effects with intervals and a verdict.',
		where: ['packages/evals/src/experiment.ts'],
		observedAs: ['/workshop/experiments'],
		since: 'WP89'
	}),
	m({
		id: 'evals/monitor',
		name: 'The Monitor',
		summary: 'The bank’s rates, fairness, drift and incidents over a window of a clocked day.',
		where: ['packages/evals/src/monitor.ts'],
		observedAs: ['/workshop/monitor'],
		since: 'WP84'
	}),
	m({
		id: 'governance/control-effectiveness',
		name: 'The Control Effectiveness Register',
		summary:
			'Which control changed what, by how much and how sure, folded from experiment results.',
		where: ['packages/governance/src/reports/control-effectiveness.ts'],
		observedAs: ['/workshop/assurance'],
		since: 'WP90'
	}),
	m({
		id: 'governance/assurance-pack',
		name: 'The assurance pack',
		summary: 'An SS1/23-shaped pack a reviewer opens with no app, digested.',
		where: ['packages/governance/src/reports/assurance-pack.ts'],
		observedAs: ['/workshop/assurance', 'craftabot assurance'],
		since: 'WP67'
	}),
	m({
		id: 'governance/safety-case',
		name: 'The safety case',
		summary:
			'A structured argument with its evidence: claims, gates and the campaign results behind them.',
		where: ['packages/governance/src/reports/safety-case.ts'],
		observedAs: ['/workshop/safety-case'],
		since: 'WP49'
	}),
	m({
		id: 'governance/incidents',
		name: 'Incidents',
		summary: 'What went wrong, when, and what the bot saw and decided at that tick.',
		where: ['packages/governance/src/reports/incidents.ts'],
		observedAs: ['/workshop/incidents'],
		since: 'WP49'
	}),
	m({
		id: 'governance/explain',
		name: 'Explain this decision',
		summary: 'What a bot saw, was offered and chose at a tick, and what checked it.',
		where: ['packages/governance/src/reports/decision-explanation.ts'],
		observedAs: ['the Run Lab’s Explain'],
		since: 'WP66'
	}),
	m({
		id: 'governance/otel',
		name: 'The OpenTelemetry mapping',
		summary: 'Runs, tools and guardrail verdicts as GenAI spans for any OTLP collector.',
		where: ['packages/telemetry/src/otel.ts'],
		observedAs: ['/workshop/sinks'],
		since: 'WP47'
	}),
	m({
		id: 'metrics/drift',
		name: 'Drift statistics',
		summary:
			'PSI, Kolmogorov–Smirnov, outcome mix, agreement and fairness drift, and Page–Hinkley.',
		where: ['packages/metrics/src/drift.ts'],
		observedAs: ['/workshop/model-risk', 'the drift gate'],
		since: 'WP76'
	}),
	m({
		id: 'metrics/fairness',
		name: 'Fairness metrics',
		summary: 'Nine parity and agreement metrics with intervals, over cohorts or a matched pair.',
		where: ['packages/metrics/src/fairness.ts'],
		observedAs: ['/workshop/model-risk', 'the parity gate'],
		since: 'WP76'
	}),
	m({
		id: 'metrics/human-load',
		name: 'Human load',
		summary:
			'Touches, unattended rate, ceiling breaches, approvals, catch rate and minutes per case.',
		where: ['packages/metrics/src/human-load.ts'],
		observedAs: ['the campaign report', '/workshop/monitor'],
		since: 'WP80'
	}),
	m({
		id: 'metrics/calibration',
		name: 'Calibration',
		summary: 'The reliability table, ECE, Brier score and the gate curve over a reader’s readings.',
		where: ['packages/metrics/src/calibration.ts'],
		observedAs: ['the Campaigns screen’s calibration pane'],
		since: 'WP118'
	}),
	m({
		id: 'governance/control-maps',
		name: 'The control maps and the obligation vocabulary',
		summary:
			'Rows of relevance from frameworks to evidence, every id resolving, every row read or counted.',
		where: [
			'packages/governance/src/reports/control-map.ts',
			'packages/packs/fs-bank/src/obligations.ts'
		],
		observedAs: ['/workshop/assurance'],
		since: 'WP67'
	})
];

const BY_ID = new Map(CONTROL_MECHANISMS.map((mechanism) => [mechanism.id, mechanism]));

/** The mechanism with this id, or `undefined`. */
export function getControlMechanism(id: string): ControlMechanism | undefined {
	return BY_ID.get(id);
}
