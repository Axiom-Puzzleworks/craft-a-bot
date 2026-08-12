import { describe, expect, it } from 'vitest';
import validTraceFile from '../fixtures/trace-file.v1.valid.json';
import invalidTraceFile from '../fixtures/trace-file.v1.invalid.json';
import { computeTraceDigest, parseTraceFile, safeParseTraceFile } from './trace-file.js';

describe('traceFileSchema', () => {
	it('parses the valid v1 fixture', () => {
		const trace = parseTraceFile(validTraceFile);
		expect(trace.run.outcome).toBe('SUCCESS');
		expect(trace.events).toHaveLength(2);
	});

	it('rejects the invalid v1 fixture', () => {
		const result = safeParseTraceFile(invalidTraceFile);
		expect(result.success).toBe(false);
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
