import { describe, expect, it } from 'vitest';
import { action, context, tool } from '../test-context.js';
import { ACTION_BLOCKLIST_ID, createActionBlocklistGuardrail } from './action-blocklist.js';
import { APPROVAL_MODE_ID, createApprovalModeGuardrail } from './approval-mode.js';
import { NO_REPETITION_ID, createNoRepetitionGuardrail } from './no-repetition.js';
import { STEP_BUDGET_ID, createStepBudgetGuardrail } from './step-budget.js';
import { TOKEN_BUDGET_ID, createTokenBudgetGuardrail } from './token-budget.js';
import { TOOL_BLOCKLIST_ID, createToolBlocklistGuardrail } from './tool-blocklist.js';

/**
 * The three V1 rules (08-GOVERNANCE-GUARDRAILS.md §3). Each is a pure function
 * of a `GuardrailContext`, so these tests need no session and no world.
 */

describe('step budget', () => {
	const guardrail = createStepBudgetGuardrail(5);

	it('allows a turn while budget remains, and says how much is left', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 3, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toStrictEqual({ allow: true, note: '2 turns left' });
	});

	it('stops the run on the turn the budget is reached', () => {
		// `usage.ticks` already counts the current turn at pre-think, so tripping
		// on `>=` matches the engine budget's timing exactly.
		const verdict = guardrail.check(
			context({ usage: { ticks: 5, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'The step budget of 5 turns is used up.',
			disposition: 'stop-run'
		});
	});

	it('stays tripped once past the budget', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 9, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('says "turn" rather than "turns" for a budget of one', () => {
		const verdict = createStepBudgetGuardrail(1).check(
			context({ usage: { ticks: 1, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toMatchObject({ reason: 'The step budget of 1 turn is used up.' });
	});

	it('runs before thinking, so a spent run does not pay for another completion', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-think']);
		expect(guardrail.id).toBe(STEP_BUDGET_ID);
		expect(guardrail.description).toBe('Stops the run after 5 turns.');
	});
});

describe('action blocklist', () => {
	const guardrail = createActionBlocklistGuardrail(['open', 'throw']);

	it('blocks a listed action without ending the run', () => {
		const verdict = guardrail.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'open is on the blocked list.',
			disposition: 'block-action'
		});
	});

	it('allows an action that is not listed', () => {
		expect(guardrail.check(context({ hook: 'pre-act', proposed: action('move') }))).toStrictEqual({
			allow: true
		});
	});

	it('never blocks a tool, only world actions', () => {
		// A tool of the same name is still allowed: looking is not changing.
		expect(guardrail.check(context({ hook: 'pre-act', proposed: tool('open') }))).toStrictEqual({
			allow: true
		});
	});

	it('allows when there is nothing proposed at all', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('describes itself by what it blocks', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.id).toBe(ACTION_BLOCKLIST_ID);
		expect(guardrail.description).toBe('Blocks these actions: open, throw.');
		expect(createActionBlocklistGuardrail([]).description).toBe('No actions are blocked.');
	});

	/**
	 * E6 (`14-…` §3): a spec blocks `starter/playroom/celebrate` because that is
	 * what the action is called; the model proposes `celebrate` because provider
	 * function names must be plain identifiers. The rule has to speak both.
	 */
	it('matches a qualified id in the list against the short name the model uses', () => {
		const qualified = createActionBlocklistGuardrail(['starter/playroom/celebrate']);
		expect(
			qualified.check(context({ hook: 'pre-act', proposed: action('celebrate') }))
		).toMatchObject({ allow: false, disposition: 'block-action' });
	});

	it('matches the other way round too, for a spec that names it bare', () => {
		const bare = createActionBlocklistGuardrail(['celebrate']);
		expect(
			bare.check(context({ hook: 'pre-act', proposed: action('starter/playroom/celebrate') }))
		).toMatchObject({ allow: false });
	});

	it('still lets a differently-named action through', () => {
		const qualified = createActionBlocklistGuardrail(['starter/playroom/celebrate']);
		expect(qualified.check(context({ hook: 'pre-act', proposed: action('move') }))).toStrictEqual({
			allow: true
		});
	});

	it('blocks nothing when the list is empty', () => {
		const empty = createActionBlocklistGuardrail([]);
		expect(empty.check(context({ hook: 'pre-act', proposed: action('open') }))).toStrictEqual({
			allow: true
		});
	});
});

describe('tool blocklist', () => {
	const guardrail = createToolBlocklistGuardrail(['connector_weather_alert']);

	it('blocks a listed tool without ending the run', () => {
		const verdict = guardrail.check(
			context({ hook: 'pre-act', proposed: tool('connector_weather_alert') })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'connector_weather_alert is on the blocked list.',
			disposition: 'block-action'
		});
	});

	it('allows a tool that is not listed', () => {
		expect(
			guardrail.check(context({ hook: 'pre-act', proposed: tool('connector_weather_forecast') }))
		).toStrictEqual({ allow: true });
	});

	it('never blocks an action, only tools', () => {
		expect(
			guardrail.check(context({ hook: 'pre-act', proposed: action('connector_weather_alert') }))
		).toStrictEqual({ allow: true });
	});

	it('allows when there is nothing proposed at all', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('describes itself by what it blocks', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.id).toBe(TOOL_BLOCKLIST_ID);
		expect(guardrail.description).toBe('Blocks these tools: connector_weather_alert.');
		expect(createToolBlocklistGuardrail([]).description).toBe('No tools are blocked.');
	});

	it('matches a qualified id in the list against the short name the model uses', () => {
		const qualified = createToolBlocklistGuardrail(['starter/connector_weather_alert']);
		expect(
			qualified.check(context({ hook: 'pre-act', proposed: tool('connector_weather_alert') }))
		).toMatchObject({ allow: false, disposition: 'block-action' });
	});

	it('blocks nothing when the list is empty', () => {
		const empty = createToolBlocklistGuardrail([]);
		expect(
			empty.check(context({ hook: 'pre-act', proposed: tool('connector_weather_alert') }))
		).toStrictEqual({ allow: true });
	});
});

