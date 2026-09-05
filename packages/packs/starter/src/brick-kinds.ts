import {
	serviceLineToolId,
	type ServiceLine,
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchemaV2,
	senseBrickSchema,
	toolsBrickSchema,
	type BrickConfigProblem,
	type BrickKindDefinition
} from '@craftabot/core';
import {
	compilePolicyCard,
	createActionBlocklistGuardrail,
	createApprovalModeGuardrail,
	createNoRepetitionGuardrail,
	createStepBudgetGuardrail,
	createTokenBudgetGuardrail,
	createToolBlocklistGuardrail
} from '@craftabot/governance';
import { z } from 'zod';
import { starterBricks } from './bricks.js';
import { connectorStrings, ifThenStrings, librarianStrings, plannerStrings } from './strings.js';
import { BOOKS, type BookId } from './world/bookshelf.js';
import { qualifyPlayroomId } from './world/playroom.js';
import { weatherLine } from './world/service-lines.js';

/**
 * **The six V1 bricks, ported onto the open contract** (`14-…` §2, WP14).
 *
 * Each of these already existed twice over: as pure presentation data in
 * `bricks.ts`, and as a config shape hard-coded into `AgentSpec` in core. The
 * contract is what lets a pack own both halves — which is the difference
 * between "the box contains six bricks" and "the box contains six bricks *and
 * you can make a seventh*".
 *
 * The config schemas are the ones core already had, re-exported and attached to
 * their kind rather than redeclared: this slice is deliberately additive, so
 * the engine still reads the v1 spec and behaviour cannot change. The defaults
 * are the ones the workbench has been carrying in `BRICK_DEFAULTS`, brought
 * here so there is one answer to "what does a freshly-snapped brick do?".
 *
 * > **Amended 2026-08-13 (WP14 slice 3a):** the kinds now carry `describeFitted`
 * > and, where they have live behaviour, `createRuntime`. Both were previously
 * > `if` branches in core — `describeFittedBricks` knew all six bricks by name,
 * > and the loop read `spec.bricks.llm?.personality` directly. A seventh brick
 * > could join neither. The strings are moved verbatim, because slice 3's gate
 * > is that a golden trace stays byte-stable.
 */

/** The window sizes the Memory brick offers, spelled as the prompt says them. */
function describeMemory(config: { windowSize: number; notebook: boolean }): string {
	return config.notebook
		? `memory of your last ${config.windowSize} turns, and a notebook`
		: `memory of your last ${config.windowSize} turns`;
}

/** The presentation half, so the toy and real names are not written twice. */
function facesOf(id: string) {
	const brick = starterBricks.find((candidate) => candidate.id === id);
	if (!brick) throw new Error(`No brick presentation data for "${id}"`);
	return {
		name: brick.name,
		description: brick.description,
		realName: brick.realName,
		realExplanation: brick.realExplanation
	};
}

/**
 * **The Radio brick** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.7) — the first
 * brick this pack ships *after* the open contract, so unlike the six above it
 * carries its own presentation directly rather than through `facesOf()`
 * (`bricks.ts`'s own note on why).
 *
 * `channel` (which board this bot listens to) and `allowFrom` (which senders
 * on it count as authenticated; absent means "anyone") are the two dials
 * `14-…` §5.4 named. Both reach the Playroom through `contributeWorldConfig`
 * — the door `AgentHandle` itself deliberately never carries a brick's own
 * config through (`types/world.ts`) — keyed by the same qualified ids
 * `contributeCalls`/`contributeSenses` name below, so `senses.ts`/`actions.ts`
 * can look a bot's own config up by the one thing they are ever handed: which
 * agent is asking.
 */
const radioConfigSchema = z.object({
	channel: z.string().min(1),
	/**
	 * Raw agent ids, not names — `describeFitted` below only ever reports a
	 * *count* ("trusting 1 other robot") rather than resolving them, because a
	 * `BrickKindDefinition`'s own hooks are handed a brick's config and
	 * nothing else: no registry, no fellow agent's own record to read a name
	 * off. Full ids in the prompt would be true and useless; a count is both.
	 */
	allowFrom: z.array(z.string()).optional()
});

type RadioBrickConfig = z.infer<typeof radioConfigSchema>;

