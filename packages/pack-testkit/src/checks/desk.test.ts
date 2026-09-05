import type {
	DeskWorldState,
	WorldActionDefinition,
	WorldDefinition,
	WorldInstance
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkDesk } from './desk.js';

/**
 * `checkDesk` (WP53 stage C, `43-…` §4.8), proven against hand-written desks
 * — the testkit depends on `core` only, so it cannot use `@craftabot/desk`
 * to build its fixtures, and it should not: a kit that only ever saw the
 * runtime's own output would be testing the runtime, not the contract. The
 * three failing desks are the DoD's own (`42-…` WP53): an action without a
 * tier, a `perform` that reads `Date`, a sense that reveals a
 * `special-category` record on a desk with no purpose.
 */
type State = DeskWorldState & {
	tick: number;
	hidden: {
		id: string;
		kind: string;
		title: string;
		fields: Record<string, string>;
		classification?: 'public' | 'personal' | 'special-category';
	}[];
};

function opening(): State {
	return {
		desk: { title: 'A desk', role: 'Clerk' },
		records: [{ id: 'notice', kind: 'notice', title: 'Notice', fields: { text: 'Hello' } }],
		hidden: [
			{
				id: 'health',
				kind: 'health',
				title: 'Health note',
				fields: { text: 'Private' },
				classification: 'special-category'
			}
		],
		transcript: [],
		queue: [{ id: 'job', title: 'Job', status: 'open', recordIds: [] }],
		alerts: [],
		tick: 0
	};
}

interface Knobs {
	/** Give the desk a truth (WP54); `leaksTruth` puts it into the look sense, `snapshotsTruth` into the state. */
	truth?: boolean;
	leaksTruth?: boolean;
	snapshotsTruth?: boolean;
	tier?: boolean;
	readsClock?: boolean;
	revealsHealth?: boolean;
	purpose?: string;
	noInject?: boolean;
	view?: 'grid' | 'desk';
}

function desk(knobs: Knobs = {}): WorldDefinition & { purpose?: string } {
	const tier = knobs.tier ?? true;
	const actions: WorldActionDefinition[] = [
		{
			id: 'd/say',
			name: 'Say',
			description: 'Say.',
			parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
			...(tier ? { riskTier: 'observe' as const } : {})
		}
	];
	const create = (_layoutId: string, options?: { random?: () => number }): WorldInstance => {
		let state = opening();
		const draw = options?.random ?? (() => 0.25);
		const verdict = draw() < 0.5 ? 'genuine-visitor' : 'impostor-visitor';
		const truth = { records: [], facts: { verdict } };
		if (knobs.snapshotsTruth) (state as State & { truth?: unknown }).truth = truth;
		return {
			snapshot: () => structuredClone(state),
			observe: (channels) => ({
				channels: [...channels],
				text: `${
					knobs.revealsHealth
						? `On the desk: ${[...state.records, ...state.hidden].map((r) => r.title).join(', ')}`
						: `On the desk: ${state.records.map((r) => r.title).join(', ')}`
				}${knobs.leaksTruth ? ` (${verdict})` : ''}`
			}),
			...(knobs.truth || knobs.leaksTruth || knobs.snapshotsTruth
				? { truth: () => structuredClone(truth) }
				: {}),
			perform: (call) => {
				state.tick += 1;
				if (knobs.readsClock)
					state.transcript.push({
						seq: 1,
						tick: Date.now(),
						speaker: 'agent',
						speakerName: 'You',
						text: 'x'
					});
				const text = (call.arguments as { text?: string } | undefined)?.text;
				if (!text) return { ok: false, narration: 'Say what?', stateDiff: [] };
				state.transcript.push({
					seq: state.transcript.length + 1,
					tick: state.tick,
					speaker: 'agent',
					speakerName: 'You',
					text
				});
				return { ok: true, narration: `You say ${text}`, stateDiff: [] };
			},
			test: (predicate) => predicate === 'spoke' && state.transcript.length > 0,
			reset: () => {
				state = opening();
				if (knobs.snapshotsTruth) (state as State & { truth?: unknown }).truth = truth;
			},
			receiveInput: (text) => {
				state.transcript.push({
					seq: state.transcript.length + 1,
					tick: state.tick,
					speaker: 'counterpart',
					speakerName: 'V',
					text
				});
			},
			...(knobs.noInject
				? {}
				: {
						inject: (injection) => {
							if (injection.kind === 'heard')
								state.transcript.push({
									seq: state.transcript.length + 1,
									tick: state.tick,
									speaker: 'counterpart',
									speakerName: 'V',
									text: injection.text
								});
							if (injection.kind === 'manual-entry')
								state.records.push({
									id: `manual/${injection.key}`,
									kind: 'manual',
									title: injection.key,
									fields: { text: injection.text }
								});
							if (injection.kind === 'radio')
								state.transcript.push({
									seq: state.transcript.length + 1,
									tick: state.tick,
									speaker: 'system',
									speakerName: injection.fromName,
									text: injection.text,
									channel: injection.channel
								});
							// tool-result deliberately ignored: this desk declines it.
						}
					})
		};
	};
	return {
		id: 'd',
		name: 'A desk',
		view: knobs.view ?? 'desk',
		layouts: [{ id: 'a', name: 'A', initialState: opening() }],
		actions,
		senses: [{ id: 'd/look', name: 'Look', description: 'Look.' }],
		predicates: { spoke: 'Spoke.' },
		create,
		...(knobs.purpose !== undefined ? { purpose: knobs.purpose } : {})
	};
}

