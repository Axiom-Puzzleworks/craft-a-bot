import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';

/**
 * `calculator` (02-AGENT-MODEL.md §2.3) — the tool behind the "Sums for Teddy"
 * card, whose whole lesson is that a model guessing at 17 × 23 gets it wrong
 * while a tool never does.
 *
 * Evaluated by a tiny shunting-yard parser rather than `eval` or `Function`:
 * this pack is sandbox-safe by construction (01-ARCHITECTURE.md §7), and a
 * "calculator" that can execute arbitrary JavaScript would be a genuine hole in
 * that claim even inside a toy.
 */

const argsSchema = z.object({
	expression: z.string().min(1).describe(toolStrings.calculator.expression)
});

type Token =
	| { kind: 'number'; value: number }
	| { kind: 'operator'; value: string }
	| { kind: 'paren'; value: '(' | ')' };

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

export function tokenise(expression: string): Token[] | undefined {
	const tokens: Token[] = [];
	let index = 0;

	/**
	 * True where a `+` or `-` must be a sign rather than a sum: at the very
	 * start, straight after another operator, or straight after an opening
	 * bracket. Anywhere a value has just ended, the same character is an
	 * ordinary infix operator.
	 */
	const expectingValue = (): boolean => {
		const previous = tokens[tokens.length - 1];
		if (previous === undefined) return true;
		if (previous.kind === 'operator') return true;
		return previous.kind === 'paren' && previous.value === '(';
	};

	while (index < expression.length) {
		const character = expression[index];
		if (character === undefined) break;

		if (/\s/.test(character)) {
			index += 1;
			continue;
		}

		/*
		 * Signs (WP12).
		 *
		 * The parser had no notion of a unary minus, so "-5" tokenised to an
		 * operator with nothing on its left and the calculator answered that it
		 * could not work it out — a strange thing for a calculator to say, and a
		 * poor lesson about tools being the reliable half of the bot. Found by
		 * the property suite next door, exactly as `12-…` T4 predicted.
		 *
		 * A sign in front of a number folds into the literal. A sign in front of
		 * a bracket becomes `-1 *`, which keeps precedence right without needing
		 * a unary operator in the shunting yard.
		 */
		if ((character === '-' || character === '+') && expectingValue()) {
			let after = index + 1;
			while (after < expression.length && /\s/.test(expression[after] ?? '')) after += 1;
			const next = expression[after];

			if (next !== undefined && /[0-9.]/.test(next)) {
				let literal = '';
				index = after;
				while (index < expression.length) {
					const digit = expression[index];
					if (digit === undefined || !/[0-9.]/.test(digit)) break;
					literal += digit;
					index += 1;
				}
				const magnitude = Number(literal);
				if (!Number.isFinite(magnitude)) return undefined;
				tokens.push({ kind: 'number', value: character === '-' ? -magnitude : magnitude });
				continue;
			}

			if (next === '(') {
				if (character === '-') {
					tokens.push({ kind: 'number', value: -1 });
					tokens.push({ kind: 'operator', value: '*' });
				}
				index = after;
				continue;
			}
			return undefined;
		}

		if (/[0-9.]/.test(character)) {
			let literal = '';
			while (index < expression.length) {
				const next = expression[index];
				if (next === undefined || !/[0-9.]/.test(next)) break;
				literal += next;
				index += 1;
			}
			const value = Number(literal);
			if (!Number.isFinite(value)) return undefined;
			tokens.push({ kind: 'number', value });
			continue;
		}
		if (character === '(' || character === ')') {
			tokens.push({ kind: 'paren', value: character });
			index += 1;
			continue;
		}
		if (character in PRECEDENCE || character === 'x' || character === '×' || character === '÷') {
			const normalised =
				character === 'x' || character === '×' ? '*' : character === '÷' ? '/' : character;
			tokens.push({ kind: 'operator', value: normalised });
			index += 1;
			continue;
		}
		return undefined;
	}
	return tokens;
}

export function evaluate(expression: string): number | undefined {
	const tokens = tokenise(expression);
	if (!tokens || tokens.length === 0) return undefined;

	const values: number[] = [];
	const operators: string[] = [];

	const apply = (): boolean => {
		const operator = operators.pop();
		const right = values.pop();
		const left = values.pop();
		if (operator === undefined || right === undefined || left === undefined) return false;
		switch (operator) {
			case '+':
				values.push(left + right);
				return true;
			case '-':
				values.push(left - right);
				return true;
			case '*':
				values.push(left * right);
				return true;
			case '/':
				if (right === 0) return false;
				values.push(left / right);
				return true;
			case '%':
				if (right === 0) return false;
				values.push(left % right);
				return true;
			case '^':
				values.push(left ** right);
				return true;
			default:
				return false;
		}
	};

	for (const token of tokens) {
		if (token.kind === 'number') {
			values.push(token.value);
		} else if (token.kind === 'paren' && token.value === '(') {
			operators.push('(');
		} else if (token.kind === 'paren') {
			while (operators.length > 0 && operators[operators.length - 1] !== '(') {
				if (!apply()) return undefined;
			}
			if (operators.pop() !== '(') return undefined;
		} else {
			const precedence = PRECEDENCE[token.value] ?? 0;
			while (operators.length > 0) {
				const top = operators[operators.length - 1];
				if (top === undefined || top === '(') break;
				if ((PRECEDENCE[top] ?? 0) < precedence) break;
				if (!apply()) return undefined;
			}
			operators.push(token.value);
		}
	}

	while (operators.length > 0) {
		if (operators[operators.length - 1] === '(') return undefined;
		if (!apply()) return undefined;
	}

	const result = values.pop();
	if (result === undefined || values.length > 0 || !Number.isFinite(result)) return undefined;
	return result;
}

export const calculator: ToolDefinition = {
	id: 'starter/calculator',
	name: toolStrings.calculator.name,
	description: toolStrings.calculator.description,
	parameters: z.toJSONSchema(argsSchema),
	execute(rawArgs) {
		const parsed = argsSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.calculator.badArgs };
		}
		const result = evaluate(parsed.data.expression);
		if (result === undefined) {
			return { ok: false, output: toolStrings.calculator.cannotWorkOut(parsed.data.expression) };
		}
		return {
			ok: true,
			output: toolStrings.calculator.result(parsed.data.expression, result),
			data: { expression: parsed.data.expression, result }
		};
	}
};