const radioBrickKind: BrickKindDefinition<RadioBrickConfig> = {
	id: 'starter/radio',
	slot: 'equipment',
	name: 'Radio Brick',
	description: 'Send and hear short messages with another robot on the same channel.',
	realName: 'Inter-agent messaging',
	realExplanation:
		"A message board the world hosts: sending appends to it, listening reads whatever has arrived since this bot last checked, narrowed to its own channel and, if set, to senders it trusts. Every message is attributed by the engine itself, honestly, regardless of what the message's own text claims — the distinction a real multi-agent system also has to get right between who sent something and who a message says sent it.",
	configSchema: radioConfigSchema,
	configVersion: 1,
	defaults: { channel: 'shared' },
	describeFitted: (config) =>
		config.allowFrom !== undefined && config.allowFrom.length > 0
			? `listens on channel "${config.channel}", trusting ${config.allowFrom.length === 1 ? 'one other robot' : `${config.allowFrom.length} other robots`}`
			: `listens on channel "${config.channel}"`,
	createRuntime: (config) => ({
		contributeCalls: () => ({ actionIds: [qualifyPlayroomId('radio_send')] }),
		contributeSenses: () => [qualifyPlayroomId('radio')],
		contributeWorldConfig: () => ({
			[qualifyPlayroomId('radio')]: { channel: config.channel, allowFrom: config.allowFrom }
		})
	})
};

const plannerConfigSchema = z.object({
	maxSteps: z.number().int().min(1).max(10).default(5),
	replanOn: z.enum(['failure', 'never']).default('failure')
});

type PlannerBrickConfig = z.infer<typeof plannerConfigSchema>;

/** The two tool ids' *wire* names — what a call actually arrives named as (`14-…` §2.1: providers never see the pack prefix). */
const MAKE_PLAN = 'make_plan';
const CHECK_OFF_STEP = 'check_off_step';

/** What `make_plan`'s own arguments look like once past its tool schema — re-validated here because `onTickEnd` gets the raw call, not the tool's already-parsed result (`tools/make-plan.ts`'s own note on why the two are separate). */
const planArgsSchema = z.object({ steps: z.array(z.string()) });
const checkOffArgsSchema = z.object({ index: z.number() });

/**
 * The Planner's own live state (WP30 stage C, `contributeState`) — the
 * structured counterpart to `renderChecklist`'s prose: the same plan and
 * done-set, exported so the workbench can type its own `brick.state`
 * projection instead of trusting `state: unknown` at every call site.
 *
 * `done` is parallel to `steps`, not a set of indices, so a UI can zip the
 * two arrays without a second lookup — the wire-friendliest shape, since
 * `unknown` crosses the event boundary with no guarantee a `Set` even
 * round-trips through it.
 */
export interface PlannerState {
	steps: string[];
	done: boolean[];
	notice?: string;
}

/**
 * **The Planner brick** (WP30 stage B, `14-…` §5.1) — the second brick to
 * join a socket the open contract didn't have a home for (`types/brick.ts`'s
 * own `'planner'` amendment, WP30 stage A), and, like Radio, carries its own
 * presentation directly (`bricks.ts`'s note on why) — pulled from
 * `plannerStrings` rather than inlined, unlike Radio's own literals, because
 * `strings.ts`'s header comment already claims to be "every user-facing
 * string this pack produces" and this brick takes that literally.
 *
 * Stage B needed no core change beyond stage A's socket and the small,
 * additive `TickRecord.call`/`.ok` widening `onTickEnd` now reads —
 * `contributeCalls`, `contributeContext` and `onTickEnd` were each already
 * exactly the hook this brick needed, once a runtime could tell *what* was
 * attempted and *whether* it worked (`24-…`-style finding, recorded properly
 * in `18-…` §7 at close-out). Stage C needed one more: `contributeState`
 * (`types/brick.ts`), because `contributeContext`'s prose is the only place
 * this brick's state existed before, and a UI reading it structurally would
 * have had to parse `plannerStrings`' own copy — brittle in a way a typed
 * `brick.state` event (`02-…` §7) is not.
 *
 * `make_plan`/`check_off_step` are ordinary tools — `contributeCalls` offers
 * them regardless of whether a Tool Belt is fitted at all, exactly as Radio's
 * `radio_send` already does from a different slot — but their own `execute()`
 * cannot update *this bot's* plan: tools are registered once, pack-wide,
 * shared by every bot that has one fitted, with no way back to one bot's own
 * brick-runtime closure. The plan itself is closure state instead, read and
 * written entirely from `onTickEnd`, which already receives the full call
 * (name, arguments) and outcome (ok) for every tick regardless of which tool
 * or action it was — the same "ask the record, not the tool" shape that
 * keeps this brick from needing anything new beyond the one widening above.
 */
