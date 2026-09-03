import {
	runOutcomeSchema,
	scenarioPackFileSchema,
	type Injection,
	type PackManifest,
	type ScenarioDefinition,
	type ScenarioPackFile
} from '@craftabot/core';
import { z } from 'zod';

/**
 * **The corpus importer** (`32-SCENARIOS.md` §4.5, WP44): a JSONL file of
 * injection strings — a third-party red-team set, a vendor's published
 * probes, a hand-written list — becomes scenarios over one base card, each
 * row's text delivered through one of the world's doors. The result is a
 * scenario pack file: content the registry reads back as a pack, never code.
 */

export const corpusRowSchema = z.object({
	id: z.string().min(1).optional(),
	text: z.string().min(1),
	tags: z.array(z.string()).default([]),
	/** The outcome a *safe* run over this row still ends with; `SUCCESS` unless the row says otherwise. */
	expectedOutcome: runOutcomeSchema.optional()
});
export type CorpusRow = z.infer<typeof corpusRowSchema>;

/** One JSON object per line; blank lines skipped; the line number is in any error. */
export function parseCorpusJsonl(text: string): CorpusRow[] {
	const rows: CorpusRow[] = [];
	const lines = text.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		if (line.trim() === '') continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			throw new Error(`line ${index + 1} is not JSON: ${(error as Error).message}`, {
				cause: error
			});
		}
		const parsed = corpusRowSchema.safeParse(value);
		if (!parsed.success) {
			throw new Error(`line ${index + 1} is not a corpus row: ${parsed.error.issues[0]?.message}`);
		}
		rows.push(parsed.data);
	}
	return rows;
}

/** How each row's text reaches the world — the door, minus the text. */
export type CorpusDelivery =
	| { kind: 'manual-entry'; key: string }
	| { kind: 'heard'; atTick?: number }
	| { kind: 'tool-result'; toolId: string }
	| { kind: 'radio'; fromName: string; channel: string };

export interface CorpusImportOptions {
	/** The card every row runs on. */
	baseCardId: string;
	/** Scenario ids are `<idPrefix>/<row id or ordinal>`. */
	idPrefix: string;
	/** Default: a manual entry keyed `sign`, which the warning-sign adversary plan looks up. */
	delivery?: CorpusDelivery;
	/** Tags on every imported scenario, beside each row's own. */
	tags?: string[];
	/** Expectations and plans inherited by every row; default `scripted-optimal` / `scripted-adversary` and no evaluators. */
	base?: Pick<Partial<ScenarioDefinition>, 'plans' | 'expect'>;
}

export const DEFAULT_CORPUS_DELIVERY: CorpusDelivery = { kind: 'manual-entry', key: 'sign' };

function injectionFor(delivery: CorpusDelivery, text: string): Injection {
	switch (delivery.kind) {
		case 'manual-entry':
			return { kind: 'manual-entry', key: delivery.key, text };
		case 'heard':
			return {
				kind: 'heard',
				text,
				...(delivery.atTick !== undefined ? { atTick: delivery.atTick } : {})
			};
		case 'tool-result':
			return { kind: 'tool-result', toolId: delivery.toolId, result: text };
		case 'radio':
			return { kind: 'radio', fromName: delivery.fromName, channel: delivery.channel, text };
	}
}

export function scenariosFromCorpus(
	rows: readonly CorpusRow[],
	options: CorpusImportOptions
): ScenarioDefinition[] {
	const delivery = options.delivery ?? DEFAULT_CORPUS_DELIVERY;
	const width = Math.max(4, String(rows.length).length);
	return rows.map((row, index) => {
		const local = row.id ?? String(index + 1).padStart(width, '0');
		return {
			id: `${options.idPrefix}/${local}`,
			title: `${local}: ${row.text.length > 60 ? `${row.text.slice(0, 57)}…` : row.text}`,
			goalCardId: options.baseCardId,
			tags: [...new Set([...(options.tags ?? []), ...row.tags])],
			injections: [injectionFor(delivery, row.text)],
			expect: {
				outcome: row.expectedOutcome ?? options.base?.expect?.outcome ?? 'SUCCESS',
				evaluators: options.base?.expect?.evaluators ?? []
			},
			plans: options.base?.plans ?? { safe: 'scripted-optimal', unsafe: 'scripted-adversary' },
			schemaVersion: 1
		};
	});
}

export function scenarioPackFrom(
	id: string,
	name: string,
	scenarios: readonly ScenarioDefinition[]
): ScenarioPackFile {
	return { format: 'craftabot-scenarios', formatVersion: 1, id, name, scenarios: [...scenarios] };
}

/** A scenario pack file read back as a pack — content only, so it registers like any other. */
export function packFromScenarioFile(value: unknown): PackManifest {
	const file = scenarioPackFileSchema.parse(value);
	return {
		id: file.id,
		name: file.name,
		version: '0.0.0-scenarios',
		requiresCore: '>=0.0.1',
		scenarios: file.scenarios
	};
}
