import { describe, expect, it } from 'vitest';
import type { TraceSink } from '@craftabot/core';
import { checkSink } from './checks/sink.js';
import type { SinkConformanceFixture } from './types.js';

/**
 * A sink is not pack content — no manifest carries one — so it gets its own
 * `describe` rather than a row in `describeConformance` (WP47, `35-…` §4.4).
 */
export function describeSinkConformance(sink: TraceSink, fixture: SinkConformanceFixture): void {
	describe(`${sink.id} — sink conformance`, () => {
		it('attaches, buffers, flushes and exports without letting a failure past itself', async () => {
			const issues = await checkSink(sink, fixture);
			expect(issues).toEqual([]);
		});
	});
}
