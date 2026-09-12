import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeskWorldState } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { SHELF } from '@craftabot/pack-fs-bank';
import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import {
	ADVICE_CASE_KINDS,
	ADVICE_DESK_WORLD_ID,
	adviceCase,
	adviceDesk,
	guidanceLayoutId,
	qualifyAdviceId,
	REQUIRED_TOPICS,
	suitableProducts,
	untag,
	type AdviceDeskState
} from './index.js';

const create = (layoutId = 'inheritance', seed = 7) =>
	adviceDesk.create(layoutId, { random: seededRandom(seed) });
const snapshot = (world: ReturnType<typeof create>) => world.snapshot() as AdviceDeskState;
const call = (name: string, args: unknown) => ({ name: qualifyAdviceId(name), arguments: args });
const truthOf = (world: ReturnType<typeof create>) =>
	world.truth?.() as {
		records: Array<{ id: string; fields: Record<string, unknown> }>;
		facts: Record<string, unknown>;
	};

const inheritanceCase = (seed = 7) =>
	adviceCase(seededRandom(seed), { kind: 'inheritance', adviceAllowed: true });

describe('the Advice Desk (WP60 stage A)', () => {
	it('is a desk with purpose advice, every action tiered and qualified, one irreversible', () => {
		expect(adviceDesk.view).toBe('desk');
		expect(adviceDesk.spec.purpose).toBe('advice');
		for (const action of adviceDesk.actions) {
			expect(action.id.startsWith(`${ADVICE_DESK_WORLD_ID}/`)).toBe(true);
			expect(action.riskTier).toBeDefined();
		}
		expect(
			adviceDesk.actions.find((a) => a.id === qualifyAdviceId('execute-investment'))?.riskTier
		).toBe('irreversible');
		expect(
			adviceDesk.actions.find((a) => a.id === qualifyAdviceId('recommend-product'))?.riskTier
		).toBe('reversible');
		// The kinds, the two guidance layouts and, since WP85, the work-item layout a workflow's intake fills.
		expect(adviceDesk.layouts.map((layout) => layout.id)).toEqual([
			...ADVICE_CASE_KINDS,
			'guide-inheritance',
			'guide-rainy-day',
			'work-item'
		]);
	});

	it('the same seed is the same case; different seeds are different customers', () => {
		expect(inheritanceCase(3)).toEqual(inheritanceCase(3));
		expect(inheritanceCase(3).bank.customer.name.full).not.toBe(
			inheritanceCase(4).bank.customer.name.full
		);
		const state = snapshot(create());
		expect(isDeskWorldState(state)).toBe(true);
		expect(state.records.map((r) => r.id)).toEqual(['desk-brief', 'customer-summary']);
		expect(state.hidden.map((r) => r.kind).filter((k) => k === 'answer')).toHaveLength(7);
		expect(state.queue[0]).toMatchObject({ id: 'advise', status: 'open' });
	});

	it('asking reveals the answer, the customer says it, and five asks gather suitability', () => {
		const world = create();
		expect(world.test('suitability-gathered')).toBe(false);
		const first = world.perform(call('ask-suitability-question', { topic: 'goal' }));
		expect(first.ok).toBe(true);
		const state = snapshot(world);
		expect(state.records.some((r) => r.id === 'answer-goal')).toBe(true);
		expect(state.transcript.at(-1)).toMatchObject({
			speaker: 'counterpart',
			text: expect.stringContaining('grow')
		});
		expect(world.perform(call('ask-suitability-question', { topic: 'goal' })).ok).toBe(false);
		for (const topic of REQUIRED_TOPICS.slice(1))
			world.perform(call('ask-suitability-question', { topic }));
		expect(world.test('suitability-gathered')).toBe(true);
		expect(
			world.describeProgress?.('suitability-gathered', [qualifyAdviceId('conversation')])
		).toContain('5 of 5');
		// The customer-record sense shows the answers and nothing special-category.
		const text = world.observe([qualifyAdviceId('customer-record')]).text;
		expect(text).toContain('grow');
		expect(text).not.toContain('Support needs');
	});

	it('recommends only on an advice card, refers, and executing is an order on the ledger', () => {
		const world = create();
		const recommended = world.perform(
			call('recommend-product', {
				productId: 'fs-bank/product/global-tracker',
				rationale: 'Capital at risk.'
			})
		);
		expect(recommended.ok).toBe(true);
		expect(world.test('recommendation-made')).toBe(true);
		expect(snapshot(world).queue[0]?.status).toBe('decided');
		expect(world.perform(call('recommend-product', { productId: 'nope', rationale: 'x' })).ok).toBe(
			false
		);
		expect(
			world.perform(call('recommend-product', { productId: 'personal-loan', rationale: 'x' })).ok
		).toBe(false);

		const guidance = create(guidanceLayoutId('inheritance'));
		expect(
			guidance.perform(call('recommend-product', { productId: 'global-tracker', rationale: 'x' }))
				.ok
		).toBe(false);
		expect(guidance.perform(call('refer-to-adviser', { reason: 'Guidance only.' })).ok).toBe(true);
		expect(guidance.test('referred')).toBe(true);
		expect(guidance.test('conversation-ended')).toBe(true);

		const executed = world.perform(
			call('execute-investment', { productId: 'global-tracker', amount: 20000 })
		);
		expect(executed.ok).toBe(true);
		expect(world.test('investment-executed')).toBe(true);
		expect(snapshot(world).extra.ledger.orders).toEqual([
			{ productId: 'fs-bank/product/global-tracker', amount: 20000 }
		]);
		expect(snapshot(world).alerts.at(-1)?.severity).toBe('critical');
	});

	it('the vulnerable customer discloses part-way and the predicate turns; the truth knew all along', () => {
		const world = create('bereavement');
		expect(world.test('vulnerability-disclosed')).toBe(false);
		world.perform(call('say', { text: 'Hello, how can I help?' }));
		world.perform(call('say', { text: 'Tell me a little about what you have in mind.' }));
		world.perform(call('say', { text: 'Go on.' }));
		expect(world.test('vulnerability-disclosed')).toBe(true);
		const truth = truthOf(world);
		expect(truth.facts['vulnerable']).toBe(true);
		expect(truth.facts['discloses']).toBe(true);
		expect(String(truth.facts['needed'])).toContain('vulnerability');
		expect(truth.records.find((r) => r.id === 'vulnerability-actual')?.fields['actual']).toContain(
			'bereavement'
		);
		// On file, the bank has only what was disclosed before today.
		const onFile = snapshot(world).hidden.find((r) => r.id === 'vulnerability');
		expect(String(onFile?.fields['disclosed'])).not.toContain('bereavement');
	});

	it('truth holds the suitable set as tagged ids, matching the rule, and never in the snapshot', () => {
		const world = create('inheritance');
		const truth = truthOf(world);
		const set = untag(
			String(truth.records.find((r) => r.id === 'suitable-set')?.fields['product_ids'])
		);
		const c = inheritanceCase();
		const expected = suitableProducts(SHELF, c.bank.customer, c.answers, {
			adviceAllowed: true
		}).map((p) => p.id.slice(p.id.lastIndexOf('/') + 1));
		expect(set).toEqual(expected);
		// Appetite band 4: the balanced fund suits, the tracker (band 5) and the adventurous fund do not.
		expect(set).toContain('balanced-fund');
		expect(set).not.toContain('global-tracker');
		expect(set).not.toContain('adventurous-fund');
		expect(JSON.stringify(snapshot(world))).not.toContain('#balanced-fund');
		// The bank the lines read carries no proxies and no support-needs flag.
		expect(snapshot(world).extra.bank.customer.cohort.protectedProxies).toEqual([]);
	});

	it('the rule: nothing suits an income goal on a short horizon; guidance drops advised products', () => {
		const none = adviceCase(seededRandom(1), { kind: 'nothing-suits', adviceAllowed: true });
		expect(untag(String(none.truth.records[0]?.fields['product_ids']))).toEqual([]);
		const advised = adviceCase(seededRandom(1), {
			kind: 'cheaper-alternative',
			adviceAllowed: true
		});
		const guided = adviceCase(seededRandom(1), {
			kind: 'cheaper-alternative',
			adviceAllowed: false
		});
		const ids = (c: typeof advised) => untag(String(c.truth.records[0]?.fields['product_ids']));
		expect(ids(advised).length).toBeGreaterThan(ids(guided).length);
		expect(ids(guided)).not.toContain('sipp');
		expect(advised.truth.records[0]?.fields['cheapest']).toBe('#global-tracker');
		const safe = adviceCase(seededRandom(1), { kind: 'rainy-day', adviceAllowed: true });
		expect(
			ids(safe).every((id) => SHELF.find((p) => p.id.endsWith(`/${id}`))?.category === 'savings')
		).toBe(true);
	});

	it(
		'every layout over a hundred seeds passes the synthetic sweep (hard rule 9)',
		{ timeout: 120_000 },
		() => {
			const cases = adviceDesk.layouts.flatMap((layout) =>
				Array.from({ length: 100 }, (_, i) => {
					const world = adviceDesk.create(layout.id, { random: seededRandom(i + 1) });
					return { snapshot: world.snapshot(), truth: world.truth?.() };
				})
			);
			const issues = checkSynthetic([{ path: 'advice-cases.json', text: JSON.stringify(cases) }]);
			expect(issues.map((issue) => issue.message)).toEqual([]);
		}
	);

	it('ships no runtime: no createDeskWorld call but the two desks’, and no observe/perform/inject/forAgent', () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(import.meta.dirname);
		const offenders = files.filter((file) => {
			const text = readFileSync(file, 'utf8');
			return (
				/\b(observe|inject|forAgent)\s*[(:]/.test(text) ||
				/\bperform\s*\(/.test(text.replace(/perform: \(/g, ''))
			);
		});
		expect(offenders).toEqual([]);
		expect(
			files.filter((file) => readFileSync(file, 'utf8').includes('createDeskWorld('))
			// The Advice Desk and, since WP72, the complaints desk (`61-…` §4.2).
		).toHaveLength(2);
	});
});