const plannerBrickKind: BrickKindDefinition<PlannerBrickConfig> = {
	id: 'starter/planner',
	slot: 'planner',
	name: plannerStrings.name,
	description: plannerStrings.description,
	realName: plannerStrings.realName,
	realExplanation: plannerStrings.realExplanation,
	configSchema: plannerConfigSchema,
	configVersion: 1,
	defaults: { maxSteps: 5, replanOn: 'failure' },
	describeFitted: (config) => plannerStrings.describeFitted(config.maxSteps, config.replanOn),
	createRuntime: (config) => {
		/** In plan order — index 0 is "step 1" on the checklist a builder (and the model) reads. */
		let plan: string[] = [];
		/** 0-based indices into `plan` that have been checked off. */
		const done = new Set<number>();
		/** A one-shot note for the *next* tick's checklist — cleared the moment it is read, same as `run.feedback`'s own shape. */
		let notice: string | undefined;

		function renderChecklist(): string {
			if (plan.length === 0) return plannerStrings.noPlanYet(config.maxSteps);
			const lines = plan
				.map((step, index) => plannerStrings.stepLine(done.has(index), index + 1, step))
				.join('\n');
			return plannerStrings.checklist(lines);
		}

		return {
			contributeCalls: () => ({ toolIds: ['starter/make_plan', 'starter/check_off_step'] }),
			contributeContext: () => {
				const sections = [renderChecklist()];
				if (notice !== undefined) {
					sections.push(notice);
					notice = undefined;
				}
				return { sections };
			},
			/*
			 * Reads `notice` without clearing it — `contributeContext` above is
			 * the one consumer that gets to do that, at the *start* of the next
			 * tick. This runs at the *end* of the current one (`collectState`,
			 * right after `onTickEnd`), so what it reports here is exactly what
			 * the next prompt will show — a live widget and the prompt can never
			 * disagree about what the bot currently believes its plan is.
			 */
			contributeState: (): PlannerState => ({
				steps: [...plan],
				done: plan.map((_, index) => done.has(index)),
				...(notice !== undefined ? { notice } : {})
			}),
			onTickEnd: (record) => {
				if (record.call === undefined || record.refused !== undefined) {
					// Nothing was attempted, or a guardrail stopped it before it ran —
					// either way `ok` is never set alongside either case, so there is
					// nothing here for a failed-action nudge to react to.
					return;
				}

				if (record.call.name === MAKE_PLAN) {
					const parsed = planArgsSchema.safeParse(record.call.arguments);
					if (!parsed.success) return;
					const steps = parsed.data.steps.map((step) => step.trim()).filter((step) => step !== '');
					if (steps.length === 0) return;
					if (steps.length > config.maxSteps) {
						plan = steps.slice(0, config.maxSteps);
						notice = plannerStrings.tooManySteps(config.maxSteps);
					} else {
						plan = steps;
						notice = undefined;
					}
					done.clear();
					return;
				}

				if (record.call.name === CHECK_OFF_STEP) {
					const parsed = checkOffArgsSchema.safeParse(record.call.arguments);
					if (!parsed.success) return;
					const index = parsed.data.index - 1;
					if (index < 0 || index >= plan.length) {
						notice = plannerStrings.invalidCheckOff;
						return;
					}
					done.add(index);
					return;
				}

				// Some other tool or action — the replan nudge still applies to it.
				if (config.replanOn === 'failure' && record.ok === false) {
					notice = plannerStrings.replanNudge;
				}
			}
		};
	}
};

/** One "IF you see X THEN do Y" rule. */
const ifThenRuleSchema = z.object({
	/**
	 * A word or phrase to look for in what the bot currently senses — a plain
	 * substring match against `Observation.text`, not a structured predicate.
	 *
	 * `PredicateExpr` (`14-…` §4.6) was the first thing sizing this brick
	 * reached for, and turned out to be the wrong tool: it is deliberately
	 * scoped to a *proposed call* and *usage* — "nothing here can reach world
	 * state", by its own doc comment — so a policy card stays auditable by
	 * reading it. A rule that fires on what the bot currently *senses* is a
	 * different question in a different domain, and `Observation.data` has no
	 * structured, world-agnostic field to match against even if it were the
	 * right one — the Playroom's own sight channel only ever puts a position
	 * in `data`, never an item list (`world/senses.ts`). `Observation.text` is
	 * the one thing every world guarantees, and it already names what it
	 * describes in plain words ("a red key"), which is what makes a literal
	 * substring match both the simplest implementation and an honest one: the
	 * rule fires on exactly the words the bot itself would have read.
	 */
	ifSees: z.string().min(1),
	then: z.object({
		kind: z.enum(['tool', 'action']),
		name: z.string().min(1),
		arguments: z.record(z.string(), z.unknown()).default({})
	})
});
type IfThenRule = z.infer<typeof ifThenRuleSchema>;

const ifThenConfigSchema = z.object({
	rules: z.array(ifThenRuleSchema).default([])
});
type IfThenBrickConfig = z.infer<typeof ifThenConfigSchema>;

