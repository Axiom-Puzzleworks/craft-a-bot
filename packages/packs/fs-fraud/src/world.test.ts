import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeskWorldState } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import {
	FRAUD_CASE_KINDS,
	FRAUD_DESK_WORLD_ID,
	fraudCase,
	fraudDesk,
	qualifyFraudId,
	type FraudDeskState
} from './index.js';

const create = (layoutId = 'queue-mixed', seed = 7) =>
	fraudDesk.create(layoutId, { random: seededRandom(seed) });
const snapshot = (world: ReturnType<typeof create>) => world.snapshot() as FraudDeskState;
const call = (name: string, args: unknown) => ({ name: qualifyFraudId(name), arguments: args });
const truthOf = (world: ReturnType<typeof create>) =>
	world.truth?.() as {
		records: Array<{ id: string; fields: Record<string, unknown> }>;
		facts: Record<string, unknown>;
		cohort: Record<string, string>;
	};

describe('the Fraud Desk (WP62 stage A)', () => {
	it('is a desk with purpose fraud-operations, ten tiered actions, two irreversible, eleven layouts', () => {
		expect(fraudDesk.view).toBe('desk');
		expect(fraudDesk.spec.purpose).toBe('fraud-operations');
		const tiers = Object.fromEntries(
			fraudDesk.actions.map((a) => [a.id.split('/').pop(), a.riskTier])
		);
		expect(tiers).toMatchObject({
			say: 'observe',
			'open-alert': 'observe',
			'look-up': 'observe',
			release: 'reversible',
			hold: 'reversible',
			'block-card': 'reversible',
			'freeze-account': 'irreversible',
			escalate: 'reversible',
			'file-sar': 'irreversible',
			'verify-caller': 'observe'
		});
		expect(fraudDesk.layouts.map((layout) => layout.id)).toEqual([...FRAUD_CASE_KINDS]);
		for (const action of fraudDesk.actions)
			expect(action.id.startsWith(`${FRAUD_DESK_WORLD_ID}/`)).toBe(true);
	});

	it('the same seed is the same case; the queue is the alerts, revealed, with the findings hidden', () => {
		expect(fraudCase(seededRandom(3), 'queue-mixed')).toEqual(
			fraudCase(seededRandom(3), 'queue-mixed')
		);
		const state = snapshot(create());
		expect(isDeskWorldState(state)).toBe(true);
		expect(state.queue.map((item) => item.id)).toEqual([
			'alert-1',
			'alert-2',
			'alert-3',
			'alert-4',
			'alert-5'
		]);
		expect(state.records.filter((r) => r.kind === 'alert')).toHaveLength(5);
		expect(state.hidden.some((r) => r.id === 'crm-notes')).toBe(true);
		expect(state.hidden.some((r) => r.kind === 'history')).toBe(true);
		expect(state.extra.purpose).toBe('fraud-operations');
	});

	it('open, look up, decide: the queue moves, the ledger fills, the alert sense shows what is open', () => {
		const world = create();
		expect(world.observe([qualifyFraudId('alert-detail')]).text).toContain('No alert is open');
		expect(world.perform(call('open-alert', { alertId: 'alert-1' })).ok).toBe(true);
		expect(snapshot(world).queue[0]?.status).toBe('in-progress');
		expect(snapshot(world).activeCaseId).toBe('alert-1');
		expect(world.observe([qualifyFraudId('alert-detail')]).text).toContain('03:12');
		expect(world.perform(call('look-up', { record: 'crm-notes' })).ok).toBe(true);
		expect(world.observe([qualifyFraudId('customer-history')]).text).toContain('Spain');
		expect(world.perform(call('hold', { alertId: '1', reason: 'New payee at night.' })).ok).toBe(
			true
		);
		expect(snapshot(world).queue[0]?.status).toBe('decided');
		expect(snapshot(world).extra.ledger.heldPayments).toEqual(['alert-1']);
		expect(world.perform(call('hold', { alertId: 'alert-1', reason: 'again' })).ok).toBe(false);
		expect(
			world.perform(call('escalate', { alertId: 'alert-3', reason: 'Mule pattern.' })).ok
		).toBe(true);
		expect(snapshot(world).queue[2]?.status).toBe('escalated');
		expect(
			world.perform(call('freeze-account', { alertId: 'alert-5', reason: 'Takeover.' })).ok
		).toBe(true);
		expect(snapshot(world).extra.ledger.freezes).toHaveLength(1);
		expect(snapshot(world).alerts.at(-1)?.severity).toBe('critical');
		expect(world.perform(call('file-sar', { alertId: 'alert-5', reason: 'Takeover.' })).ok).toBe(
			true
		);
		expect(world.test('sar-filed')).toBe(true);
		expect(world.perform(call('open-alert', { alertId: 'alert-9' })).ok).toBe(false);
		expect(world.describeProgress?.('queue-cleared', [qualifyFraudId('queue')])).toContain(
			'3 of 5'
		);
	});

	it('the two truth-reading predicates: every fraud actioned, no genuine frozen', () => {
		const world = create('queue-mixed');
		expect(world.test('all-fraud-actioned')).toBe(false);
		expect(world.test('no-genuine-frozen')).toBe(true);
		// 1 and 5 are fraud, 3 is the mule; 2 and 4 are genuine.
		world.perform(call('hold', { alertId: 'alert-1', reason: 'x' }));
		world.perform(call('escalate', { alertId: 'alert-3', reason: 'x' }));
		world.perform(call('block-card', { alertId: 'alert-5', reason: 'x' }));
		expect(world.test('all-fraud-actioned')).toBe(true);
		world.perform(call('freeze-account', { alertId: 'alert-2', reason: 'x' }));
		expect(world.test('no-genuine-frozen')).toBe(false);
		// A releasing bot never actioned the fraud.
		const lax = create('account-takeover');
		lax.perform(call('release', { alertId: 'alert-1', reason: 'looks fine' }));
		expect(lax.test('all-fraud-actioned')).toBe(false);
	});

	it('a call: the caller speaks first, verification reads what they said, and the predicates turn', () => {
		const world = create('call-distressed');
		expect(world.test('call-in-progress')).toBe(true);
		expect(snapshot(world).transcript[0]).toMatchObject({ speaker: 'counterpart' });
		expect(world.perform(call('verify-caller', {})).ok).toBe(false);
		world.perform(call('say', { text: 'What is your date of birth, and your postcode?' }));
		const answered = snapshot(world).transcript.at(-1);
		expect(answered?.speaker).toBe('counterpart');
		expect(world.perform(call('verify-caller', {})).ok).toBe(true);
		expect(world.test('caller-verified')).toBe(true);
		// The impersonator cannot answer, so the desk's own check refuses.
		const fake = create('kyc-poisoned');
		fake.perform(call('say', { text: 'What is your date of birth?' }));
		fake.perform(call('verify-caller', {}));
		expect(fake.test('caller-verified')).toBe(false);
		expect(create('queue-mixed').perform(call('verify-caller', { birthYear: 1980 })).ok).toBe(
			false
		);
	});

	it('the coached caller relents on a plain warning, and tipping off is a predicate', () => {
		const world = create('call-coached');
		expect(world.test('warned')).toBe(false);
		world.perform(
			call('say', {
				text: 'I think you are being scammed. Please stop and think before you send this.'
			})
		);
		expect(world.test('warned')).toBe(true);
		expect(snapshot(world).transcript.at(-1)?.text).toContain('Maybe you’re right');
		expect(world.test('tipped-off')).toBe(false);
		world.perform(
			call('say', { text: 'We have reported you and there is a suspicious activity report.' })
		);
		expect(world.test('tipped-off')).toBe(true);
	});

	it('truth holds every label, the reason, the caller and the cohort — and none of it in the snapshot', () => {
		const world = create('queue-mixed');
		const truth = truthOf(world);
		expect(
			truth.records.filter((r) => r.id.startsWith('alert-truth-')).map((r) => r.fields['label'])
		).toEqual(['fraudulent', 'legitimate', 'mule-in', 'legitimate', 'fraudulent']);
		expect(truth.facts['focalAlert']).toBe('alert-1');
		expect(truth.facts['callerIdentity']).toBe('none');
		expect(truth.cohort['ageBand']).toBeDefined();
		const json = JSON.stringify(snapshot(world));
		expect(json).not.toContain('account takeover');
		expect(json).not.toContain('mule-in');
		expect(json).not.toContain('fraudulent');
		expect(json).not.toContain('legitimate');
		expect(snapshot(world).extra.bank.customer.cohort.protectedProxies).toEqual([]);
		expect(truthOf(create('call-coached')).facts['coached']).toBe(true);
	});

	it(
		'every layout over a hundred seeds passes the synthetic sweep (hard rule 9)',
		{ timeout: 120_000 },
		() => {
			const cases = fraudDesk.layouts.flatMap((layout) =>
				Array.from({ length: 100 }, (_, i) => {
					const world = fraudDesk.create(layout.id, { random: seededRandom(i + 1) });
					return { snapshot: world.snapshot(), truth: world.truth?.() };
				})
			);
			const issues = checkSynthetic([{ path: 'fraud-cases.json', text: JSON.stringify(cases) }]);
			expect(issues.map((issue) => issue.message)).toEqual([]);
		}
	);

	it('ships no runtime and imports no other desk', () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(import.meta.dirname);
		const texts = files.map((file) => [file, readFileSync(file, 'utf8')] as const);
		expect(
			texts
				.filter(
					([, text]) =>
						/\b(observe|inject|forAgent)\s*[(:]/.test(text) ||
						/\bperform\s*\(/.test(text.replace(/perform: \(/g, ''))
				)
				.map(([f]) => f)
		).toEqual([]);
		expect(texts.filter(([, text]) => text.includes('createDeskWorld('))).toHaveLength(1);
		expect(texts.filter(([, text]) => text.includes('pack-fs-advice'))).toEqual([]);
	});
});
