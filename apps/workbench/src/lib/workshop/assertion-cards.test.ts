import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { evaluateAssertion } from '@craftabot/evals';
import { LEAK_PHRASE } from '@craftabot/pack-starter';
import { createRegistry } from '../packs.js';
import { testBenchCards } from './assertion-cards.js';

const cards = testBenchCards(createRegistry());

/**
 * Each built-in card checked against the exact literal the real content it
 * mirrors actually uses — `LEAK_PHRASE`, `'toy chest'`, `'birdhouse'`/`'blue'`
 * — so a typo in a card's condition (a card that silently never fires) fails
 * here rather than being discovered by a player. The full "does the bench
 * screen agree" proof is `bench.spec.ts`'s e2e, played against a real
 * Workshop run rather than these hand-built fixtures.
 */

let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-18T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const acted = (name: string, args: unknown, tick = 1) =>
	event('action.performed', { name, arguments: args, result: { ok: true, narration: '' } }, tick);

function findCard(id: string) {
	const card = cards.find((c) => c.id === id);
	if (!card) throw new Error(`no built-in card ${id}`);
	return card;
}

describe('testBenchCards', () => {
	it('is well-formed and unique by id', () => {
		expect(cards.length).toBeGreaterThan(0);
		expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
	});

	it('no-loose-ends passes when everything lands in the toy chest, fails when something does not', () => {
		const card = findCard('starter/testbench/no-loose-ends');
		expect(
			evaluateAssertion(card, [acted('put_down', { item: 'ball', container: 'toy chest' })]).pass
		).toBe(true);
		expect(
			evaluateAssertion(card, [acted('put_down', { item: 'ball', container: 'floor' })]).pass
		).toBe(false);
	});

	it('no-secrets-out-loud fires on the exact leak phrase and nothing else', () => {
		const card = findCard('starter/testbench/no-secrets-out-loud');
		expect(evaluateAssertion(card, [acted('say', { text: 'Hello Teddy!' })]).pass).toBe(true);
		expect(evaluateAssertion(card, [acted('say', { text: LEAK_PHRASE })]).pass).toBe(false);
	});

	it('opens-the-chest passes only once an open actually ran', () => {
		const card = findCard('starter/testbench/opens-the-chest');
		expect(evaluateAssertion(card, []).pass).toBe(false);
		expect(evaluateAssertion(card, [acted('open', { container: 'toy chest' })]).pass).toBe(true);
	});

	it('paints-the-birdhouse-blue matches the Workshop par-10 plan exactly', () => {
		const card = findCard('workshop/testbench/paints-the-birdhouse-blue');
		expect(
			evaluateAssertion(card, [acted('paint', { item: 'birdhouse', color: 'blue' })]).pass
		).toBe(true);
		expect(
			evaluateAssertion(card, [acted('paint', { item: 'birdhouse', color: 'red' })]).pass
		).toBe(false);
	});

	it('paints-only-the-birdhouse scopes the one irreversible action in the Workshop', () => {
		const card = findCard('workshop/testbench/paints-only-the-birdhouse');
		expect(
			evaluateAssertion(card, [acted('paint', { item: 'birdhouse', color: 'blue' })]).pass
		).toBe(true);
		expect(evaluateAssertion(card, [acted('paint', { item: 'shelf', color: 'red' })]).pass).toBe(
			false
		);
	});
});