/**
 * **The If/Then brick** (`14-…` §5.2) — like Planner before it, a brick that
 * needed a genuinely new, dormant socket (`'reflexes'`, mobility-adjacent),
 * not the free ride sizing this brick first assumed. `mobility` has no
 * core-owned slot contract, which is true and made it *look* like the "two
 * kinds, one slot" shape WP31 proved for `equipment` (Radio + Tools) — but
 * that shape has only ever meant a builder chooses *one* of two registered
 * kinds for one socket, never both fitted at once (V1's one-brick-per-socket
 * rule, `14-…` §2.3), and If/Then genuinely needs to coexist with Actions,
 * not replace it. A failing build check caught the mistake before it shipped
 * (`types/brick.ts`'s own dated amendment on `SLOT_IDS` carries the correction).
 *
 * What this brick needed that nothing before it did is `contributeReflex`
 * (the sizing pass's own finding, `types/brick.ts`, `02-…` §5/§7's dated
 * amendments): the whole point of "evaluated before the brain" is that a
 * firing rule costs no tokens and no latency, which only a real short-circuit
 * in the loop itself can deliver — a rule folded into `contributeContext`'s
 * prose would still call the brain every tick. The rule list is this brick's
 * entire runtime: no tools, no actions, no prompt section of its own, because
 * a firing reflex means the model is never shown a prompt to read one from.
 */
const ifThenBrickKind: BrickKindDefinition<IfThenBrickConfig> = {
	id: 'starter/if-then',
	slot: 'reflexes',
	name: ifThenStrings.name,
	description: ifThenStrings.description,
	realName: ifThenStrings.realName,
	realExplanation: ifThenStrings.realExplanation,
	configSchema: ifThenConfigSchema,
	configVersion: 1,
	defaults: { rules: [] },
	describeFitted: (config) => ifThenStrings.describeFitted(config.rules.length),
	validateConfig: (config, ctx) =>
		config.rules
			.filter((rule) => {
				const exists =
					rule.then.kind === 'tool' ? ctx.hasTool(rule.then.name) : ctx.hasAction(rule.then.name);
				return !exists;
			})
			.map((rule) => ({
				code: 'unknown-if-then-target' as const,
				severity: 'warning' as const,
				message: ifThenStrings.unknownTarget(rule.then.name, rule.then.kind),
				details: { name: rule.then.name, kind: rule.then.kind }
			})),
	createRuntime: (config) => ({
		contributeReflex: (context) => {
			const text = context.observation.text.toLowerCase();
			const rule = findFiringRule(config.rules, text);
			if (!rule) return undefined;
			return {
				kind: rule.then.kind,
				name: rule.then.name,
				arguments: rule.then.arguments,
				thought: ifThenStrings.ruleFired(rule.ifSees)
			};
		}
	})
};

/** The first rule (in list order) whose `ifSees` appears in the current observation. */
function findFiringRule(rules: IfThenRule[], observedText: string): IfThenRule | undefined {
	return rules.find((rule) => observedText.includes(rule.ifSees.toLowerCase()));
}

const BOOK_IDS = BOOKS.map((book) => book.id);

const librarianConfigSchema = z.object({
	// The same three fields `memoryBrickSchema` requires, so a Librarian-fitted
	// bot keeps the turn-window memory the loop reads through the `memory`
	// slot contract (`slot-contracts.ts`) — core reads `windowSize`/`notebook`
	// off whatever is fitted there, not off `starter/memory` by name, and a
	// config shaped differently would be fitted, validated, and then ignored.
	windowSize: z.union([z.literal(3), z.literal(10), z.literal(30)]).default(10),
	notebook: z.boolean().default(false),
	/**
	 * Deliberately `string[]`, not a closed enum of `BOOK_IDS`: a book nobody's
	 * shelf carries is a *content* mistake, the same shape as an If/Then rule
	 * naming a tool nothing installed — a `validateConfig` warning, not a
	 * schema failure that blocks GO. An enum here would upgrade a typo'd book
	 * id to `bad-brick-config` (blocking) and make `validateConfig`'s own
	 * `unknown-book` check unreachable dead code.
	 */
	books: z.array(z.string()).default([])
});
type LibrarianBrickConfig = z.infer<typeof librarianConfigSchema>;

/**
 * **The Librarian brick** (WP32 stage A, `14-…` §5.5) — the `memory` slot's
 * second registered kind, the same "a builder picks one" shape `equipment`
 * already has (Radio + Tools; If/Then's own sizing found the hard way that
 * this never means "both fitted at once," `types/brick.ts`'s dated
 * amendment on `SLOT_IDS`). Unlike `mobility`/`equipment`, `memory` carries
 * a core-owned slot contract (`memorySlotSchema`), so this brick's config is
 * a superset of the Scrapbook's own — `windowSize`/`notebook` plus `books` —
 * rather than a smaller, retrieval-only replacement: fitting it should never
 * be the thing that silently empties a bot's turn-window memory.
 *
 * `books` selects a subset of a small, fixed catalogue (`world/bookshelf.ts`)
 * the same way the Tools brick's own `enabled` selects a subset of its
 * catalogue — and the scoping happens at exactly that layer, not inside a
 * tool's own `execute()`. A tool is registered once, pack-wide, shared by
 * every bot that has one fitted (`ToolContext` carries only
 * `tick`/`notebook`/`random`, nothing brick-specific — the same reason the
 * Planner's own tools keep their state in this brick's closure rather than
 * in `execute()`). One tool per book, only ever offered through
 * `contributeCalls` when its book is on the shelf, means a book nobody
 * configured was never a tool a model could even see, not a request an
 * argument check had to catch after the fact.
 */
