import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPackRegistry, parseControlRef } from '@craftabot/core';
import { CONTROL_MECHANISMS, getControlMechanism } from './mechanisms.js';
import { resolveControlRef } from './refs.js';

/**
 * The declared mechanisms and control references (WP132,
 * `110-CONTROL-SUITE-PLAN.md` §4.1): every mechanism says where it lives,
 * and the file is there; every reference either resolves or says why not.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('the control mechanisms', () => {
	it('are unique, each with a summary, a source file that exists, and a way to see it act', () => {
		const ids = CONTROL_MECHANISMS.map((mechanism) => mechanism.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const mechanism of CONTROL_MECHANISMS) {
			expect(mechanism.id, mechanism.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
			expect(mechanism.summary.length, mechanism.id).toBeGreaterThan(20);
			expect(mechanism.observedAs.length, mechanism.id).toBeGreaterThan(0);
			expect(mechanism.where.length, mechanism.id).toBeGreaterThan(0);
			for (const file of mechanism.where)
				expect(existsSync(join(REPO, file)), `${mechanism.id}: ${file}`).toBe(true);
			expect(mechanism.since, mechanism.id).toMatch(/^WP\d+$/);
		}
		expect(getControlMechanism('workflow/reader-gate')?.configuredBy).toBe('ReaderExecutor.gate');
	});
});

describe('resolveControlRef', () => {
	const registry = createPackRegistry();

	it('parses {kind}:{id} and refuses anything else', () => {
		expect(parseControlRef('mechanism:core/trace')).toEqual({
			kind: 'mechanism',
			id: 'core/trace'
		});
		expect(parseControlRef('gate:parity')).toEqual({ kind: 'gate', id: 'parity' });
		expect(parseControlRef('the trace (07-…)')).toBeUndefined();
		expect(parseControlRef('widget:thing')).toBeUndefined();
		expect(resolveControlRef('the trace', registry)).toMatch(/not a control reference/);
	});

	it('resolves closed lists and mechanisms without a registry, and says why a registered kind is missing', () => {
		for (const ref of [
			'mechanism:hosted/fail-closed',
			'guardrail:safety/step-budget',
			'gate:no-regression',
			'trace-guarantee:reader.answered',
			'artefact:trace-bundle'
		])
			expect(resolveControlRef(ref, registry), ref).toBeUndefined();
		expect(resolveControlRef('evaluator:fs-lending/appeal-handled', registry)).toBe(
			'evaluator "fs-lending/appeal-handled" is not a registered evaluator'
		);
		expect(
			resolveControlRef('guardrail:monitor/x', registry, { knownGuardrails: ['monitor/x'] })
		).toBeUndefined();
	});
});
