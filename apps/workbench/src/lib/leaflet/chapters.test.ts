import type { AgentSpec } from '@craftabot/core';
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
	it('has the seven chapters of 02 §9, numbered in order', () => {
		// Seven since WP17 §2.2: the six brick chapters plus "Turning the dials",
		// which teaches the settings the other six never mention.
		expect(CHAPTERS).toHaveLength(7);
		expect(CHAPTERS.map((chapter) => chapter.number)).toStrictEqual([1, 2, 3, 4, 5, 6, 7]);
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
			governance: 'starter/locked-chest'
		};

		for (const chapter of CHAPTERS) {
			const finished = ctx({
				route: 'play',
				spec: spec({
					bricks: {
						llm: { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' },
						actions: ACTIONS,
						sense: SIGHT,
						memory: MEMORY,
						tools: { enabled: ['starter/calculator', 'starter/look_up_manual'] },
						safety: { maxTicks: 30, blockedActions: [], approvalMode: true }
					},
					goalCardId: CARD_FOR[chapter.id] ?? 'starter/say-hello'
				}),
				outcome: 'SUCCESS',
				ticks: 12,
				usedTools: ['calculator', 'look_up_manual'],
				sawApproval: true
			});

			for (const step of chapter.steps.filter((candidate) => !candidate.done(finished))) {
				expect(step.ack, `${chapter.id}/${step.id} can never be satisfied`).toBe(true);
			}
		}
	});

	it('finds chapters by number', () => {
		expect(chapterByNumber(3)?.id).toBe('memory');
		expect(chapterByNumber(9)).toBeUndefined();
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

		// A human is actually asked (08 §3) — then the three reading steps that
		// cover the panel's other limits (`16-…` §2.2) and its policy cards
		// (`14-…` §4.6, WP22).
		const asked = ctx({ ...asking, sawApproval: true });
		expect(currentStepOf(chapter, asked)?.id).toBe('limits');

		const readLimits = ctx({ ...asked, acked: new Set(['limits']) });
		expect(currentStepOf(chapter, readLimits)?.id).toBe('blocklist');

		const readBlocklist = ctx({ ...asked, acked: new Set(['limits', 'blocklist']) });
		expect(currentStepOf(chapter, readBlocklist)?.id).toBe('policy-cards');

		expect(
			isChapterComplete(
				chapter,
				ctx({ ...asked, acked: new Set(['limits', 'blocklist', 'policy-cards']) })
			)
		).toBe(true);
	});
});