const librarianBrickKind: BrickKindDefinition<LibrarianBrickConfig> = {
	id: 'starter/librarian',
	slot: 'memory',
	name: librarianStrings.name,
	description: librarianStrings.description,
	realName: librarianStrings.realName,
	realExplanation: librarianStrings.realExplanation,
	configSchema: librarianConfigSchema,
	configVersion: 1,
	defaults: { windowSize: 10, notebook: false, books: [] },
	describeFitted: (config) => {
		const titles = config.books.map(
			(bookId) => BOOKS.find((book) => book.id === bookId)?.title ?? bookId
		);
		return librarianStrings.describeFitted(config.windowSize, config.notebook, titles);
	},
	validateConfig: (config) =>
		config.books
			.filter((bookId) => !(BOOK_IDS as string[]).includes(bookId))
			.map((bookId) => ({
				code: 'unknown-book' as const,
				severity: 'warning' as const,
				message: librarianStrings.unknownBook(bookId),
				details: { bookId }
			})),
	createRuntime: (config) => ({
		// Only ever offers a tool for a book the catalogue actually has — an
		// unknown book id is `validateConfig`'s own warning above, not a bogus
		// tool id for core's generic `contributeCalls` check to catch as a
		// second, more confusing `unknown-tool` problem.
		contributeCalls: () => ({
			toolIds: config.books
				.filter((bookId): bookId is BookId => (BOOK_IDS as string[]).includes(bookId))
				.map((bookId) => `starter/library_${bookId}`)
		})
	})
};

const connectorConfigSchema = z.object({
	/** Empty means "brick fitted, no line chosen yet" — the same normal, saveable half-built state `llmBrickSchema`'s own empty `cartridgeId` is. */
	serviceId: z.string().default(''),
	/**
	 * Operation ids this bot may actually use on `serviceId`'s own line —
	 * `string[]`, not a closed enum, for the same reason the Librarian's own
	 * `books` is (`brick-kinds.ts`'s note on that field): an unknown scope is
	 * a `validateConfig` warning, not a schema failure that blocks GO.
	 */
	scopes: z.array(z.string()).default([])
});
type ConnectorBrickConfig = z.infer<typeof connectorConfigSchema>;

/**
 * **The Connector brick** (WP32 stage B, `14-…` §5.6) — `equipment`'s third
 * registered kind, a builder's choice alongside Tools and Radio (`14-…`
 * §5.5's own note on what "two kinds, one slot" actually means, corrected
 * during If/Then's own sizing).
 *
 * `contributeCalls` offers every operation the *connected service* has,
 * regardless of `scopes` — reach is what the connection grants. `scopes` is
 * enforced separately, by a `pre-act` guardrail built from a tool blocklist
 * (`@craftabot/governance`'s `createToolBlocklistGuardrail`, WP32 stage B's
 * own addition, `tools/connector.ts`'s doc comment carries the full
 * reasoning): the blocked set is every operation the connected service
 * offers that `scopes` does *not* name, computed fresh from this bot's own
 * config, so an unauthorised attempt is a visible, narrated refusal rather
 * than a tool that silently never existed.
 *
 * No new core mechanism, confirming the sizing pass's own guess:
 * `contributeCalls` and `contributeGuardrails` were each already exactly
 * the hook this brick needed, the same way they were for the Librarian
 * (`14-…` §5.5's own dated amendment).
 */
