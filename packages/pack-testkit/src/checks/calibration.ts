import { calibrationTableSchema, type CalibrationTable } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * **`checkCalibration`** (WP74, `66-CALIBRATION.md` §4.1; `65-…` §5 rule 1:
 * *a row without a source does not build*). Every row parses; ids are
 * unique within the table; a `publication` source names publisher, title,
 * edition, table and a retrieval date (the schema); an `assumption` says
 * why in `note`; weights and rates are finite and non-negative with at
 * least two categories and at least one positive; a `rates` row's values
 * are probabilities; `tolerance` sits in (0, 1). Where the caller names
 * the enum a row's categories must come from (`enums`), the categories
 * match it exactly. A row awaiting review passes — an unreviewed citation
 * is honest, a missing one is not.
 */
export interface CalibrationCheckOptions {
	/** Row id → the exact category set that row must carry (a model's enum). */
	enums?: Readonly<Record<string, readonly string[]>>;
}

export function checkCalibration(
	table: CalibrationTable,
	options: CalibrationCheckOptions = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const parsed = calibrationTableSchema.safeParse(table);
	if (!parsed.success) {
		issues.push({
			check: 'calibration.schema',
			message: `table "${table.id}" does not validate: ${parsed.error.issues[0]?.message ?? parsed.error.message}`,
			detail: parsed.error.issues
		});
		return issues;
	}
	if (table.rows.length === 0)
		issues.push({ check: 'calibration.rows', message: `table "${table.id}" has no rows` });

	const ids = new Set<string>();
	for (const row of table.rows) {
		const where = `table "${table.id}" row "${row.id}"`;
		if (ids.has(row.id))
			issues.push({ check: 'calibration.id-unique', message: `${where}: duplicate id` });
		ids.add(row.id);

		if (row.source.kind === 'assumption' && !row.note?.trim()) {
			issues.push({
				check: 'calibration.assumption-says-why',
				message: `${where}: an assumption says in \`note\` why no publication serves`
			});
		}

		const entries = Object.entries(row.distribution);
		if (
			row.kind !== 'target' &&
			entries.length < 2 &&
			!(row.kind === 'rates' && entries.length === 1)
		) {
			issues.push({
				check: 'calibration.categories',
				message: `${where}: a draw needs at least two categories (a rates row at least one)`
			});
		}
		if (entries.length === 0)
			issues.push({ check: 'calibration.categories', message: `${where}: no categories` });
		if (entries.every(([, value]) => value === 0))
			issues.push({
				check: 'calibration.positive',
				message: `${where}: every weight is zero — nothing can be drawn`
			});
		if (row.kind === 'rates') {
			for (const [category, value] of entries) {
				if (value > 1)
					issues.push({
						check: 'calibration.rate-is-probability',
						message: `${where}: rate "${category}" is ${value}, above 1`
					});
			}
		}

		const wanted = options.enums?.[row.id];
		if (wanted) {
			const have = entries.map(([category]) => category).sort();
			const need = [...wanted].sort();
			if (have.join('|') !== need.join('|')) {
				issues.push({
					check: 'calibration.categories-match-enum',
					message: `${where}: categories [${have.join(', ')}] do not match the model's [${need.join(', ')}]`
				});
			}
		}
	}
	return issues;
}
