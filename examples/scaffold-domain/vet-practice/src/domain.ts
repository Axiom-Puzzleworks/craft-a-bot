import type { DomainSpec } from '@craftabot/core';
import { CALIBRATION } from './calibration.js';
import { OBLIGATION_TAGS } from './obligations.js';
import { PERSONA_IDS } from './personas.js';

/**
 * **The domain spec** (`83-…` §6.6.1): what this domain pack *is*, as data.
 * The journeys page draws the coverage matrix from it; `checkDomainPack`
 * holds the packs to it. Scaffolded with the packs named on the command
 * line, one decision right per journey, and one journey that is *out* with
 * the reason a scaffold can give.
 */
export const DOMAIN_ID = 'vet-practice/veterinary-practice';

export const veterinaryPracticeDomain: DomainSpec = {
	schemaVersion: 1,
	id: DOMAIN_ID,
	name: 'Veterinary Practice',
	jurisdiction: 'UK',
	sector: 'Veterinary services',
	packs: { world: 'vet-practice', journeys: ['vaccination', 'referral'] },
	obligations: { ...OBLIGATION_TAGS },
	decisionRights: [
		{
			kind: 'vaccination-decision',
			ceiling: 3,
			why: "A decision on a vaccination case is a person's below four eyes; the assistant prepares it.",
			source: {
				title: 'Veterinary Practice — stated by the scaffold; cite the rule that sets this',
				retrieved: '2026-09-12'
			}
		},
		{
			kind: 'vaccination-agreement',
			ceiling: 4,
			why: "Closing a vaccination case is the assistant's under four eyes.",
			source: {
				title: 'Veterinary Practice — stated by the scaffold; cite the rule that sets this',
				retrieved: '2026-09-12'
			}
		},
		{
			kind: 'referral-decision',
			ceiling: 3,
			why: "A decision on a referral case is a person's below four eyes; the assistant prepares it.",
			source: {
				title: 'Veterinary Practice — stated by the scaffold; cite the rule that sets this',
				retrieved: '2026-09-12'
			}
		},
		{
			kind: 'referral-agreement',
			ceiling: 4,
			why: "Closing a referral case is the assistant's under four eyes.",
			source: {
				title: 'Veterinary Practice — stated by the scaffold; cite the rule that sets this',
				retrieved: '2026-09-12'
			}
		}
	],
	calibration: CALIBRATION.id,
	ontology: { classes: ['Patient', 'Case', 'Decision'], specialCategory: [] },
	journeys: [
		{ workflowId: 'vaccination/vaccination', name: 'Vaccination', status: 'shipped' },
		{ workflowId: 'referral/referral', name: 'Referral', status: 'shipped' },
		{
			workflowId: 'not-yet',
			name: 'A journey the domain has not built',
			status: 'out',
			why: 'Scaffolded as out: say here what keeps a journey out of the domain, or delete the row.'
		}
	],
	personas: [...PERSONA_IDS],
	glossary: {
		patient: 'The root entity every journey is about (the Kit says “visitor”).',
		case: 'One thing a journey works, with its truth beside it.',
		journey: 'A workflow: the stages a case passes through, each with an executor.'
	}
};
