import { migrateAgentSpec, type AgentSpec } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { capabilitiesOf } from '$lib/bot-capabilities.js';
import { createRegistry } from '$lib/packs.js';
import { ALL_ANCHORS } from './anchors.js';
import {
	CHAPTERS,
	chapterByNumber,
	currentStepOf,
	isChapterComplete,
	type LeafletContext
} from './chapters.js';

/**
 * `09-ROADMAP.md` WP9: **"every designed teaching moment reachable"**.
 *
 * That is a claim about the chapter model, so it is tested against the model
 * rather than inferred from a browser walk. Each chapter below is driven by the
 * sequence of things a real user would actually do; the test asserts the leaflet
 * advances one step at a time and lands on its badge. A chapter with an
 * unreachable step — a predicate nothing can satisfy, or two steps in a row
 * sharing one — fails here, in milliseconds, instead of stranding someone
 * halfway through the tutorial.
 *
 * > **Amended 2026-08-13 (WP14 slice 4c):** the chapters read **capabilities**,
 * > so `ctx({ spec })` turns a fixture bot into what that bot can do, through
 * > the real registry and the real bricks. The fixtures stay written as bots —
 * > "fit the Actions brick" is what the reader does, and what the test should
 * > say — while the predicates ask the question that survives a seventh brick.
 */

const ACTIONS = { enabled: ['move', 'say', 'pick_up', 'give', 'open', 'celebrate'] };
const SIGHT = { channels: ['sight', 'compass'] };
/*
 * The notebook is on. This fixture stands for "a bot with everything a reader
 * could have switched on", which is what the satisfiability check needs — and
 * chapter 7's notebook step is genuinely reachable, just not by a bot that
 * never turned it on.
 */
const MEMORY = { windowSize: 10 as const, notebook: true };

/**
 * A Planner-fitted bot's capabilities. `spec()` builds a v1 `AgentSpec`,
 * whose `bricks` is a closed six-key object (`agent-spec.ts`) with no room
 * for a seventh — planner only exists on the v2 array shape, so this chapter
 * is the one fixture builder in this file that cannot go through `spec()`
 * unmodified and has to migrate first, the same way `planner.test.ts` and
 * `trace-fixture.test.ts` (pack-starter) already do.
 */
function withPlanner(built: AgentSpec) {
	const migrated = migrateAgentSpec(built);
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'planner',
		kind: 'starter/planner',
		config: {},
		configVersion: 1
	});
	return capabilitiesOf(migrated, createRegistry());
}

/**
 * A Planner-and-If/Then-fitted bot's capabilities (WP30's own If/Then
 * sizing, stage C) — chapter 9 needs both: the Planner from chapter 8, still
 * fitted, plus the reflexes socket a rule occupies.
 */
function withPlannerAndIfThen(
	built: AgentSpec,
	rules: { ifSees: string; then: { kind: 'tool' | 'action'; name: string; arguments?: unknown } }[]
) {
	const migrated = migrateAgentSpec(built);
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push(
		{ slot: 'planner', kind: 'starter/planner', config: {}, configVersion: 1 },
		{ slot: 'reflexes', kind: 'starter/if-then', config: { rules }, configVersion: 1 }
	);
	return capabilitiesOf(migrated, createRegistry());
}

