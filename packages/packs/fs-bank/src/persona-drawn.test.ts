import { describeScriptProblems } from '@craftabot/desk';
import { describe, expect, it } from 'vitest';
import { bankCase } from './generate/case.js';
import { personaFor, styleLine, voiceFor, type Voice } from './persona-drawn.js';
import { PERSONA_IDS, persona } from './personas.js';

/**
 * **A persona drawn from the cohort** (WP174; G152): the anchor chosen by what
 * the customer is, the voice drawn from the seed, the words restyled and the
 * triggers, pressure and tags left exactly as the anchor wrote them.
 */
const customers = Array.from({ length: 400 }, (_, i) => bankCase(i + 1).customer);

describe('personaFor', () => {
	it('is deterministic in the customer and the seed, and a different seed can speak differently', () => {
		const [c] = customers;
		expect(personaFor(c!, 5)).toEqual(personaFor(c!, 5));
		const voices = new Set(
			Array.from({ length: 40 }, (_, s) => JSON.stringify(personaFor(c!, s).voice))
		);
		expect(voices.size).toBeGreaterThan(1);
	});

	it('every drawn script passes the desk’s own script checks, whatever the cohort', () => {
		for (const [i, customer] of customers.entries()) {
			const drawn = personaFor(customer, i + 1);
			expect(describeScriptProblems(drawn.script), drawn.anchor).toEqual([]);
			expect(PERSONA_IDS).toContain(drawn.anchor);
		}
	});

	it('picks the anchor by the cohort: a support need gets a vulnerable caller, a low digital confidence a first-timer', () => {
		for (const [i, customer] of customers.entries()) {
			const drawn = personaFor(customer, i + 1);
			if (customer.cohort.supportNeeds)
				expect(['vulnerable', 'distressed-genuine']).toContain(drawn.anchor);
			else if (customer.digitalConfidence === 'low') expect(drawn.anchor).toBe('first-timer');
		}
		// Every anchor the rules reach is reached by some customer.
		const reached = new Set(customers.map((c, i) => personaFor(c, i + 1).anchor));
		expect(reached.size).toBeGreaterThanOrEqual(5);
	});

	it('keeps every rule’s trigger kind, pressure and tags, and never restyles an attack', () => {
		for (const [i, customer] of customers.slice(0, 120).entries()) {
			const drawn = personaFor(customer, i + 1);
			const anchor = persona(drawn.anchor, customer);
			expect(drawn.script.rules.map((r) => [r.id, r.when.kind, r.pressure, r.tags])).toEqual(
				anchor.rules.map((r) => [r.id, r.when.kind, r.pressure, r.tags])
			);
			for (const [k, rule] of drawn.script.rules.entries())
				if ((rule.tags ?? []).includes('prompt-injection'))
					expect(rule.say).toEqual(anchor.rules[k]!.say);
		}
	});

	it('reads how confident the customer is with the app from the customer, and says so on the persona', () => {
		for (const [i, customer] of customers.slice(0, 60).entries())
			expect(personaFor(customer, i + 1).digitalConfidence).toBe(customer.digitalConfidence);
	});
});

describe('voice and style', () => {
	const voice = (over: Partial<Voice>): Voice => ({
		register: 'casual',
		verbosity: 2,
		patience: 1,
		...over
	});

	it('a formal voice expands, a casual one contracts, a terse one stops at the first sentence', () => {
		const text = 'I’m sure I don’t know. I have time.';
		expect(styleLine(text, voice({ register: 'formal' }))).toBe(
			'I am sure I do not know. I have time.'
		);
		expect(styleLine('I am sure I do not know.', voice({ register: 'casual' }))).toBe(
			'I’m sure I don’t know.'
		);
		expect(styleLine(text, voice({ register: 'terse' }))).toBe('I’m sure I don’t know.');
	});

	it('a verbose voice adds a sentence of its own, only to a line that ends one', () => {
		expect(styleLine('Hello.', voice({ verbosity: 3 }))).toMatch(/^Hello\. .+/);
		expect(styleLine('Hello', voice({ verbosity: 3 }))).toBe('Hello');
		expect(styleLine('Hello.', voice({ verbosity: 1 }))).toBe('Hello.');
	});

	it('is drawn from the cohort: the old formally, the young casually, support needs given more patience', () => {
		const random = () => 0.9;
		const base = customers[0]!.cohort;
		expect(voiceFor({ ...base, ageBand: '75+' }, 'medium', random).register).toBe('formal');
		expect(voiceFor({ ...base, ageBand: '18-24' }, 'high', random).register).toBe('casual');
		expect(voiceFor({ ...base, supportNeeds: true }, 'medium', random).patience).toBeGreaterThan(1);
	});
});
