import type { UncataloguedControl } from './check.js';

/**
 * **The declared uncatalogued controls** (WP133, `110-CONTROL-SUITE-PLAN.md`
 * §5 decision 3): the controls the inventory knows that no catalogue entry
 * and no control-map row names yet, each with the reason. The orphan rule
 * (`checkControlInventory`) refuses an orphan that is not here and a control
 * here that has since been named, so the list only shrinks. Seeded with
 * what the check found on its first run.
 */
export const UNCATALOGUED_CONTROLS: readonly UncataloguedControl[] = [
	{
		ref: 'evaluator:fs-advice/execution-approved',
		reason:
			'Judges that an execution was approved by a person; the advice desk’s SS1/23 mitigants row cites the four-eyes card instead of it (WP135 cites it).'
	}
];