function spec(over: Partial<AgentSpec> & { bricks?: AgentSpec['bricks'] } = {}): AgentSpec {
	return {
		id: '44444444-4444-4444-8444-444444444444',
		name: 'Tutorialbot',
		bricks: over.bricks ?? {},
		goalCardId: over.goalCardId ?? 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

/**
 * A leaflet context, written the way a test wants to think about it.
 *
 * `spec` is fixture sugar: it is turned into capabilities here, once, through
 * the real registry — so a chapter predicate is exercised against what the real
 * bricks actually contribute rather than against a hand-built claim.
 */
function ctx(over: Partial<LeafletContext> & { spec?: AgentSpec } = {}): LeafletContext {
	const { spec: built, ...rest } = over;
	const base: LeafletContext = {
		route: 'shelf',
		can: undefined,
		goalCardId: undefined,
		outcome: undefined,
		variant: undefined,
		ticks: 0,
		usedTools: [],
		sawApproval: false,
		sawReflex: false,
		acked: new Set<string>(),
		...rest
	};
	/*
	 * Applied *after* the spread, not inside it. Several tests build on an
	 * earlier context — `ctx({ ...read, spec: spec({ … }) })` — and that context
	 * already carries the previous `can`; without this the old capabilities
	 * would win and the fixture would silently describe the wrong bot.
	 */
	return built
		? { ...base, can: capabilitiesOf(built, createRegistry()), goalCardId: built.goalCardId }
		: base;
}

describe('the shape of the arc', () => {
	it('has the nine chapters of 02 §9, numbered in order', () => {
		// Seven since WP17 §2.2: the six brick chapters plus "Turning the dials",
		// which teaches the settings the other six never mention. Eight since
		// WP30 stage D: the Planner brick's own chapter, the first for a brick
		// that joined after the open contract rather than shipping in V1. Nine
		// since WP30's own If/Then sizing, stage C: a second such chapter.
		expect(CHAPTERS).toHaveLength(9);
		expect(CHAPTERS.map((chapter) => chapter.number)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it('gives every chapter a distinct badge', () => {
		const ids = CHAPTERS.map((chapter) => chapter.badge.id);
		expect(new Set(ids).size).toBe(CHAPTERS.length);
	});

	it('keeps every anchor in ALL_ANCHORS unique', () => {
		expect(new Set(ALL_ANCHORS).size).toBe(ALL_ANCHORS.length);
	});

	it('leaves no non-ack step that a finished bot cannot satisfy', () => {
		// A step whose predicate nothing can make true would strand the reader for
		// good. Ack steps are exempt: they are satisfied by reading, not by doing.
		//
		// The per-chapter walks below are what prove each step is *surfaced* in
		// turn; this one only proves none of them is a dead end.
		const CARD_FOR: Record<string, string> = {
			loop: 'starter/say-hello',
			senses: 'starter/say-hello',
			memory: 'starter/snack',
			tools: 'starter/sums-for-teddy',
			retrieval: 'starter/locked-chest',
			governance: 'starter/locked-chest',
			planning: 'starter/tidy-the-blocks',
			reflexes: 'starter/tidy-the-blocks'
		};
		const sixBricks: AgentSpec['bricks'] = {
			llm: { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' },
			actions: ACTIONS,
			sense: SIGHT,
			memory: MEMORY,
			tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] },
			safety: { maxTicks: 30, blockedActions: [], approvalMode: true }
		};

		for (const chapter of CHAPTERS) {
			const goalCardId = CARD_FOR[chapter.id] ?? 'starter/say-hello';
			// Chapters 8 and 9's own steps need a Planner brick (and, for 9, an
			// If/Then rule too), which a v1 `AgentSpec` (this fixture's usual
			// shape) cannot carry at all — see `withPlanner`/`withPlannerAndIfThen`.
			const can =
				chapter.id === 'planning'
					? withPlanner(spec({ bricks: sixBricks, goalCardId }))
					: chapter.id === 'reflexes'
						? withPlannerAndIfThen(spec({ bricks: sixBricks, goalCardId }), [
								{
									ifSees: 'yellow',
									then: { kind: 'action', name: 'pick_up', arguments: { item: 'yellow block' } }
								}
							])
						: capabilitiesOf(spec({ bricks: sixBricks, goalCardId }), createRegistry());

			const finished = ctx({
				route: 'play',
				can,
				goalCardId,
				outcome: 'SUCCESS',
				ticks: 12,
				usedTools: ['calculator', 'look_up_manual', 'make_plan'],
				sawApproval: true,
				sawReflex: true
			});

			for (const step of chapter.steps.filter((candidate) => !candidate.done(finished))) {
				expect(step.ack, `${chapter.id}/${step.id} can never be satisfied`).toBe(true);
			}
		}
	});

	it('finds chapters by number', () => {
		expect(chapterByNumber(3)?.id).toBe('memory');
		expect(chapterByNumber(10)).toBeUndefined();
	});
});

describe('chapter 1 — a brain with no hands', () => {
	const chapter = chapterByNumber(1)!;
	const brain = { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' };

	it('walks from the shelf to a bot that can act', () => {
		expect(currentStepOf(chapter, ctx())?.id).toBe('new-bot');

		const onBench = ctx({ route: 'bench', spec: spec({ bricks: {} }) });
		expect(currentStepOf(chapter, onBench)?.id).toBe('fit-llm');

		// A freshly fitted brain brick has no cartridge, and GO stays dark.
		const empty = { cartridgeId: '', temperature: 0, maxTokens: 256, personality: '' };
		const noCartridge = ctx({ route: 'bench', spec: spec({ bricks: { llm: empty } }) });
		expect(currentStepOf(chapter, noCartridge)?.id).toBe('pick-cartridge');

		// A new bot arrives already on the say-hello card, so 'pick-card' is
		// normally satisfied from the start and the reader simply sees it ticked.
		const carded = ctx({
			route: 'bench',
			spec: spec({ bricks: { llm: brain }, goalCardId: 'starter/say-hello' })
		});
		expect(currentStepOf(chapter, carded)?.id).toBe('first-go');

		// The designed failure: it ran, and could not act.
		const failed = ctx({ ...carded, ticks: 2, variant: 'no-actions' });
		expect(currentStepOf(chapter, failed)?.id).toBe('notice');

		const read = ctx({ ...failed, acked: new Set(['notice']) });
		expect(currentStepOf(chapter, read)?.id).toBe('fit-actions');

		const handsOn = ctx({
			...read,
			spec: spec({ bricks: { llm: brain, actions: ACTIONS } })
		});
		expect(currentStepOf(chapter, handsOn)?.id).toBe('act');

		// It ran again and this time was not the no-actions script. The controller
		// latches evidence steps as it sees them, so `first-go` stays ticked even
		// though the new run has only taken one turn.
		const acting = ctx({ ...handsOn, ticks: 1, variant: 'no-sight' });
		expect(isChapterComplete(chapter, acting, new Set(['first-go']))).toBe(true);
	});

	it('guides the reader back if the wrong card is in the rack', () => {
		const wrongCard = ctx({
			route: 'bench',
			spec: spec({ bricks: { llm: brain }, goalCardId: 'starter/locked-chest' })
		});
		expect(currentStepOf(chapter, wrongCard)?.id).toBe('pick-card');
	});

	it('does not rewind to step one just because the user walked into the Playroom', () => {
		// Steps are re-evaluated from the top, so a route-based first step would
		// send a reader in play mode back to "take a new bot off the shelf".
		const playing = ctx({
			route: 'play',
			spec: spec({ bricks: { llm: brain }, goalCardId: 'starter/say-hello' })
		});
		expect(currentStepOf(chapter, playing)?.id).not.toBe('new-bot');
	});

	it('is not completed by a run that still could not act', () => {
		const stuck = ctx({
			route: 'play',
			spec: spec({ bricks: { llm: brain } }),
			ticks: 2,
			variant: 'no-actions',
			acked: new Set(['notice'])
		});
		expect(isChapterComplete(chapter, stuck, new Set(['first-go']))).toBe(false);
	});
});

describe('chapters 2 to 6 each reach their badge', () => {
	const brain = { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' };
	const base = { llm: brain, actions: ACTIONS };

	it('chapter 2 — eyes open', () => {
		const chapter = chapterByNumber(2)!;
		const blind = ctx({ route: 'play', spec: spec({ bricks: base }), ticks: 4 });
		expect(currentStepOf(chapter, blind)?.id).toBe('blind');

		const read = ctx({ ...blind, acked: new Set(['blind']) });
		expect(currentStepOf(chapter, read)?.id).toBe('fit-sense');

		const seeing = ctx({ ...read, spec: spec({ bricks: { ...base, sense: SIGHT } }) });
		expect(currentStepOf(chapter, seeing)?.id).toBe('see');

		expect(isChapterComplete(chapter, ctx({ ...seeing, outcome: 'SUCCESS' }))).toBe(true);
	});

	it('chapter 3 — the goldfish problem', () => {
		const chapter = chapterByNumber(3)!;
		const bricks = { ...base, sense: SIGHT };

		const sayHello = ctx({ route: 'bench', spec: spec({ bricks }) });
		expect(currentStepOf(chapter, sayHello)?.id).toBe('snack-card');

		const snack = ctx({ ...sayHello, spec: spec({ bricks, goalCardId: 'starter/snack' }) });
		expect(currentStepOf(chapter, snack)?.id).toBe('forget');

		const forgot = ctx({ ...snack, ticks: 3, variant: 'no-memory' });
		expect(currentStepOf(chapter, forgot)?.id).toBe('fit-memory');

		const remembers = ctx({
			...forgot,
			spec: spec({ bricks: { ...bricks, memory: MEMORY }, goalCardId: 'starter/snack' })
		});
		expect(currentStepOf(chapter, remembers)?.id).toBe('remember');
		expect(isChapterComplete(chapter, ctx({ ...remembers, outcome: 'SUCCESS' }))).toBe(true);
	});

	it('chapter 4 — confidently wrong', () => {
		const chapter = chapterByNumber(4)!;
		const bricks = { ...base, sense: SIGHT, memory: MEMORY };

		const before = ctx({ route: 'bench', spec: spec({ bricks, goalCardId: 'starter/snack' }) });
		expect(currentStepOf(chapter, before)?.id).toBe('sums-card');

		const sums = ctx({
			...before,
			spec: spec({ bricks, goalCardId: 'starter/sums-for-teddy' })
		});
		expect(currentStepOf(chapter, sums)?.id).toBe('guess');

		const guessed = ctx({ ...sums, ticks: 4, variant: 'no-calculator' });
		expect(currentStepOf(chapter, guessed)?.id).toBe('fit-tools');

		const armed = ctx({
			...guessed,
			spec: spec({
				bricks: { ...bricks, tools: { enabled: ['starter/calculator'] } },
				goalCardId: 'starter/sums-for-teddy'
			})
		});
		expect(currentStepOf(chapter, armed)?.id).toBe('calculate');
		expect(isChapterComplete(chapter, ctx({ ...armed, outcome: 'SUCCESS' }))).toBe(true);
	});

	it('chapter 5 — looking things up', () => {
		const chapter = chapterByNumber(5)!;
		const bricks = {
			...base,
			sense: SIGHT,
			memory: MEMORY,
			tools: { enabled: ['starter/calculator'] }
		};

		const before = ctx({
			route: 'bench',
			spec: spec({ bricks, goalCardId: 'starter/sums-for-teddy' })
		});
		expect(currentStepOf(chapter, before)?.id).toBe('chest-card');

		const chest = ctx({ ...before, spec: spec({ bricks, goalCardId: 'starter/locked-chest' }) });
		expect(currentStepOf(chapter, chest)?.id).toBe('shove');

		const shoved = ctx({ ...chest, ticks: 3, variant: 'no-manual' });
		expect(currentStepOf(chapter, shoved)?.id).toBe('fit-manual');

		const canLookUp = ctx({
			...shoved,
			spec: spec({
				bricks: { ...bricks, tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] } },
				goalCardId: 'starter/locked-chest'
			})
		});
		expect(currentStepOf(chapter, canLookUp)?.id).toBe('retrieve');
		// The chapter is finished by the bot *looking something up*, which is the
		// lesson — not by winning a card that cannot be won inside the budget.
		expect(isChapterComplete(chapter, ctx({ ...canLookUp, usedTools: ['look_up_manual'] }))).toBe(
			true
		);
	});

	it('chapter 7 — turning the dials', () => {
		const chapter = chapterByNumber(7)!;
		const bricks = {
			...base,
			sense: SIGHT,
			memory: { windowSize: 10 as const, notebook: false },
			tools: { enabled: ['starter/calculator'] }
		};

		const onBench = ctx({ route: 'bench', spec: spec({ bricks }) });
		expect(currentStepOf(chapter, onBench)?.id).toBe('temperature');

		// The four reading steps, in order.
		const read = new Set<string>();
		for (const id of ['temperature', 'reply-length', 'personality', 'memory-span']) {
			expect(currentStepOf(chapter, ctx({ ...onBench, acked: new Set(read) }))?.id).toBe(id);
			read.add(id);
		}

		// Then the one that is genuinely checked.
		const beforeNotebook = ctx({ ...onBench, acked: new Set(read) });
		expect(currentStepOf(chapter, beforeNotebook)?.id).toBe('notebook');

		const withNotebook = ctx({
			route: 'bench',
			acked: new Set(read),
			spec: spec({ bricks: { ...bricks, memory: { windowSize: 10 as const, notebook: true } } })
		});
		expect(isChapterComplete(chapter, withNotebook)).toBe(true);
	});

	it('chapter 6 — who says yes', () => {
		const chapter = chapterByNumber(6)!;
		const bricks = {
			...base,
			sense: SIGHT,
			memory: MEMORY,
			tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] }
		};

		const noSafety = ctx({ route: 'bench', spec: spec({ bricks }) });
		expect(currentStepOf(chapter, noSafety)?.id).toBe('fit-safety');

		const fitted = ctx({
			...noSafety,
			spec: spec({
				bricks: { ...bricks, safety: { maxTicks: 30, blockedActions: [], approvalMode: false } }
			})
		});
		expect(currentStepOf(chapter, fitted)?.id).toBe('approval-on');

		const asking = ctx({
			...fitted,
			spec: spec({
				bricks: { ...bricks, safety: { maxTicks: 30, blockedActions: [], approvalMode: true } }
			})
		});
		expect(currentStepOf(chapter, asking)?.id).toBe('approve');

		// A human is actually asked (08 §3) — then the four reading steps that
		// cover the panel's other limits (`16-…` §2.2), its spending cap
		// (`14-…` §4.6, WP24) and its policy cards (`14-…` §4.6, WP22).
		const asked = ctx({ ...asking, sawApproval: true });
		expect(currentStepOf(chapter, asked)?.id).toBe('limits');

		const readLimits = ctx({ ...asked, acked: new Set(['limits']) });
		expect(currentStepOf(chapter, readLimits)?.id).toBe('spending-limit');

		const readSpendingLimit = ctx({ ...asked, acked: new Set(['limits', 'spending-limit']) });
		expect(currentStepOf(chapter, readSpendingLimit)?.id).toBe('blocklist');

		const readBlocklist = ctx({
			...asked,
			acked: new Set(['limits', 'spending-limit', 'blocklist'])
		});
		expect(currentStepOf(chapter, readBlocklist)?.id).toBe('policy-cards');

		expect(
			isChapterComplete(
				chapter,
				ctx({
					...asked,
					acked: new Set(['limits', 'spending-limit', 'blocklist', 'policy-cards'])
				})
			)
		).toBe(true);
	});
});

describe('chapter 8 — think it through', () => {
	const brain = { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' };
	const built = {
		llm: brain,
		actions: ACTIONS,
		sense: SIGHT,
		memory: MEMORY,
		tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] },
		safety: { maxTicks: 30, blockedActions: [], approvalMode: true }
	};
	const chapter = chapterByNumber(8)!;

	it('walks from picking the card to the badge, the same failure→fix shape as 1–5', () => {
		const before = ctx({
			route: 'bench',
			spec: spec({ bricks: built, goalCardId: 'starter/snack' })
		});
		expect(currentStepOf(chapter, before)?.id).toBe('tidy-card');

		const carded = ctx({
			...before,
			spec: spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' })
		});
		expect(currentStepOf(chapter, carded)?.id).toBe('wing-it');

		// The designed "failure": not a stalled run — planning changes how
		// legibly the bot gets there, not whether it can. Four turns of
		// deciding turn by turn is the lesson, the same way chapter 4 watches
		// four turns of a confident wrong answer rather than waiting for an
		// outcome.
		const wound = ctx({ ...carded, ticks: 4 });
		expect(currentStepOf(chapter, wound)?.id).toBe('fit-planner');

		const planned = ctx({
			...wound,
			can: withPlanner(spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' }))
		});
		expect(currentStepOf(chapter, planned)?.id).toBe('see-plan');

		const madePlan = ctx({ ...planned, usedTools: ['make_plan'] });
		expect(currentStepOf(chapter, madePlan)?.id).toBe('planned');

		expect(isChapterComplete(chapter, ctx({ ...madePlan, outcome: 'SUCCESS' }))).toBe(true);
	});

	it('guides the reader back if the wrong card is in the rack', () => {
		const wrongCard = ctx({
			route: 'bench',
			spec: spec({ bricks: built, goalCardId: 'starter/say-hello' })
		});
		expect(currentStepOf(chapter, wrongCard)?.id).toBe('tidy-card');
	});

	it('is not completed by a run that has not made a plan yet, even on a Planner-fitted bot', () => {
		const stuck = ctx({
			route: 'play',
			can: withPlanner(spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' })),
			outcome: 'SUCCESS',
			usedTools: []
		});
		expect(isChapterComplete(chapter, stuck)).toBe(false);
	});
});

describe('chapter 9 — skip the thinking', () => {
	const brain = { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' };
	const built = {
		llm: brain,
		actions: ACTIONS,
		sense: SIGHT,
		memory: MEMORY,
		tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] },
		safety: { maxTicks: 30, blockedActions: [], approvalMode: true }
	};
	const chapter = chapterByNumber(9)!;
	const rule = {
		ifSees: 'east: a yellow letter block',
		then: { kind: 'action' as const, name: 'pick_up', arguments: { item: 'yellow block' } }
	};

	it('walks from noticing the cost to the badge, once a reflex actually fires', () => {
		// The context chapter 8 leaves behind: still on "Tidy the blocks",
		// Planner fitted, its own run already finished successfully. Chapter 9
		// opens on that context directly, per its own top comment — the
		// "watch it think" evidence is that run, not a fresh one.
		const justFinished = ctx({
			route: 'play',
			can: withPlanner(spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' })),
			goalCardId: 'starter/tidy-the-blocks',
			outcome: 'SUCCESS',
			ticks: 20,
			usedTools: ['make_plan']
		});
		expect(currentStepOf(chapter, justFinished)?.id).toBe('notice-thinking');

		const read = ctx({ ...justFinished, acked: new Set(['notice-thinking']) });
		expect(currentStepOf(chapter, read)?.id).toBe('fit-if-then');

		const fitted = ctx({
			...read,
			can: withPlannerAndIfThen(spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' }), []),
			// A capability change resets the last run's evidence in the real
			// controller (`leaflet.svelte.ts`'s own `rebuilt` branch) — modelled
			// by hand here, since this file drives `currentStepOf` directly
			// rather than through the controller. Without it, `fitted` would
			// still carry `justFinished`'s stale `outcome: 'SUCCESS'` forward,
			// and `reacted` would read as already satisfied before the reader
			// had done anything this chapter asked.
			outcome: undefined,
			ticks: 0,
			usedTools: [],
			sawApproval: false,
			sawReflex: false
		});
		expect(currentStepOf(chapter, fitted)?.id).toBe('add-rule');

		const ruleRead = ctx({ ...fitted, acked: new Set(['notice-thinking', 'add-rule']) });
		expect(currentStepOf(chapter, ruleRead)?.id).toBe('react');

		const reacted = ctx({ ...ruleRead, sawReflex: true });
		expect(currentStepOf(chapter, reacted)?.id).toBe('reacted');

		expect(isChapterComplete(chapter, ctx({ ...reacted, outcome: 'SUCCESS' }))).toBe(true);
	});

	it('is not completed by a run that fired no reflex, even with a rule fitted', () => {
		const stuck = ctx({
			route: 'play',
			can: withPlannerAndIfThen(spec({ bricks: built, goalCardId: 'starter/tidy-the-blocks' }), [
				rule
			]),
			outcome: 'SUCCESS',
			sawReflex: false,
			acked: new Set(['notice-thinking', 'add-rule'])
		});
		expect(isChapterComplete(chapter, stuck)).toBe(false);
	});
});
