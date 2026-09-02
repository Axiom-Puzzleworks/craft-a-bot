import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EgressDeclaration, TraceSink } from '@craftabot/core';
import { z } from 'zod';
import { createBatcher } from './batch.js';

/**
 * **`telemetry/file`** (`35-…` §4.3, WP47): JSONL, one event per line,
 * appended as the run goes — the harness's default sink. It needs the
 * file system, so it lives on this `/node` entry and the main entry stays
 * importable by the browser (`35-…` §7 D-c).
 */

export const FILE_SINK_ID = 'telemetry/file';

export const fileSinkConfigSchema = z.object({
	path: z.string().min(1),
	batchSize: z.number().int().min(1).max(5000).default(50),
	flushAfterMs: z.number().int().min(50).max(60000).default(500)
});
export type FileSinkConfig = z.infer<typeof fileSinkConfigSchema>;

export const fileSink: TraceSink = {
	id: FILE_SINK_ID,
	name: 'JSONL file',
	description: 'Appends every event of a run to a file, one JSON object per line, as it happens.',
	egress: (): EgressDeclaration[] => [],
	configSchema: fileSinkConfigSchema,
	create: ({ config, onError, now }) => {
		const parsed = fileSinkConfigSchema.parse(config);
		async function append(lines: readonly unknown[]): Promise<number> {
			if (lines.length === 0) return 0;
			await mkdir(dirname(parsed.path), { recursive: true });
			await appendFile(
				parsed.path,
				lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
				'utf8'
			);
			return lines.length;
		}
		return createBatcher({
			sinkId: FILE_SINK_ID,
			batchSize: parsed.batchSize,
			flushAfterMs: parsed.flushAfterMs,
			send: (events) => append(events),
			sendExport: (input) =>
				append(
					input.group
						? [
								{ kind: 'group', record: input.group.record },
								...input.group.events,
								...input.group.members.flatMap((member) => [
									{ kind: 'run', record: member.run },
									...member.events
								])
							]
						: [{ kind: 'run', record: input.run }, ...input.events]
				),
			onError,
			now
		});
	}
};

export { createBatcher } from './batch.js';
