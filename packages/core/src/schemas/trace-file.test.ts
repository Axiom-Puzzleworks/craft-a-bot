import { describe, expect, it } from 'vitest';
import validTraceFileV1 from '../fixtures/trace-file.v1.valid.json';
import validTraceFile from '../fixtures/trace-file.v2.valid.json';
import invalidTraceFile from '../fixtures/trace-file.v2.invalid.json';
import {
	computeTraceDigest,
	migrateTraceFile,
	parseTraceFile,
	safeParseTraceFile
} from './trace-file.js';

describe('traceFileSchema', () => {
	it('parses the valid v2 fixture', () => {
		const trace = parseTraceFile(validTraceFile);
		expect(trace.run.outcome).toBe('SUCCESS');
		expect(trace.events).toHaveLength(2);
	});

	it('rejects the invalid v2 fixture', () => {
		const result = safeParseTraceFile(invalidTraceFile);
		expect(result.success).toBe(false);
	});

	/**
	 * A v1 trace is not a broken trace, it is an *old* one — and a governance
	 * artefact that stops opening after a format change is not much of a record
	 * (`12-…` D7). The current schema refuses it; the migration accepts it.
	 */
	it('refuses a v1 trace directly, and takes it through the migration', () => {
		expect(safeParseTraceFile(validTraceFileV1).success).toBe(false);

		const migrated = migrateTraceFile(validTraceFileV1);
		expect('kind' in migrated).toBe(false);
		if ('kind' in migrated) return;
		expect(migrated.formatVersion).toBe(2);
		expect(migrated.run.outcome).toBe('SUCCESS');
		expect(migrated.events).toHaveLength(2);
	});
});

describe('computeTraceDigest', () => {
	it('is deterministic for the same ordered event array', async () => {
		const trace = parseTraceFile(validTraceFile);
		const first = await computeTraceDigest(trace.events);
		const second = await computeTraceDigest(trace.events);
		expect(first).toBe(second);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
	});

	it('changes if event order changes', async () => {
		const trace = parseTraceFile(validTraceFile);
		const forward = await computeTraceDigest(trace.events);
		const reversed = await computeTraceDigest([...trace.events].reverse());
		expect(forward).not.toBe(reversed);
	});
});
