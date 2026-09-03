import { describe, expect, it } from 'vitest';
import { engineEventSchema, externalCallRecordSchema } from '@craftabot/core';
import golden from '../fixtures/trace.geap-armour-offline.v1.json' with { type: 'json' };
import type { ArmorErrorKind } from './errors.js';
import type { ExternalOutcomeKind } from '@craftabot/core';

/**
 * WP39 stage A (`29-GUARD-SHELL.md` §10): a trace written before the record
 * was widened still parses, event by event and row by row — this pack's own
 * golden trace (a bare event array, as `golden-trace.test.ts` writes it)
 * being the one that exists. And the pack's error kinds are
 * exactly core's transport kinds, so the shell and the client name one set.
 */

describe('the golden trace against the widened record schema', () => {
	const events = golden as Array<{ type: string; payload: unknown }>;

	it('parses every event', () => {
		for (const event of events) expect(engineEventSchema.safeParse(event).success).toBe(true);
	});

	it('parses every guardrail.external row, and there are some', () => {
		const rows = events.filter((event) => event.type === 'guardrail.external');
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			const record = { ...(row.payload as Record<string, unknown>) };
			delete record['guardrailId'];
			delete record['hook'];
			expect(externalCallRecordSchema.safeParse(record).success).toBe(true);
		}
	});
});

describe('ArmorErrorKind is ExternalOutcomeKind', () => {
	it('assigns both ways', () => {
		const toCore: ExternalOutcomeKind = 'quota' as ArmorErrorKind;
		const toPack: ArmorErrorKind = 'timeout' as ExternalOutcomeKind;
		expect([toCore, toPack]).toEqual(['quota', 'timeout']);
	});
});