describe('approval mode — everything', () => {
	const guardrail = createApprovalModeGuardrail('everything');

	it('pauses for a world action', () => {
		const verdict = guardrail.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({
			pause: true,
			reason: 'Approval mode is switched on, so a person checks every action first.'
		});
	});

	it('lets tools through — looking is free, changing things is not', () => {
		expect(guardrail.check(context({ hook: 'pre-act', proposed: tool('look') }))).toStrictEqual({
			allow: true
		});
	});

	it('allows when there is nothing proposed', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('is a pre-act rule', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.id).toBe(APPROVAL_MODE_ID);
		expect(guardrail.description).toContain('Asks a person');
	});
});

describe('approval mode — risky', () => {
	// A stand-in resolver: only "open" is risky, exactly as the Playroom's own
	// `riskTier` tagging (`14-…` §4.5) would resolve it, without this test
	// depending on any pack.
	const isRisky = (name: string) => name === 'open';

	it('pauses for a risky action', () => {
		const guardrail = createApprovalModeGuardrail('risky', isRisky);
		expect(guardrail.check(context({ hook: 'pre-act', proposed: action('open') }))).toStrictEqual({
			pause: true,
			reason: 'This is risky enough that a person checks it first.'
		});
	});

	it('lets a non-risky action straight through — the fatigue fix', () => {
		const guardrail = createApprovalModeGuardrail('risky', isRisky);
		expect(guardrail.check(context({ hook: 'pre-act', proposed: action('move') }))).toStrictEqual({
			allow: true
		});
	});

	it('treats an action with no resolver answer as not risky', () => {
		const guardrail = createApprovalModeGuardrail('risky');
		expect(guardrail.check(context({ hook: 'pre-act', proposed: action('open') }))).toStrictEqual({
			allow: true
		});
	});

	it('still lets tools through', () => {
		const guardrail = createApprovalModeGuardrail('risky', isRisky);
		expect(guardrail.check(context({ hook: 'pre-act', proposed: tool('open') }))).toStrictEqual({
			allow: true
		});
	});
});

