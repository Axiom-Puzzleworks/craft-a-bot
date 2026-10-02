import type { ControlRef } from '@craftabot/core';
import type { ControlInventoryRow, InventoryKind } from '../reports/control-inventory.js';

/** A control the inventory knows that no catalogue entry and no control-map row names — declared, with the reason (WP133). */
export interface UncataloguedControl {
	ref: ControlRef;
	reason: string;
}

/** One problem `checkControlInventory` found. */
export interface ControlInventoryIssue {
	/** `inventory.orphan` · `inventory.uncatalogued-stale` · `inventory.uncatalogued-reason` */
	check: string;
	ref: ControlRef;
	message: string;
}

/** The kinds the orphan rule holds to account: what constrains a bot, as opposed to the settings, lists and models around it. */
export const ORPHAN_RULE_KINDS: readonly InventoryKind[] = [
	'component',
	'guardrail',
	'policy-card',
	'stack',
	'reader',
	'evaluator',
	'mechanism'
];

/**
 * The kinds whose inherited entry is the generic one every control of the
 * kind has, so it names none of them: an evaluator inherits `eval-harness`
 * through the evaluator contract for its coverage (2026-10-02), but the
 * orphan rule still wants it catalogued or cited in its own right.
 */
const INHERITANCE_DOES_NOT_NAME: readonly InventoryKind[] = ['evaluator'];

function isNamed(row: ControlInventoryRow): boolean {
	const entries = INHERITANCE_DOES_NOT_NAME.includes(row.kind)
		? row.entries.filter((entry) => !entry.via)
		: row.entries;
	return entries.length > 0 || row.rows.length > 0;
}

/**
 * **`checkControlInventory`** (WP133, `110-CONTROL-SUITE-PLAN.md` §4.3, G118;
 * decision 3): no control is an orphan. Every component, guardrail, card,
 * stack, reader, evaluator and mechanism is named by a catalogue entry —
 * directly, or through the component it runs on — or cited by a
 * control-map row, or declared in `uncatalogued` with a reason. A declared
 * control that has since been named is refused too, so the list only
 * shrinks. A failing check in CI from the first edition.
 */
export function checkControlInventory(
	rows: readonly ControlInventoryRow[],
	uncatalogued: readonly UncataloguedControl[]
): ControlInventoryIssue[] {
	const issues: ControlInventoryIssue[] = [];
	const declared = new Map(uncatalogued.map((each) => [each.ref, each]));
	const byRef = new Map(rows.map((row) => [row.ref, row]));
	for (const row of rows) {
		if (!ORPHAN_RULE_KINDS.includes(row.kind)) continue;
		const named = isNamed(row);
		if (!named && !declared.has(row.ref))
			issues.push({
				check: 'inventory.orphan',
				ref: row.ref,
				message: `${row.ref} is in no catalogue entry and no control-map row — catalogue it, cite it, or declare it with a reason`
			});
	}
	for (const each of uncatalogued) {
		const row = byRef.get(each.ref);
		if (each.reason.trim().length < 20)
			issues.push({
				check: 'inventory.uncatalogued-reason',
				ref: each.ref,
				message: `${each.ref} is declared uncatalogued without a reason a reader can weigh`
			});
		if (!row)
			issues.push({
				check: 'inventory.uncatalogued-stale',
				ref: each.ref,
				message: `${each.ref} is declared uncatalogued but nothing registers it — take it off the list`
			});
		else if (isNamed(row))
			issues.push({
				check: 'inventory.uncatalogued-stale',
				ref: each.ref,
				message: `${each.ref} is declared uncatalogued but is now named — take it off the list`
			});
	}
	return issues;
}
