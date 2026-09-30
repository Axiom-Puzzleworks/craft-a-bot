import type { ReadingBlueprintNote } from '@craftabot/governance/reports';
// The blueprint notes are documents (WP108): read as text, parsed by the fold (WP129).
import healthcare from '../../../../../docs/blueprints/HEALTHCARE.md?raw';
import logistics from '../../../../../docs/blueprints/LOGISTICS.md?raw';
import manufacturing from '../../../../../docs/blueprints/MANUFACTURING.md?raw';

/**
 * **The three blueprint notes, as the reading desk reads them** (WP129,
 * `108-READINGS.md` §3): each note's id, its heading and its markdown. Kept
 * apart from `readings.ts` so only the readings page, which imports this
 * lazily, carries the text.
 */
const heading = (markdown: string, fallback: string) => /^# (.+)$/m.exec(markdown)?.[1] ?? fallback;

export const BLUEPRINT_NOTES: readonly ReadingBlueprintNote[] = [
	{ id: 'healthcare', title: heading(healthcare, 'Healthcare'), markdown: healthcare },
	{ id: 'logistics', title: heading(logistics, 'Logistics'), markdown: logistics },
	{ id: 'manufacturing', title: heading(manufacturing, 'Manufacturing'), markdown: manufacturing }
];