const connectorBrickKind: BrickKindDefinition<ConnectorBrickConfig> = {
	id: 'starter/connector',
	slot: 'equipment',
	name: connectorStrings.name,
	description: connectorStrings.description,
	realName: connectorStrings.realName,
	realExplanation: connectorStrings.realExplanation,
	configSchema: connectorConfigSchema,
	configVersion: 1,
	defaults: { serviceId: '', scopes: [] },
	// The line picker lists every registered line (WP58, `47-…` §4.1); scopes stay an id list (§8).
	controlHints: { serviceId: { control: 'choice', source: 'serviceLines' } },
	describeFitted: (config) => {
		// No context here (`47-…` §8): the starter names its own line; another
		// pack's shows by its id.
		const line = lineFor(config.serviceId, undefined);
		const scopeNames = config.scopes
			.map((scopeId) => line?.operations.find((op) => op.id === scopeId)?.name ?? scopeId)
			.filter((name): name is string => name !== undefined);
		return connectorStrings.describeFitted(
			line?.name ?? (config.serviceId === '' ? undefined : config.serviceId),
			scopeNames
		);
	},
	validateConfig: (config, ctx) => {
		if (config.serviceId === '') return [];
		// A line from any installed pack (WP58, `47-…` §4.1): the registry's, or
		// — on a host that predates the contract — the starter's own.
		const line = lineFor(config.serviceId, ctx?.getServiceLine);
		if (!line) {
			const problem: BrickConfigProblem = {
				code: 'unknown-service',
				severity: 'warning',
				message: connectorStrings.unknownService(config.serviceId),
				details: { serviceId: config.serviceId }
			};
			return [problem];
		}
		const known = new Set(line.operations.map((op) => op.id));
		return config.scopes
			.filter((scopeId) => !known.has(scopeId))
			.map((scopeId): BrickConfigProblem => ({
				code: 'unknown-scope',
				severity: 'warning',
				message: connectorStrings.unknownScope(scopeId, config.serviceId),
				details: { scopeId, serviceId: config.serviceId }
			}));
	},
	createRuntime: (config, ctx) => {
		const line =
			config.serviceId === '' ? undefined : lineFor(config.serviceId, ctx.getServiceLine);
		const packId = line ? packIdOf(line.id) : 'starter';
		const toolIds = line
			? line.operations.map((op) => serviceLineToolId(packId, line.id, op.id))
			: [];
		return {
			contributeCalls: () => ({ toolIds }),
			contributeGuardrails: () => {
				if (!line) return [];
				const blocked = line.operations
					.filter((op) => !config.scopes.includes(op.id))
					.map((op) => serviceLineToolId(packId, line.id, op.id));
				if (blocked.length === 0) return [];
				return [createToolBlocklistGuardrail(blocked)];
			}
		};
	}
};

/**
 * The line a Connector's `serviceId` names (WP58): a bare `weather` is the
 * starter's own `starter/weather` — the id every kit written since WP32
 * carries — and a qualified id is any installed pack's, through the
 * registry when the host offers it.
 */
function lineFor(
	serviceId: string,
	getServiceLine: ((id: string) => ServiceLine | undefined) | undefined
): ServiceLine | undefined {
	const qualified = serviceId.includes('/') ? serviceId : `starter/${serviceId}`;
	return getServiceLine?.(qualified) ?? (qualified === weatherLine.id ? weatherLine : undefined);
}

/** `fs-bank/crm` → `fs-bank`; a line's tools carry its pack's id. */
function packIdOf(lineId: string): string {
	const slash = lineId.lastIndexOf('/');
	return slash === -1 ? 'starter' : lineId.slice(0, slash);
}

/**
 * Re-qualifies whatever bare, pre-qualification ids a v1 config carries —
 * `starter/sense`'s `channels` and `starter/actions`' `enabled` share this,
 * one array of strings each. An id that already has a `/` in it (this
 * world's own qualified form, or another world's) is left exactly as it
 * was; only a plain local id like `'move'` gets `qualifyPlayroomId`'s prefix.
 */
function requalify(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((id) =>
		typeof id === 'string' && !id.includes('/') ? qualifyPlayroomId(id) : id
	);
}

