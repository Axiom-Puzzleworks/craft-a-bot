import type { ControlMap } from '@craftabot/core';

/**
 * **The control map** — rows of relevance a compliance reader edits, never
 * a claim of compliance (`53-ASSURANCE-PACK.md` §4.1). One row scaffolded,
 * citing the first journey's card and evaluator; every row `unreviewed`
 * until a reader has read it.
 */
export const vetPracticeControlMap: ControlMap = {
	id: 'vet-practice/control-map',
	title: 'Vet Practice',
	description: "The Vet Practice's claims of relevance. Relevance, not compliance.",
	rows: [
		{
			framework: 'Veterinary Practice — the rule the scaffold states',
			ref: 'reviewed-before-decision',
			title: 'A case is reviewed before it is decided',
			obligation: 'No decision on a case the desk has not reviewed.',
			evidence: [
				{ kind: 'policy-card', id: 'vaccination/policy/review-before-deciding' },
				{ kind: 'evaluator', id: 'vaccination/reviewed-before-decision' }
			],
			status: 'unreviewed',
			tags: ['veterinary-practice:record-keeping', 'veterinary-practice:fair-treatment']
		}
	]
};