describe('token budget', () => {
	const guardrail = createTokenBudgetGuardrail(1000);

	it('allows a turn while budget remains, and says how much is left', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 1, inputTokens: 400, outputTokens: 100 } })
		);
		expect(verdict).toStrictEqual({ allow: true, note: '500 tokens left' });
	});

	it('stops the run once spend reaches the budget', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 3, inputTokens: 700, outputTokens: 300 } })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'The token budget of 1000 is used up.',
			disposition: 'stop-run'
		});
	});

	it('stays tripped once past the budget', () => {
		const verdict = guardrail.check(
			context({ usage: { ticks: 3, inputTokens: 900, outputTokens: 900 } })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('runs before thinking, so a spent run does not pay for another completion', () => {
		expect(guardrail.hooks).toStrictEqual(['pre-think']);
		expect(guardrail.id).toBe(TOKEN_BUDGET_ID);
		expect(guardrail.description).toBe('Stops the run once it has spent 1000 tokens.');
	});
});

describe('no repetition (v2 — windowed, movement-exempt)', () => {
	const guardrail = createNoRepetitionGuardrail(3);

	/**
	 * A history builder that records what became of each decision, because v2
	 * exempts a `move` that worked. `ok: true` means the world did the thing;
	 * `blocked` means a guardrail stopped it before the world saw it; `denied`
	 * means a person said no.
	 */
	type Turn = { name: string; args?: unknown; ok?: boolean; blocked?: true; denied?: true } | null;

	function history(...turns: Turn[]) {
		const events: unknown[] = [];
		let sequence = 0;
		const envelope = (type: string, payload: unknown, tick: number) => ({
			id: `e${sequence++}`,
			runId: 'r',
			tick,
			timestamp: '2026-08-13T09:00:00.000Z',
			type,
			payload
		});

		turns.forEach((turn, index) => {
			const tick = index + 1;
			// `'args' in turn` rather than `turn.args ?? {}`: a call with no
			// arguments at all is a real case (`celebrate`), and the engine puts
			// the same value in the event and in the proposal, so the fixture must.
			const args = turn && 'args' in turn ? turn.args : {};
			events.push(
				envelope(
					'decision',
					{
						thought: 'hmm',
						call: turn ? { kind: 'action', name: turn.name, arguments: args } : null
					},
					tick
				)
			);
			if (!turn) return;
			if (turn.blocked) {
				events.push(
					envelope(
						'guardrail.tripped',
						{ guardrailId: 'x', hook: 'pre-act', reason: 'no', disposition: 'block-action' },
						tick
					)
				);
				return;
			}
			if (turn.denied) {
				events.push(envelope('approval.resolved', { approved: false }, tick));
				return;
			}
			events.push(
				envelope(
					'action.performed',
					{
						name: turn.name,
						arguments: args,
						result: { ok: turn.ok ?? false, narration: 'n', stateDiff: [] }
					},
					tick
				)
			);
		});
		return events;
	}

	const proposing = (name: string, args: unknown = {}) =>
		context({ hook: 'pre-act', proposed: action(name, args) });

	/** The proposal under judgement is always the newest decision in history. */
	const judging = (name: string, past: Turn[], args: unknown = {}) =>
		guardrail.check({
			...proposing(name, args),
			history: history(...past, { name, args })
		} as never);

	it('allows a move it has not made before', () => {
		expect(judging('open', [])).toMatchObject({ allow: true });
	});

	it('allows repeats right up to the limit', () => {
		expect(judging('open', [{ name: 'open' }, { name: 'open' }])).toMatchObject({ allow: true });
	});

	it('blocks the attempt past the limit, and says what to do instead', () => {
		const verdict = judging('open', [{ name: 'open' }, { name: 'open' }, { name: 'open' }]);
		expect(verdict).toMatchObject({ allow: false, disposition: 'block-action' });
		expect((verdict as { reason: string }).reason).toContain('Try something different');
	});

	it('does not end the run — a loop is a wasted turn, not a failure', () => {
		const verdict = judging(
			'open',
			Array.from({ length: 9 }, () => ({ name: 'open' }))
		);
		expect(verdict).toMatchObject({ disposition: 'block-action' });
	});

	/**
	 * Fixture 1 for `12-…` C3: the false positive that kept the rule switched
	 * off, and so kept every default bot loopable. A bot crossing the room is
	 * not a bot in a loop.
	 */
	it('never trips on moves that are working', () => {
		const walking = Array.from({ length: 6 }, () => ({
			name: 'move',
			args: { direction: 'east' },
			ok: true
		}));
		expect(judging('move', walking, { direction: 'east' })).toMatchObject({ allow: true });
	});

	it('still trips on a move that keeps failing — a wall is not progress', () => {
		const shoving = Array.from({ length: 4 }, () => ({
			name: 'move',
			args: { direction: 'north' }
		}));
		expect(judging('move', shoving, { direction: 'north' })).toMatchObject({ allow: false });
	});

	/**
	 * Fixture 2 for `12-…` C3: the loop v1 could not see. Alternating between
	 * two ideas never produced three *consecutive* repeats, so the streak rule
	 * watched the loop happen and said nothing.
	 */
	it('trips on a repeat that alternates with something else', () => {
		const alternating = [
			{ name: 'open' },
			{ name: 'move', args: { direction: 'north' }, ok: true },
			{ name: 'open' },
			{ name: 'move', args: { direction: 'north' }, ok: true },
			{ name: 'open' }
		];
		expect(judging('open', alternating)).toMatchObject({
			allow: false,
			disposition: 'block-action'
		});
	});

	/**
	 * The loop first reported from play: a bot beside the toy chest calling to
	 * a Teddy three squares away. Every `say` succeeded, and it was still the
	 * clearest loop in the box — a rule that counted only failures would sit
	 * and watch it happen.
	 */
	it('trips on the hello-loop, where every call succeeds and nothing changes', () => {
		const calling = Array.from({ length: 4 }, () => ({
			name: 'say',
			args: { text: 'Hello Teddy!' },
			ok: true
		}));
		expect(judging('say', calling, { text: 'Hello Teddy!' })).toMatchObject({ allow: false });
	});

	it('counts arguments, not just the name', () => {
		// Shoving north, then south, then north is two half-hearted loops, and
		// neither of them has reached the limit.
		const verdict = judging(
			'move',
			[
				{ name: 'move', args: { direction: 'north' } },
				{ name: 'move', args: { direction: 'south' } },
				{ name: 'move', args: { direction: 'north' } }
			],
			{ direction: 'north' }
		);
		expect(verdict).toMatchObject({ allow: true });
	});

	it('forgets repeats that have fallen out of the ten-turn window', () => {
		const old = [{ name: 'open' }, { name: 'open' }, { name: 'open' }];
		const since = Array.from({ length: 9 }, () => ({
			name: 'move',
			args: { direction: 'east' },
			ok: true
		}));
		expect(judging('open', [...old, ...since])).toMatchObject({ allow: true });
	});

	it('counts a guardrail block and a human refusal like any other repeat', () => {
		const verdict = judging('open', [
			{ name: 'open', blocked: true },
			{ name: 'open', denied: true },
			{ name: 'open' }
		]);
		expect(verdict).toMatchObject({ allow: false });
	});

	it('does not hold a turn that only thought against the bot', () => {
		// A tick that proposed nothing has no signature to repeat, and it must
		// not swallow the outcome of the turn before it either.
		const verdict = judging('open', [{ name: 'open' }, null, { name: 'open' }]);
		expect(verdict).toMatchObject({ allow: true, note: '2 of 3 repeats' });
	});

	it('ignores events that are not part of a decision', () => {
		const events = history(
			{ name: 'open' },
			{ name: 'open' },
			{ name: 'open' },
			{ name: 'open' }
		) as { type: string }[];
		const withNoise = [
			events[0]!,
			{ ...events[0]!, type: 'sense', payload: {} },
			...events.slice(1)
		];
		expect(guardrail.check({ ...proposing('open'), history: withNoise } as never)).toMatchObject({
			allow: false
		});
	});

	it('ignores outcome events that arrive before any decision', () => {
		// The opening `world.changed` and its neighbours precede tick one.
		const stray = [
			{
				id: 'e0',
				runId: 'r',
				tick: 0,
				timestamp: '2026-08-13T09:00:00.000Z',
				type: 'action.performed',
				payload: {
					name: 'move',
					arguments: {},
					result: { ok: true, narration: 'n', stateDiff: [] }
				}
			},
			...history({ name: 'open' })
		];
		expect(guardrail.check({ ...proposing('open'), history: stray } as never)).toMatchObject({
			allow: true
		});
	});

	it('allows when nothing is proposed', () => {
		expect(guardrail.check(context({ hook: 'pre-act' }))).toStrictEqual({ allow: true });
	});

	it('handles a call that carries no arguments at all', () => {
		// `celebrate` takes none, and a bot can absolutely get stuck on it.
		const verdict = guardrail.check({
			...context({
				hook: 'pre-act',
				proposed: { kind: 'action', name: 'celebrate', arguments: undefined }
			}),
			history: history(
				{ name: 'celebrate', args: undefined },
				{ name: 'celebrate', args: undefined },
				{ name: 'celebrate', args: undefined },
				{ name: 'celebrate', args: undefined }
			)
		} as never);
		expect(verdict).toMatchObject({ allow: false, disposition: 'block-action' });
	});

	it('describes itself with the limit it was given', () => {
		expect(guardrail.id).toBe(NO_REPETITION_ID);
		expect(guardrail.hooks).toStrictEqual(['pre-act']);
		expect(guardrail.description).toContain('3 times');
	});
});
