import type { RunOutcome, SlotId } from '@craftabot/core';
import { APPROVAL_MODE_ID } from '@craftabot/governance';
import { offers, type BotCapabilities } from '$lib/bot-capabilities.js';
import { ANCHORS, type AnchorId } from './anchors.js';

/**
 * The Instruction Leaflet's six chapters (`02-AGENT-MODEL.md` §9,
 * `03-UI-UX-DESIGN.md` §6).
 *
 * Written as **data, not components**, for one reason: the roadmap's definition
 * of done is "every designed teaching moment reachable", and a claim like that
 * should be checkable by a unit test rather than by clicking through a browser
 * and hoping. Everything here is a pure function of a plain context object, so
 * the whole arc can be driven in milliseconds — and the Playwright walk then
 * confirms the same arc survives contact with the real DOM.
 *
 * Each chapter is a designed **failure→fix** pair. The user runs a bot that is
 * missing something, watches it fail in a specific and legible way, fits the
 * brick that fixes it, and runs again. The failures are real: `demo-brain.ts`
 * chooses its script from the same capabilities these predicates read.
 *
 * > **Amended 2026-08-13 (WP14 slice 4c):** the predicates ask what the bot
 * > **can do**, not which of V1's six bricks it has. A lesson about perception
 * > that reads `spec.bricks.sense` is a lesson only one brick can ever teach;
 * > one that asks whether anything opened a sense channel is taught equally well
 * > by a Radar brick from a pack nobody has written yet.
 *
 * Steps advance by *observing what the user did*, never by a Next button on
 * anything that matters. §6 is explicit that the user performs each step
 * themselves; a walkthrough that advances on click would let someone finish the
 * tutorial having built nothing.
 */

export type LeafletRoute = 'shelf' | 'bench' | 'play' | 'settings';

/** Everything a step is allowed to know. Deliberately small and serialisable. */
export interface LeafletContext {
	route: LeafletRoute;
	/** What the bot on the bench can do — the leaflet's whole view of the build. */
	can: BotCapabilities | undefined;
	/** Which Goal Card is slotted in. */
	goalCardId: string | undefined;
	/**
	 * The outcome of the most recent run *of the current card*. The controller
	 * clears it when the Goal Card changes, so a chapter that says "run it" is
	 * never satisfied by the previous chapter's run.
	 */
	outcome: RunOutcome | undefined;
	/** Which scripted failure the demo brain picked for the last run. */
	variant: string | undefined;
	/**
	 * Turns taken in the current run.
	 *
	 * The "watch it fail" steps key off this rather than off a finished run. A
	 * bot that cannot reach its goal has no early exit — it idles until the tick
	 * budget runs out, ~30 turns later — and making the reader sit through that
	 * before the leaflet would move on was a miserable way to learn something
	 * that is obvious after two turns.
	 */
	ticks: number;
	/** Tools the bot has actually used this run, by wire name. */
	usedTools: readonly string[];
	/** True once a run has asked a human to approve an action. */
	sawApproval: boolean;
	/** Ids of `ack` steps the reader has ticked off. */
	acked: ReadonlySet<string>;
}

export interface LeafletStep {
	id: string;
	/** One instruction, in the clipped voice of a real kit leaflet. */
	text: string;
	anchor?: AnchorId;
	/**
	 * A step with nothing to *do* — it points out what just happened. These are
	 * the only steps a button may advance, and they exist because two steps in a
	 * row cannot share a predicate: the second would be satisfied the instant the
	 * first was, and the reader would never see it.
	 */
	ack?: true;
	/**
	 * This step's evidence is transient: a tick count, an outcome, a scripted
	 * variant. Such a step stays ticked once satisfied, because the evidence
	 * disappears the moment the next run starts — without latching, pressing STEP
	 * again would bounce the reader back to "pull the GO lever".
	 *
	 * Structural steps (a brick fitted, a card chosen) deliberately do *not*
	 * latch, so undoing something guides the reader back to it.
	 */
	latch?: true;
	done(ctx: LeafletContext): boolean;
}

const wasRead = (id: string) => (ctx: LeafletContext) => ctx.acked.has(id);

export interface Chapter {
	id: string;
	number: number;
	title: string;
	/** The concept underneath the toy, shown on the chapter's flip side (00 §6). */
	teaches: string;
	badge: { id: string; name: string };
	/**
	 * The `brick.field` controls this chapter teaches (`16-…` §2.2).
	 *
	 * Declared rather than inferred from the prose: a chapter that mentions
	 * "temperature" in passing has not taught it, and a test that matched on
	 * words would be satisfied by the mention. `coverage.test.ts` holds every
	 * configurable field to having a chapter that claims it.
	 */
	controls?: string[];
	steps: LeafletStep[];
}

