import { describe, expect, it } from 'vitest';
import type { AgentRecord } from '@craftabot/core';
import { agentOptionLabel, mostRecentAgent } from './agent-labels.js';

/** Two bots with one name, told apart in every picker (UX-21); the screen's default bot (UX-20). */
const agent = (id: string, name: string, updatedAt: string, lastRunId?: string): AgentRecord =>
	({
		id,
		spec: { name },
		lastValidation: [],
		...(lastRunId ? { lastRunId } : {}),
		createdAt: updatedAt,
		updatedAt,
		schemaVersion: 2
	}) as unknown as AgentRecord;

const A = agent(
	'aaaaaa11-0000-4000-8000-000000000001',
	'My Very First Agent',
	'2026-09-01T09:00:00Z'
);
const B = agent(
	'bbbbbb22-0000-4000-8000-000000000002',
	'My Very First Agent',
	'2026-09-03T09:00:00Z',
	'run-b'
);
const C = agent('cccccc33-0000-4000-8000-000000000003', 'Snack Bot', '2026-09-05T09:00:00Z');

describe('agentOptionLabel', () => {
	it('is the bare name while the name is unique on the shelf', () => {
		expect(agentOptionLabel(C, [A, B, C])).toBe('Snack Bot');
	});

	it('adds the first six characters of the id when another bot shares the name', () => {
		expect(agentOptionLabel(A, [A, B, C])).toBe('My Very First Agent · aaaaaa');
		expect(agentOptionLabel(B, [A, B, C])).toBe('My Very First Agent · bbbbbb');
	});
});

describe('mostRecentAgent', () => {
	it('is nothing for an empty shelf', () => {
		expect(mostRecentAgent([])).toBeUndefined();
	});

	it('prefers the most recently updated bot that has run at all', () => {
		expect(mostRecentAgent([A, B, C])?.id).toBe(B.id);
	});

	it('falls back to the most recently updated bot when none has run', () => {
		expect(mostRecentAgent([A, C])?.id).toBe(C.id);
	});
});
