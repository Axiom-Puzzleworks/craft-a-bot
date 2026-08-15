import type { RunOutcome } from '@craftabot/core';

/**
 * The bot's face (`16-…` §1.6).
 *
 * The six expressions are the ones `11-…` §5 commissions as layers for
 * `#face-slot` — `face-idle`, `face-thinking`, `face-happy`, `face-confused`,
 * `face-celebrating`, `face-stopped`. That manifest also splits the work:
 * **art supplies the layers, code drives them from session status.** This is
 * the code half, written now so that when WP18's art lands the swap is a
 * rendering change and not a rethink. Until then it drives the placeholder
 * glyph, which is what the Playroom draws the bot with today.
 *
 * Not a duplicate of the status lamp. The lamp answers "what is the machine
 * doing" — thinking, acting, paused, finished. The face answers "how is it
 * going", and the two part company exactly where it matters to a child: the
 * lamp says `finished` whether the bot won or ran out of steps, and it has
 * nothing at all to say about an action the world just refused.
 */
export type BotExpression = 'idle' | 'thinking' | 'happy' | 'confused' | 'celebrating' | 'stopped';

export interface BotMood {
	/** A guardrail stopped the run. */
	tripped: boolean;
	/** The run's verdict, once there is one. */
	outcome: RunOutcome | undefined;
	/** Waiting on the provider right now. */
	thinking: boolean;
	/**
	 * Did the most recent action succeed? `undefined` before the bot has tried
	 * anything. This is the one input the session did not already track, and it
	 * is the whole reason `confused` can exist.
	 */
	lastActionOk: boolean | undefined;
}

/**
 * Order matters, and it is an order of *significance to the watcher*, not of
 * anything technical. Finishing outranks thinking; a refusal outranks the
 * ordinary business of having acted.
 */
export function botExpression(mood: BotMood): BotExpression {
	// How a run ended is the loudest thing about it.
	if (mood.outcome === 'SUCCESS') return 'celebrating';
	if (mood.tripped || mood.outcome !== undefined) return 'stopped';

	if (mood.thinking) return 'thinking';

	// A refusal is worth a face for exactly as long as it is the latest thing
	// that happened — §1.2's point, that a child should be able to see the bot
	// not managing rather than infer it from a stalled run.
	if (mood.lastActionOk === false) return 'confused';
	if (mood.lastActionOk === true) return 'happy';

	// Nothing tried yet: a bot waiting to be sent in, which is most of the time
	// a child spends looking at this screen before pressing anything.
	return 'idle';
}

/*
 * The faces themselves used to live here, as six emoji, "until WP18's art".
 * They are now six drawn files, and the map from expression to picture is
 * `BOT_FACES` in `lib/assets/index.js` — with every other world-id-to-artefact
 * mapping, in the one module allowed to hold one.
 *
 * This module keeps what it was always actually for: deciding *which* face,
 * from a mood the engine's events describe. That decision was written before
 * the art existed precisely so the arrival of the art would be a rendering
 * change, and it was.
 */

/**
 * What a screen reader says instead of the glyph. The face is decoration for a
 * sighted child and pure information for everyone else, so it gets words.
 */
const WORDS: Record<BotExpression, string> = {
	idle: 'waiting',
	thinking: 'thinking',
	happy: 'getting on with it',
	confused: 'confused',
	celebrating: 'celebrating',
	stopped: 'stopped'
};

export function botExpressionWords(expression: BotExpression): string {
	return WORDS[expression];
}