/** Something is in that socket — which brick is the reader's business, not ours. */
const filled = (ctx: LeafletContext, slot: SlotId) => ctx.can?.filled.has(slot) === true;
const canSee = (ctx: LeafletContext) => offers(ctx.can?.channels ?? [], 'sight');
const hasTool = (ctx: LeafletContext, id: string) => offers(ctx.can?.toolIds ?? [], id);
const onCard = (ctx: LeafletContext, cardId: string) => ctx.goalCardId === cardId;
/**
 * The bot pauses for a human before acting.
 *
 * Asked of the *rules the bot installed* rather than of a checkbox on one
 * particular brick. The lesson is "it now asks permission", and any brick that
 * installs an approval rule teaches it (WP14 slice 3d made that possible).
 */
const asksPermission = (ctx: LeafletContext) =>
	ctx.can?.guardrailIds.includes(APPROVAL_MODE_ID) === true;
/** Enough turns for the failure to be plain, without waiting for the budget. */
const watched = (ctx: LeafletContext, turns: number) => ctx.ticks >= turns;
const succeeded = (ctx: LeafletContext) => ctx.outcome === 'SUCCESS';

export const CHAPTERS: Chapter[] = [
	{
		id: 'loop',
		number: 1,
		title: 'A brain with no hands',
		teaches: 'The agent loop: sense, think, act — and what happens when a link is missing.',
		badge: { id: 'first-words', name: 'First Words' },
		controls: ['llm.cartridgeId', 'actions.enabled'],
		steps: [
			{
				id: 'new-bot',
				text: 'Take a new bot down off the shelf.',
				anchor: ANCHORS.newBot,
				// Satisfied by *having* a bot open, not by standing on the bench.
				// Steps are re-evaluated from the top every time, so a route-based
				// predicate would rewind the chapter to step one the moment the user
				// walked into the Playroom.
				done: (ctx) => ctx.can !== undefined
			},
			{
				id: 'fit-llm',
				text: 'Snap the Brain brick into the head socket.',
				anchor: ANCHORS.trayLlm,
				done: (ctx) => filled(ctx, 'brain')
			},
			{
				// 03 §6's "pop in a battery" step, in its keyless form: a fitted brain
				// brick arrives with no cartridge, and GO stays dark until one is
				// chosen. The Demo Brain needs no key at all.
				id: 'pick-cartridge',
				text: 'Slot a cartridge into the brick. The Demo Brain needs no battery.',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => (ctx.can?.cartridgeId ?? '') !== ''
			},
			{
				id: 'pick-card',
				text: 'Slot in the "Say Hello!" card.',
				anchor: ANCHORS.goalCards,
				done: (ctx) => onCard(ctx, 'starter/say-hello')
			},
			{
				id: 'first-go',
				latch: true,
				text: 'Pull the GO lever and press STEP twice.',
				anchor: ANCHORS.goLever,
				done: (ctx) => watched(ctx, 2)
			},
			{
				id: 'notice',
				text: 'Uh oh. It thinks beautifully and nothing happens. A brain with no hands.',
				anchor: ANCHORS.flightRecorder,
				ack: true,
				done: wasRead('notice')
			},
			{
				id: 'fit-actions',
				text: 'Back to the bench. Add the Actions brick — hands and wheels.',
				anchor: ANCHORS.trayActions,
				done: (ctx) => filled(ctx, 'mobility')
			},
			{
				id: 'act',
				latch: true,
				text: 'Run it again. This time it actually moves.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => ctx.variant !== 'no-actions' && watched(ctx, 1)
			}
		]
	},
	{
		id: 'senses',
		number: 2,
		title: 'Eyes open',
		teaches: 'Observations: a model can only reason about what it is told.',
		badge: { id: 'eyes-open', name: 'Eyes Open' },
		controls: ['sense.channels'],
		steps: [
			{
				id: 'blind',
				text: 'It moved — but it greeted an empty corner. It cannot see the room.',
				anchor: ANCHORS.thoughtBubble,
				ack: true,
				done: wasRead('blind')
			},
			{
				id: 'fit-sense',
				text: 'Add the Sense brick so the room is described to it each turn.',
				anchor: ANCHORS.traySense,
				done: (ctx) => canSee(ctx)
			},
			{
				id: 'see',
				latch: true,
				text: 'Run it again and read the first prompt in the Flight Recorder.',
				anchor: ANCHORS.promptRow,
				done: (ctx) => succeeded(ctx)
			}
		]
	},
	{
		id: 'memory',
		number: 3,
		title: 'The goldfish problem',
		teaches: 'Memory: without it, every turn starts from nothing.',
		badge: { id: 'elephant-memory', name: 'Elephant Memory' },
		steps: [
			{
				id: 'snack-card',
				text: 'Swap in the "Snack Time" card — a job that takes several turns.',
				anchor: ANCHORS.goalCards,
				done: (ctx) => onCard(ctx, 'starter/snack')
			},
			{
				id: 'forget',
				latch: true,
				text: 'Run it. Watch it have the same good idea over and over.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => watched(ctx, 3)
			},
			{
				id: 'fit-memory',
				text: 'Add the Memory brick, so it can read back its own last few turns.',
				anchor: ANCHORS.trayMemory,
				done: (ctx) => filled(ctx, 'memory')
			},
			{
				id: 'remember',
				latch: true,
				text: 'Run it again. Same bot, same script — it just stopped forgetting.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => succeeded(ctx)
			}
		]
	},
	{
		id: 'tools',
		number: 4,
		title: 'Confidently wrong',
		teaches: 'Hallucination: a model will guess in the same cheerful voice it uses for facts.',
		badge: { id: 'tool-time', name: 'Tool Time' },
		steps: [
			{
				id: 'sums-card',
				text: 'Slot in "Sums for Teddy". Teddy wants 17 × 23.',
				anchor: ANCHORS.goalCards,
				done: (ctx) => onCard(ctx, 'starter/sums-for-teddy')
			},
			{
				id: 'guess',
				latch: true,
				text: 'Run it. Note the answer it gives, and how sure it sounds.',
				anchor: ANCHORS.thoughtBubble,
				done: (ctx) => watched(ctx, 4)
			},
			{
				id: 'fit-tools',
				text: 'That was wrong. Add the Tools brick and switch on the calculator.',
				anchor: ANCHORS.trayTools,
				done: (ctx) => hasTool(ctx, 'starter/calculator')
			},
			{
				id: 'calculate',
				latch: true,
				text: 'Run it again. Same question, and now it works it out instead of guessing.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => succeeded(ctx)
			}
		]
	},
	{
		id: 'retrieval',
		number: 5,
		title: 'Looking things up',
		teaches: 'Retrieval: what to do about the things a model was never told.',
		badge: { id: 'key-finder', name: 'Key Finder' },
		controls: ['tools.enabled'],
		steps: [
			{
				id: 'chest-card',
				text: 'Slot in "The Locked Chest".',
				anchor: ANCHORS.goalCards,
				done: (ctx) => onCard(ctx, 'starter/locked-chest')
			},
			{
				id: 'shove',
				latch: true,
				text: 'Run it. It will try the lid, and try the lid, and try the lid.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => watched(ctx, 3)
			},
			{
				id: 'fit-manual',
				text: 'Switch on "Look up the manual" in the Tools panel.',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => hasTool(ctx, 'starter/look_up_manual')
			},
			{
				id: 'retrieve',
				latch: true,
				text: 'Run it again. It looks the chest up, learns about the key, and goes to get it.',
				anchor: ANCHORS.stepButton,
				/*
				 * Keyed on the *lookup*, not on the card being won.
				 *
				 * > **Amended 2026-08-13 (WP11):** the card is now winnable. It
				 * > used to ask for the chest open **and** all three blocks away
				 * > — roughly 45 turns against a 30-turn floor, so no bot could
				 * > ever finish it ("Tidy the blocks" was the same at ~34).
				 * > `16-…` §1.1 re-scoped both; the old layout survives as the
				 * > labelled expert card.
				 *
				 * The condition stays on the lookup all the same, because the
				 * chapter teaches retrieval, and retrieval is demonstrated the
				 * moment the bot stops shoving the lid and goes to look the
				 * answer up — not several turns later when the lid finally opens.
				 */
				done: (ctx) => ctx.usedTools.includes('look_up_manual')
			}
		]
	},
	{
		id: 'governance',
		number: 6,
		title: 'Who says yes',
		teaches: 'Guardrails: limits, blocked actions, and a human in the loop.',
		badge: { id: 'safety-first', name: 'Safety First' },
		controls: [
			'safety.approvalMode',
			'safety.maxTicks',
			'safety.repeatLimit',
			'safety.blockedActions'
		],
		steps: [
			{
				id: 'fit-safety',
				text: 'Add the Safety Brick — the hazard-striped one.',
				anchor: ANCHORS.traySafety,
				done: (ctx) => filled(ctx, 'safety')
			},
			{
				id: 'approval-on',
				text: 'In its panel, switch on "Ask before acting".',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => asksPermission(ctx)
			},
			{
				id: 'approve',
				latch: true,
				text: 'Run it. Now nothing happens to the world until you say so.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => ctx.sawApproval
			},
			{
				id: 'limits',
				ack: true,
				text: 'The same panel holds two limits: how many steps it may take, and how many times it may repeat itself before the loop-breaker steps in.',
				anchor: ANCHORS.brickPanel,
				done: wasRead('limits')
			},
			{
				id: 'blocklist',
				ack: true,
				text: 'And a list of actions it may never take at all. A rule you set beats anything the brain decides.',
				anchor: ANCHORS.brickPanel,
				done: wasRead('blocklist')
			}
		]
	},
	/**
	 * The dials, which nothing taught (`16-…` §2.2). A child can set a
	 * temperature, a reply length, a personality, a memory span and a notebook,
	 * and the leaflet went from "fit the brick" straight to "run it" — so the
	 * settings that most change how an agent behaves were the ones with no
	 * lesson attached.
	 *
	 * Mostly `ack` steps, deliberately. A dial's *value* is not visible to the
	 * leaflet — `BotCapabilities` reports what a bot can do, not what it is set
	 * to — and inventing a way to watch numbers change would be a large seam for
	 * a small gain. The notebook is the exception, because having one is a
	 * capability, so that step is genuinely checked.
	 */
	{
		id: 'dials',
		number: 7,
		title: 'Turning the dials',
		teaches:
			'Sampling and context: the same brain, told the same thing, behaves differently depending on how it is set.',
		badge: { id: 'dial-turner', name: 'Dial Turner' },
		controls: [
			'llm.temperature',
			'llm.maxTokens',
			'llm.personality',
			'memory.windowSize',
			'memory.notebook'
		],
		steps: [
			/*
			 * No "fit the Brain brick" step to open on: by chapter 7 it is long
			 * since fitted, so the step would be satisfied the instant it appeared
			 * and the reader would never see it. The instruction to open the panel
			 * rides on the first dial instead.
			 */
			{
				id: 'temperature',
				ack: true,
				text: 'Click the Brain brick to open its panel. The temperature dial is how adventurous it is — low: careful and repetitive; high: surprising, and sometimes nonsense.',
				anchor: ANCHORS.brickPanel,
				done: wasRead('temperature')
			},
			{
				id: 'reply-length',
				ack: true,
				text: 'Next to it, how much it may say in one go. Too little and it stops mid-thought.',
				anchor: ANCHORS.brickPanel,
				done: wasRead('reply-length')
			},
			{
				id: 'personality',
				ack: true,
				text: 'And a box for who it is. Whatever you write there goes into every prompt it is ever given — look for it in the Flight Recorder.',
				anchor: ANCHORS.promptRow,
				done: wasRead('personality')
			},
			{
				id: 'memory-span',
				ack: true,
				text: 'The Scrapbook brick has a dial too: how many turns it remembers. A short memory is why a bot asks the same question twice.',
				anchor: ANCHORS.brickPanel,
				done: wasRead('memory-span')
			},
			{
				id: 'notebook',
				text: 'Switch on its notebook. Now it can write things down and read them back — memory it chooses, rather than memory it is given.',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => ctx.can?.notebook === true
			}
		]
	}
];