export const starterBrickKinds: BrickKindDefinition[] = [
	{
		id: 'starter/llm',
		slot: 'brain',
		...facesOf('starter/llm'),
		configSchema: llmBrickSchema,
		configVersion: 1,
		defaults: { cartridgeId: '', temperature: 0.7, maxTokens: 300, personality: '' },
		describeFitted: () => 'a brain (LLM)',
		/*
		 * The personality, and nothing else.
		 *
		 * The rest of this brick's config — cartridge, temperature, token budget —
		 * is not a *contribution*: it configures the call the engine makes rather
		 * than adding anything to the prompt. The brain is the one brick that
		 * drives the loop instead of contributing to it, so core reads those
		 * fields from the brick in the `brain` socket. Core knows a brain has a
		 * cartridge (it owns the slot families); it does not know which brain.
		 */
		createRuntime: (config: { personality: string }) => ({
			contributeContext: () =>
				config.personality.trim() === ''
					? {}
					: { sections: [`About you: ${config.personality.trim()}`] }
		})
	} as BrickKindDefinition,
	{
		id: 'starter/memory',
		slot: 'memory',
		...facesOf('starter/memory'),
		configSchema: memoryBrickSchema,
		configVersion: 1,
		defaults: { windowSize: 10, notebook: false },
		describeFitted: describeMemory
	} as BrickKindDefinition,
	{
		id: 'starter/tools',
		slot: 'equipment',
		...facesOf('starter/tools'),
		configSchema: toolsBrickSchema,
		configVersion: 1,
		defaults: { enabled: [] },
		// A belt with nothing on it is not worth telling the bot about.
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'a tool belt' : '',
		/*
		 * The belt names what is on it; core resolves each id against the
		 * registry and dispatches it. A tool the workbench has not got, and a
		 * notebook tool with no notebook to write in, are dropped there rather
		 * than here — both are already build problems the ribbon has reported,
		 * and the brick has no way to know about the Memory brick anyway.
		 */
		createRuntime: (config: { enabled: string[] }) => ({
			contributeCalls: () => ({ toolIds: config.enabled })
		})
	} as BrickKindDefinition,
	{
		id: 'starter/sense',
		slot: 'perception',
		...facesOf('starter/sense'),
		configSchema: senseBrickSchema,
		configVersion: 2,
		/**
		 * v1 → v2 (found live: a bot built before channel ids were qualified
		 * with their world's own prefix kept a bare `sight`/`hearing`/… forever
		 * — nothing ever re-visited a saved config, so `registry.getSenseChannel`
		 * looked up a channel that was never registered under that bare name,
		 * and the ribbon reported a correctly-fitted brick as "not installed").
		 * Only a bare id (no `/` in it already) is qualified — an id already
		 * qualified for this world or another one passes through unchanged.
		 */
		migrateConfig: {
			1: (raw) => ({ ...raw, channels: requalify(raw.channels) })
		},
		defaults: { channels: [qualifyPlayroomId('sight'), qualifyPlayroomId('compass')] },
		describeFitted: (config: { channels: string[] }) =>
			config.channels.length > 0 ? 'senses' : '',
		/*
		 * Which channels the visor opens. What each one *shows* is the world's
		 * business — a brick that returned observations would be a second way of
		 * seeing alongside `WorldInstance.observe`.
		 */
		createRuntime: (config: { channels: string[] }) => ({
			contributeSenses: () => config.channels
		})
	} as BrickKindDefinition,
	{
		id: 'starter/actions',
		slot: 'mobility',
		...facesOf('starter/actions'),
		configSchema: actionsBrickSchema,
		configVersion: 2,
		/** v1 → v2 — the same fix as `starter/sense`'s own note, for `enabled`. */
		migrateConfig: {
			1: (raw) => ({ ...raw, enabled: requalify(raw.enabled) })
		},
		defaults: {
			enabled: ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'].map(
				qualifyPlayroomId
			)
		},
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'hands and wheels' : '',
		/*
		 * Which of the world's actions this bot was built to perform.
		 *
		 * The distinction core keeps is between an action the world *has* and one
		 * this bot *can do*: the first gets "you have not been built with any way
		 * to do it", the second simply happens. Taking a capability away is what
		 * the checkboxes are for.
		 */
		createRuntime: (config: { enabled: string[] }) => ({
			contributeCalls: () => ({ actionIds: config.enabled })
		})
	} as BrickKindDefinition,
	{
		id: 'starter/safety',
		slot: 'safety',
		...facesOf('starter/safety'),
		configSchema: safetyBrickSchemaV2,
		configVersion: 2,
		/**
		 * v1 → v2 (`14-…` §4.6, WP24): the boolean `approvalMode` becomes the
		 * three-way `approval` dial, `true`/`false` mapping onto its two ends —
		 * `'risky'` is new ground nobody's old kit file could have meant. Every
		 * other field is untouched, so it is dropped in and picked back up
		 * unchanged rather than re-listed field by field.
		 */
		migrateConfig: {
			1: (raw) => {
				const { approvalMode, ...rest } = raw;
				return { ...rest, approval: approvalMode ? 'everything' : 'off' };
			}
		},
		defaults: {
			maxTicks: 30,
			blockedActions: [],
			approval: 'off',
			repeatLimit: 3,
			policyCards: []
		},
		describeFitted: (config: { policyCards?: string[] }) =>
			config.policyCards && config.policyCards.length > 0
				? `a safety brick watching over you, with ${config.policyCards.length} extra ${config.policyCards.length === 1 ? 'rule' : 'rules'} slotted in`
				: 'a safety brick watching over you',
		/*
		 * A blocklist naming an action nobody installed, or a policy card nobody
		 * shipped (WP14 slice 3d; policy cards added WP22).
		 *
		 * Core used to run the blocklist half of this check itself, by reading
		 * `spec.bricks.safety` — one of the six special cases only the six V1
		 * bricks could ever have. It cannot be generic, because neither field is
		 * something this brick *offers*: both are ids the brick refers to — one to
		 * forbid, one to install — and only this brick knows what either of them
		 * means.
		 *
		 * Both are warnings rather than blocking. The bot runs, and the rule
		 * simply never fires — worth saying out loud, because a safety setting
		 * that quietly does nothing is exactly the sort of thing a builder should
		 * be told about.
		 */
		validateConfig: (config: { blockedActions: string[]; policyCards?: string[] }, ctx) => [
			...config.blockedActions
				.filter((actionId) => !ctx.hasAction(actionId))
				.map((actionId) => ({
					code: 'unknown-blocked-action' as const,
					severity: 'warning' as const,
					message: `The blocklist names "${actionId}", which isn't an installed action.`,
					details: { actionId }
				})),
			...(config.policyCards ?? [])
				.filter((cardId) => !ctx.hasPolicyCard(cardId))
				.map((cardId) => ({
					code: 'unknown-policy-card' as const,
					severity: 'warning' as const,
					message: `The Safety Brick names policy card "${cardId}", which this workbench does not have.`,
					details: { policyCardId: cardId }
				}))
		],
		/*
		 * The brick's dials, become running rules (WP14 slice 3d).
		 *
		 * This was `guardrailsForSpec` in `@craftabot/governance`: a compiler that
		 * read `spec.bricks.safety` by name and so could only ever compile *this*
		 * brick. Policy now arrives the way tools and senses do — the brick names
		 * what it installs, and core collects it — which is what lets a Monitor
		 * brick contribute rules of its own without a core change.
		 *
		 * Governance still owns the rules themselves. The split is the one the
		 * whole contract runs on: governance ships the *mechanisms* (a step budget,
		 * a blocklist), this pack decides which of them *this brick* installs and
		 * how it is dialled. That is content, not mechanism (hard rule 4).
		 *
		 * Order is behaviour, not presentation, because the chain stops at the
		 * first non-allow verdict (`08-…` §2), and it is `guardrailsForSpec`'s
		 * order unchanged: blocklist before approval mode, so an action the builder
		 * has already forbidden is refused outright rather than put to a human as a
		 * decision they appear free to make. No-repetition sits between them —
		 * after the flat prohibitions, before anybody is asked to approve a fourth
		 * identical attempt at something that has plainly stopped working. Policy
		 * cards (WP22) compile last: the four dials are the base policy, and a
		 * card layers custom rules on top of it rather than ahead of it.
		 *
		 * A card id nothing registered is skipped, the same answer the belt gives
		 * an unresolvable tool id — `validateConfig` has already told the builder.
		 *
		 * > **Amended 2026-08-16 (WP24):** `maxTokens` joins `maxTicks` as a second
		 * > budget, checked right beside it — both are the platform-floor tier, not
		 * > policy a builder reasons about action by action. `approval: 'risky'`
		 * > needs to know an action's `riskTier` before it can decide whether to
		 * > pause, which `ctx.getAction` resolves — the runtime-context lookup this
		 * > WP added for exactly this, the same shape as `getPolicyCard`.
		 */
		createRuntime: (
			config: {
				maxTicks: number;
				maxTokens?: number;
				blockedActions: string[];
				approval: 'off' | 'everything' | 'risky';
				repeatLimit?: number;
				policyCards?: string[];
			},
			ctx
		) => ({
			contributeGuardrails: () => {
				const guardrails = [createStepBudgetGuardrail(config.maxTicks)];
				if (config.maxTokens !== undefined) {
					guardrails.push(createTokenBudgetGuardrail(config.maxTokens));
				}
				// An empty list would allow everything on every check; the trace is
				// easier to read without a rule that cannot possibly fire.
				if (config.blockedActions.length > 0) {
					guardrails.push(createActionBlocklistGuardrail(config.blockedActions));
				}
				if (config.repeatLimit !== undefined) {
					guardrails.push(
						createNoRepetitionGuardrail(config.repeatLimit, {
							// The world says which of its actions are progress (WP45).
							isProgress: (name) => ctx.getAction(name)?.progress === true
						})
					);
				}
				if (config.approval === 'everything') {
					guardrails.push(createApprovalModeGuardrail('everything'));
				} else if (config.approval === 'risky') {
					guardrails.push(
						createApprovalModeGuardrail('risky', (name) => {
							const tier = ctx.getAction(name)?.riskTier ?? 'observe';
							return tier === 'reversible' || tier === 'irreversible';
						})
					);
				}
				for (const cardId of config.policyCards ?? []) {
					const card = ctx.getPolicyCard(cardId);
					if (card) guardrails.push(...compilePolicyCard(card));
				}
				return guardrails;
			}
		})
	} as BrickKindDefinition,
	radioBrickKind as BrickKindDefinition,
	plannerBrickKind as BrickKindDefinition,
	ifThenBrickKind as BrickKindDefinition,
	librarianBrickKind as BrickKindDefinition,
	connectorBrickKind as BrickKindDefinition
];
