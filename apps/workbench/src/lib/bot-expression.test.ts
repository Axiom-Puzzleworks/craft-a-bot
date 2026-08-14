import { describe, expect, it } from 'vitest';
import { botExpression, botExpressionWords, botGlyph, type BotMood } from './bot-expression.js';

/**
 * **The bot's face** (`16-…` §1.6).
 *
 * The point of the face is to say the thing the status lamp cannot. The lamp is
 * about the machine — thinking, acting, paused, finished — and a child watching
 * a bot that has just been told "you cannot reach that" learns nothing from the
 * word `acting`.
 */
const mood = (over: Partial<BotMood> = {}): BotMood => ({
	tripped: false,
	outcome: undefined,
	thinking: false,
	lastActionOk: undefined,
	...over
});

describe('botExpression', () => {
	it('waits with an idle face before the bot has tried anything', () => {
		expect(botExpression(mood())).toBe('idle');
	});

	it('thinks while the provider is being waited on', () => {
		expect(botExpression(mood({ thinking: true }))).toBe('thinking');
	});

	it('gets on with it after an action the world accepted', () => {
		expect(botExpression(mood({ lastActionOk: true }))).toBe('happy');
	});

	/**
	 * The face `16-…` §1.2 asked for and slice b could not yet draw: a refusal
	 * that a child can see on the bot, not only in the story strip.
	 */
	it('looks confused after an action the world refused', () => {
		expect(botExpression(mood({ lastActionOk: false }))).toBe('confused');
	});

	it('celebrates a win', () => {
		expect(botExpression(mood({ outcome: 'SUCCESS' }))).toBe('celebrating');
	});

	/**
	 * Every other ending is `stopped` — a gentle power-down, per `11-…` §5's
	 * note that the stopped face is "never distressing". Running out of steps is
	 * not a failure a five-year-old should be made to feel bad about.
	 */
	it.each(['OUT_OF_STEPS', 'STOPPED_BY_USER', 'STOPPED_BY_GUARDRAIL', 'ERROR'] as const)(
		'powers down on %s',
		(outcome) => {
			expect(botExpression(mood({ outcome }))).toBe('stopped');
		}
	);

	it('powers down when a guardrail trips', () => {
		expect(botExpression(mood({ tripped: true }))).toBe('stopped');
	});

	/**
	 * Order-of-significance checks. These are the pairs where two things are
	 * true at once and only one belongs on the face.
	 */
	it('celebrates a win even if the last action was refused on the way', () => {
		expect(botExpression(mood({ outcome: 'SUCCESS', lastActionOk: false }))).toBe('celebrating');
	});

	it('stops rather than thinks, when a tripped run is still mid-thought', () => {
		expect(botExpression(mood({ tripped: true, thinking: true }))).toBe('stopped');
	});

	it('thinks rather than dwelling on the last refusal', () => {
		expect(botExpression(mood({ thinking: true, lastActionOk: false }))).toBe('thinking');
	});
});

describe('the placeholder faces', () => {
	/**
	 * WP18 replaces these with `#face-slot` layers. Until then every expression
	 * still has to draw *something* — a missing glyph is an invisible bot.
	 */
	it('gives every expression a glyph and a word', () => {
		const all = ['idle', 'thinking', 'happy', 'confused', 'celebrating', 'stopped'] as const;

		for (const expression of all) {
			expect(botGlyph(expression)).not.toBe('');
			expect(botExpressionWords(expression)).not.toBe('');
		}
	});

	it('says the confused face out loud, for a reader who cannot see it', () => {
		expect(botExpressionWords('confused')).toBe('confused');
	});
});