export const BADGES = CHAPTERS.map((chapter) => chapter.badge);

export function chapterByNumber(number: number): Chapter | undefined {
	return CHAPTERS.find((chapter) => chapter.number === number);
}

/**
 * Whether a step counts as done.
 *
 * Structural steps are re-evaluated every time, so a reader who removes a brick
 * is guided back to it. Latching steps are remembered by the controller, which
 * passes what it has seen in `latched`.
 */
export function isStepDone(
	step: LeafletStep,
	ctx: LeafletContext,
	latched: ReadonlySet<string> = new Set()
): boolean {
	if (step.latch && latched.has(step.id)) return true;
	return step.done(ctx);
}

/** The first step of a chapter the reader has not satisfied yet. */
export function currentStepOf(
	chapter: Chapter,
	ctx: LeafletContext,
	latched: ReadonlySet<string> = new Set()
): LeafletStep | undefined {
	return chapter.steps.find((step) => !isStepDone(step, ctx, latched));
}

export function isChapterComplete(
	chapter: Chapter,
	ctx: LeafletContext,
	latched: ReadonlySet<string> = new Set()
): boolean {
	return currentStepOf(chapter, ctx, latched) === undefined;
}

/**
 * A merit badge's name, from its id (`12-…` D16).
 *
 * The toast said "Merit badge earned: **elephant-memory**", because the earned
 * list holds ids and the name lives on the chapter that awards it. A child
 * being congratulated in kebab-case is the sort of detail that says nobody
 * looked.
 */
export function badgeName(id: string): string {
	return CHAPTERS.find((chapter) => chapter.badge.id === id)?.badge.name ?? id;
}
