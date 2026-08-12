import type { AgentSpec, RunOutcome } from '@craftabot/core';
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
 * chooses its script from the same spec these predicates read.
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
	spec: AgentSpec | undefined;
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
	steps: LeafletStep[];
}

const hasBrick = (ctx: LeafletContext, kind: keyof AgentSpec['bricks']) =>
	ctx.spec?.bricks[kind] !== undefined;
const canSee = (ctx: LeafletContext) => ctx.spec?.bricks.sense?.channels.includes('sight') === true;
const hasTool = (ctx: LeafletContext, id: string) =>
	ctx.spec?.bricks.tools?.enabled.includes(id) === true;
const onCard = (ctx: LeafletContext, cardId: string) => ctx.spec?.goalCardId === cardId;
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
		steps: [
			{
				id: 'new-bot',
				text: 'Take a new bot down off the shelf.',
				anchor: ANCHORS.newBot,
				// Satisfied by *having* a bot open, not by standing on the bench.
				// Steps are re-evaluated from the top every time, so a route-based
				// predicate would rewind the chapter to step one the moment the user
				// walked into the Playroom.
				done: (ctx) => ctx.spec !== undefined
			},
			{
				id: 'fit-llm',
				text: 'Snap the Brain brick into the head socket.',
				anchor: ANCHORS.trayLlm,
				done: (ctx) => hasBrick(ctx, 'llm')
			},
			{
				// 03 §6's "pop in a battery" step, in its keyless form: a fitted brain
				// brick arrives with no cartridge, and GO stays dark until one is
				// chosen. The Demo Brain needs no key at all.
				id: 'pick-cartridge',
				text: 'Slot a cartridge into the brick. The Demo Brain needs no battery.',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => (ctx.spec?.bricks.llm?.cartridgeId ?? '') !== ''
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
				done: (ctx) => hasBrick(ctx, 'actions')
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
				anchor: ANCHORS.flightRecorder,
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
				done: (ctx) => hasBrick(ctx, 'memory')
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
				 * "The locked chest" asks the bot to open the chest **and** tidy all
				 * three blocks away, which needs roughly 45 turns — well past the
				 * 30-turn engine floor. The card is therefore not winnable as
				 * specified (so is "Tidy the blocks", at ~34). That is a pre-existing
				 * card-design problem, recorded rather than papered over.
				 *
				 * The chapter teaches retrieval, and retrieval is demonstrated the
				 * moment the bot stops shoving the lid and goes to look the answer up.
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
		steps: [
			{
				id: 'fit-safety',
				text: 'Add the Safety Brick — the hazard-striped one.',
				anchor: ANCHORS.traySafety,
				done: (ctx) => hasBrick(ctx, 'safety')
			},
			{
				id: 'approval-on',
				text: 'In its panel, switch on "Ask before acting".',
				anchor: ANCHORS.brickPanel,
				done: (ctx) => ctx.spec?.bricks.safety?.approvalMode === true
			},
			{
				id: 'approve',
				latch: true,
				text: 'Run it. Now nothing happens to the world until you say so.',
				anchor: ANCHORS.stepButton,
				done: (ctx) => ctx.sawApproval
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
