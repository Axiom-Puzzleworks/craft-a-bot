import { describe, expect, it } from 'vitest';
import { evaluate } from './calculator.js';

/**
 * **Calculator properties and fuzz** (`13-…` §4.3, closing the `12-…` T4 gap).
 *
 * The example-based tests next door check the answers we thought to ask for.
 * These check the rules that must hold for *every* expression, and they are
 * here because T4 predicted precisely what they would find: "calculator fuzz
 * would have caught the missing unary minus". It did.
 *
 * The generator is seeded. Determinism is a hard rule (`CLAUDE.md` §5) and it
 * is also just good manners in a test: a fuzz failure nobody can reproduce is
 * a rumour, not a bug report.
 */

/** Mulberry32 — small, fast, and reproducible from a seed. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = seeded(20260813);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const smallInt = () => Math.floor(random() * 40) - 20;

/** Floating point means "equal" has to mean "close enough". */
function near(actual: number | undefined, expected: number): boolean {
	return actual !== undefined && Math.abs(actual - expected) < 1e-9;
}

describe('properties that hold for every expression', () => {
	it('a bare number evaluates to itself', () => {
		for (let index = 0; index < 200; index++) {
			const value = Math.abs(smallInt());
			expect(near(evaluate(String(value)), value), String(value)).toBe(true);
		}
	});

	it('addition and multiplication commute', () => {
		for (let index = 0; index < 200; index++) {
			const [a, b] = [Math.abs(smallInt()), Math.abs(smallInt())];
			const operator = pick(['+', '*'] as const);
			const left = evaluate(`${a} ${operator} ${b}`);
			const right = evaluate(`${b} ${operator} ${a}`);
			expect(left, `${a} ${operator} ${b}`).toBeDefined();
			expect(near(left, right as number)).toBe(true);
		}
	});

	it('multiplication binds tighter than addition', () => {
		for (let index = 0; index < 200; index++) {
			const [a, b, c] = [Math.abs(smallInt()), Math.abs(smallInt()), Math.abs(smallInt())];
			expect(near(evaluate(`${a} + ${b} * ${c}`), a + b * c), `${a} + ${b} * ${c}`).toBe(true);
		}
	});

	it('brackets distribute', () => {
		for (let index = 0; index < 200; index++) {
			const [a, b, c] = [Math.abs(smallInt()), Math.abs(smallInt()), Math.abs(smallInt())];
			expect(near(evaluate(`(${a} + ${b}) * ${c}`), (a + b) * c)).toBe(true);
		}
	});

	it('whitespace never changes the answer', () => {
		for (let index = 0; index < 200; index++) {
			const [a, b] = [Math.abs(smallInt()), Math.abs(smallInt())];
			const operator = pick(['+', '-', '*'] as const);
			expect(evaluate(`${a}${operator}${b}`)).toBe(evaluate(`  ${a}  ${operator}  ${b}  `));
		}
	});

	it('never returns a non-finite number, whatever it is fed', () => {
		const alphabet = '0123456789+-*/%^(). xyz';
		for (let index = 0; index < 500; index++) {
			let junk = '';
			const length = 1 + Math.floor(random() * 12);
			for (let position = 0; position < length; position++) {
				junk += alphabet[Math.floor(random() * alphabet.length)];
			}
			const result = evaluate(junk);
			// The contract is "a number I can trust, or nothing at all".
			expect(result === undefined || Number.isFinite(result), junk).toBe(true);
		}
	});
});

describe('the awkward cases, each decided on purpose', () => {
	it('refuses division and modulo by zero rather than returning Infinity', () => {
		expect(evaluate('7 / 0')).toBeUndefined();
		expect(evaluate('7 % 0')).toBeUndefined();
	});

	it('refuses an incomplete expression', () => {
		for (const junk of ['1 +', '* 3', '(1 + 2', '1 + 2)', '', '   ', '()']) {
			expect(evaluate(junk), junk).toBeUndefined();
		}
	});

	it('refuses letters it does not know', () => {
		expect(evaluate('2 + two')).toBeUndefined();
		expect(evaluate('fish')).toBeUndefined();
	});

	it('accepts the multiplication signs a child actually types', () => {
		expect(evaluate('17 x 23')).toBe(391);
		expect(evaluate('17 × 23')).toBe(391);
		expect(evaluate('42 ÷ 6')).toBe(7);
	});

	it('handles negative numbers, including as the first thing in the sum', () => {
		// T4's headline: a bot asked to work out "-5 + 3" used to be told the
		// calculator could not work it out, which is a strange thing for a
		// calculator to say and a very odd lesson about tools being reliable.
		expect(evaluate('-5')).toBe(-5);
		expect(evaluate('-5 + 3')).toBe(-2);
		expect(evaluate('3 * -4')).toBe(-12);
		expect(evaluate('3 - -4')).toBe(7);
		expect(evaluate('-(2 + 3)')).toBe(-5);
		expect(evaluate('+7')).toBe(7);
	});

	it('treats a chain of powers left to right, which is not what mathematicians do', () => {
		/*
		 * Documented rather than fixed (`13-…` §4.3 allows either).
		 *
		 * Conventional notation makes `^` right-associative, so 2^3^2 is
		 * 2^(3^2) = 512. This parser applies equal precedence left to right, so
		 * it answers 64. Nothing in the kit teaches exponentiation, no goal card
		 * needs it, and a child typing 2^3^2 has bigger questions — whereas
		 * changing associativity is a real change to a shared parser. Revisit if
		 * a "harder sums" card ever ships.
		 */
		expect(evaluate('2 ^ 3 ^ 2')).toBe(64);
		expect(evaluate('2 ^ (3 ^ 2)')).toBe(512);
	});
});
