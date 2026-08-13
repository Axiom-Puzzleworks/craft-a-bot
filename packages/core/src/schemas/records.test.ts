import { describe, expect, it } from 'vitest';
import {
	migrateAgentRecord,
	parseAgentRecord,
	safeParseAgentRecord,
	safeParseStoredEvent
} from './records.js';

const specV1 = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Snackbot 3000',
	bricks: {},
	goalCardId: 'starter/say-hello',
	createdAt: '2026-08-12T09:00:00Z',
	updatedAt: '2026-08-12T09:00:00Z',
	schemaVersion: 1
};

const spec = {
	...specV1,
	schemaVersion: 2,
	bricks: [],
	identity: { displayName: 'Snackbot 3000', boxArtSeed: 'seed-1' }
};

const agentV1 = {
	id: specV1.id,
	spec: specV1,
	boxArtSeed: 'seed-1',
	lastValidation: [],
	createdAt: '2026-08-12T09:00:00Z',
	updatedAt: '2026-08-12T09:00:00Z',
	schemaVersion: 1
};

const agent = {
	id: spec.id,
	spec,
	lastValidation: [],
	createdAt: '2026-08-12T09:00:00Z',
	updatedAt: '2026-08-12T09:00:00Z',
	schemaVersion: 2
};

describe('agentRecordSchema', () => {
	it('parses a valid shelf record', () => {
		expect(parseAgentRecord(agent).spec.identity.boxArtSeed).toBe('seed-1');
	});

	it('carries the build problems the ribbon last reported', () => {
		const withProblems = {
			...agent,
			lastValidation: [
				{ code: 'missing-brain', severity: 'blocking', message: 'Your bot needs a brain!' }
			]
		};
		expect(parseAgentRecord(withProblems).lastValidation).toHaveLength(1);
	});

	it('rejects an unknown build-problem code', () => {
		const bogus = {
			...agent,
			lastValidation: [{ code: 'not-a-real-code', severity: 'blocking', message: 'x' }]
		};
		expect(safeParseAgentRecord(bogus).success).toBe(false);
	});

	it('rejects a non-uuid id', () => {
		expect(safeParseAgentRecord({ ...agent, id: 'nope' }).success).toBe(false);
	});

	it('accepts an optional lastRunId', () => {
		const linked = { ...agent, lastRunId: '22222222-2222-4222-8222-222222222222' };
		expect(parseAgentRecord(linked).lastRunId).toBe('22222222-2222-4222-8222-222222222222');
	});

	it('throws from the strict parser on bad input', () => {
		expect(() => parseAgentRecord({ ...agent, schemaVersion: 3 })).toThrow();
	});

	it('will not parse the v1 row it used to write — that is what the migration is for', () => {
		expect(safeParseAgentRecord(agentV1).success).toBe(false);
	});
});

describe('migrateAgentRecord', () => {
	it('brings a v1 shelf row forward, seed and all', () => {
		const result = migrateAgentRecord(agentV1);
		expect('kind' in result).toBe(false);
		if ('kind' in result) return;

		expect(result.schemaVersion).toBe(2);
		expect(result.spec.schemaVersion).toBe(2);
		// The seed the row was carrying, moved to where identity now lives — so a
		// bot's box art survives the upgrade instead of being regenerated.
		expect(result.spec.identity.boxArtSeed).toBe('seed-1');
	});

	it('passes a v2 row straight through', () => {
		const result = migrateAgentRecord(agent);
		expect('kind' in result).toBe(false);
		if ('kind' in result) return;
		expect(result).toEqual(agent);
	});

	it('reports a row it cannot read rather than throwing', () => {
		expect(migrateAgentRecord({ ...agentV1, boxArtSeed: 7 })).toMatchObject({
			kind: 'migration-error'
		});
		expect(migrateAgentRecord({ ...agent, schemaVersion: 99 })).toMatchObject({
			kind: 'migration-error',
			detectedVersion: 99
		});
		expect(migrateAgentRecord(null)).toMatchObject({ kind: 'migration-error' });
		expect(migrateAgentRecord({})).toMatchObject({ kind: 'migration-error' });
	});

	it('reports a v1 row whose spec is unreadable', () => {
		const broken = { ...agentV1, spec: { ...specV1, goalCardId: '' } };
		expect(migrateAgentRecord(broken)).toMatchObject({ kind: 'migration-error' });
	});
});

describe('storedEventSchema', () => {
	it('accepts a well-formed row', () => {
		const row = {
			runId: '22222222-2222-4222-8222-222222222222',
			seq: 0,
			event: {
				id: '33333333-3333-4333-8333-333333333333',
				runId: '22222222-2222-4222-8222-222222222222',
				tick: 1,
				timestamp: '2026-08-12T10:00:00Z',
				type: 'tick.started',
				payload: {}
			}
		};
		expect(safeParseStoredEvent(row).success).toBe(true);
	});

	it('rejects a negative seq — ordering depends on it', () => {
		expect(
			safeParseStoredEvent({
				runId: '22222222-2222-4222-8222-222222222222',
				seq: -1,
				event: {
					id: '33333333-3333-4333-8333-333333333333',
					runId: '22222222-2222-4222-8222-222222222222',
					tick: 1,
					timestamp: '2026-08-12T10:00:00Z',
					type: 'tick.started',
					payload: {}
				}
			}).success
		).toBe(false);
	});

	it('rejects a row whose event is not in the catalogue', () => {
		expect(
			safeParseStoredEvent({
				runId: '22222222-2222-4222-8222-222222222222',
				seq: 0,
				event: { type: 'invented.event' }
			}).success
		).toBe(false);
	});
});
