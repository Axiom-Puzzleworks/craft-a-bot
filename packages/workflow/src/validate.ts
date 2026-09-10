import type { JsonSchema } from '@craftabot/core';

/**
 * The boundary check (WP79, `69-WORKFLOWS.md` §2, §9): a stage's input and
 * output validated against the JSON schemas its spec declares — a small
 * structural checker over `type`, `required`, `properties`, `enum`,
 * `const`, `items` and `additionalProperties: false`, not a full validator.
 * Enough for the stage records, and dependency-free. Returns the problems
 * found, each with the path it was found at; an empty list is a pass.
 */
export function validateAgainst(schema: JsonSchema, value: unknown, path = '$'): string[] {
	const problems: string[] = [];
	const type = schema['type'];
	if (type !== undefined && !matchesType(type, value)) {
		problems.push(`${path}: expected ${describeType(type)}, got ${typeOf(value)}`);
		return problems;
	}
	if ('const' in schema && !sameJson(schema['const'], value)) {
		problems.push(`${path}: expected the constant ${JSON.stringify(schema['const'])}`);
	}
	const allowed = schema['enum'];
	if (Array.isArray(allowed) && !allowed.some((candidate) => sameJson(candidate, value))) {
		problems.push(`${path}: expected one of ${allowed.map((v) => JSON.stringify(v)).join(', ')}`);
	}
	if (isRecord(value)) {
		const required = schema['required'];
		if (Array.isArray(required)) {
			for (const key of required) {
				if (typeof key === 'string' && !(key in value)) problems.push(`${path}.${key}: required`);
			}
		}
		const properties = schema['properties'];
		if (isRecord(properties)) {
			for (const [key, property] of Object.entries(properties)) {
				if (key in value && isRecord(property)) {
					problems.push(...validateAgainst(property, value[key], `${path}.${key}`));
				}
			}
			if (schema['additionalProperties'] === false) {
				for (const key of Object.keys(value)) {
					if (!(key in properties)) problems.push(`${path}.${key}: not allowed`);
				}
			}
		}
	}
	if (Array.isArray(value)) {
		const items = schema['items'];
		if (isRecord(items)) {
			value.forEach((item, index) => {
				problems.push(...validateAgainst(items, item, `${path}[${index}]`));
			});
		}
	}
	return problems;
}

function matchesType(type: unknown, value: unknown): boolean {
	if (Array.isArray(type)) return type.some((candidate) => matchesType(candidate, value));
	switch (type) {
		case 'object':
			return isRecord(value);
		case 'array':
			return Array.isArray(value);
		case 'string':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'integer':
			return typeof value === 'number' && Number.isInteger(value);
		case 'boolean':
			return typeof value === 'boolean';
		case 'null':
			return value === null;
		default:
			return true;
	}
}

function describeType(type: unknown): string {
	return Array.isArray(type) ? type.join(' | ') : String(type);
}

function typeOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