const SCRIPTS = { speak: { layoutId: 'a', calls: [{ name: 'd/say', arguments: { text: 'hi' } }] } };
const ILLEGAL = [{ layoutId: 'a', call: { name: 'd/say', arguments: {} } }];
const fixture = {
	scripts: SCRIPTS,
	illegalActions: ILLEGAL,
	acceptedInjections: ['heard', 'manual-entry', 'radio'] as const
};

describe('checkDesk', () => {
	it('passes a well-behaved desk with a purpose', () => {
		expect(
			checkDesk(desk({ purpose: 'clerking' }), {
				...fixture,
				acceptedInjections: [...fixture.acceptedInjections]
			})
		).toEqual([]);
	});

	it('refuses a world that is not a desk', () => {
		expect(checkDesk(desk({ view: 'grid' })).map((i) => i.check)).toEqual(['desk.view']);
	});

	it('rejects a desk whose action lacks a tier', () => {
		const issues = checkDesk(desk({ tier: false, purpose: 'clerking' }));
		expect(issues.map((i) => i.check)).toContain('desk.action-tier');
		expect(issues.find((i) => i.check === 'desk.action-tier')?.message).toContain('d/say');
	});

	it('rejects a desk whose perform reads Date', () => {
		const issues = checkDesk(desk({ readsClock: true, purpose: 'clerking' }), { scripts: SCRIPTS });
		expect(
			issues.some((i) => i.check === 'desk.perform-pure' && i.message.includes('the clock'))
		).toBe(true);
	});

	it('rejects a desk whose sense reveals a special-category record outside any purpose, and accepts it under one', () => {
		const leaky = checkDesk(desk({ revealsHealth: true }));
		expect(
			leaky.some((i) => i.check === 'desk.purpose-classification' && i.message.includes('"health"'))
		).toBe(true);
		expect(
			checkDesk(desk({ revealsHealth: true, purpose: 'health-desk' })).map((i) => i.check)
		).not.toContain('desk.purpose-classification');
		// Hidden but not revealed, no purpose: fine — nothing reached the bot.
		expect(checkDesk(desk()).map((i) => i.check)).not.toContain('desk.purpose-classification');
	});

	it('checks the four injection kinds against what the fixture says the desk accepts', () => {
		const noDoor = checkDesk(desk({ noInject: true, purpose: 'p' }));
		expect(
			noDoor.some((i) => i.check === 'desk.injections' && i.message.includes('no inject door'))
		).toBe(true);
		// This desk ignores tool-result; a fixture claiming it accepts everything is wrong about that.
		const overclaims = checkDesk(desk({ purpose: 'p' }), {
			acceptedInjections: ['heard', 'manual-entry', 'radio', 'tool-result']
		});
		expect(
			overclaims.some((i) => i.check === 'desk.injections' && i.message.includes('tool-result'))
		).toBe(true);
		// And a fixture claiming it declines `heard` is wrong the other way.
		const underclaims = checkDesk(desk({ purpose: 'p' }), {
			acceptedInjections: ['manual-entry', 'radio']
		});
		expect(
			underclaims.some((i) => i.check === 'desk.injections' && i.message.includes('heard'))
		).toBe(true);
	});

	it('restores the clock and randomness after the purity check, whatever happened', () => {
		checkDesk(desk({ readsClock: true, purpose: 'p' }), { scripts: SCRIPTS });
		expect(typeof Date.now()).toBe('number');
		expect(Math.random()).toBeLessThan(1);
		expect(typeof crypto.randomUUID()).toBe('string');
	});
});

describe('checkDesk: the truth property (WP54, `45-…` §4.3)', () => {
	it('passes a desk that keeps its truth to itself, over a hundred seeds and the scripts', () => {
		expect(
			checkDesk(desk({ truth: true, purpose: 'p' }), {
				scripts: SCRIPTS,
				acceptedInjections: [...fixture.acceptedInjections]
			})
		).toEqual([]);
	});

	it('rejects a desk whose sense lets a truth-only value out, naming the sense and the value', () => {
		const issues = checkDesk(desk({ leaksTruth: true, purpose: 'p' }));
		const leak = issues.find((i) => i.check === 'desk.truth-never-sensed');
		expect(leak?.message).toContain('sense "d/look"');
		expect(leak?.message).toMatch(/genuine-visitor|impostor-visitor/);
	});

	it('rejects a desk that carries its truth in the snapshot', () => {
		const issues = checkDesk(desk({ snapshotsTruth: true, purpose: 'p' }));
		expect(issues.map((i) => i.check)).toContain('desk.truth-not-in-snapshot');
	});
});
