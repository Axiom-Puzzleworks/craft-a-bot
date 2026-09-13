import { z } from 'zod';

/**
 * **The domain spec** (WP106 stage A, `83-TARGET-DESIGN-V6.md` §6.6.1;
 * decision D13, tenet 31): what a domain pack *is*, as data — the world
 * pack and the journey packs, the obligation vocabulary with its glosses,
 * the decision rights with a ceiling and a source each, the calibration
 * table, the ontology's classes and its special category, the coverage
 * matrix (which journeys ship, which support, which are out and why), the
 * personas and the glossary. Shipped on `PackManifest.domains`; the bank
 * ships `uk-retail-banking`. `checkDomainPack` (WP107) holds the checklist
 * against it; the journeys page draws the matrix from it.
 */
export const journeyCoverageStatusSchema = z.enum(['shipped', 'supporting', 'out']);
export type JourneyCoverageStatus = z.infer<typeof journeyCoverageStatusSchema>;

export const domainSourceRefSchema = z.object({
	title: z.string().min(1),
	url: z.string().url().optional(),
	/** ISO date the source was read. */
	retrieved: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
});
export type DomainSourceRef = z.infer<typeof domainSourceRefSchema>;

export const domainDecisionRightSchema = z.object({
	/** The decision kind a workflow's `decisionKindOf` returns. */
	kind: z.string().min(1),
	/** The highest autonomy level the kind may run at — measured, never enforced (`64-…` §6.5). */
	ceiling: z.number().int().min(1).max(5),
	why: z.string().min(1),
	source: domainSourceRefSchema
});
export type DomainDecisionRight = z.infer<typeof domainDecisionRightSchema>;

export const domainJourneySchema = z.object({
	/** A registered workflow's id when shipped or supporting; the journey's name for one that is out. */
	workflowId: z.string().min(1),
	name: z.string().min(1),
	status: journeyCoverageStatusSchema,
	/** Required when the journey is out or only supporting: what keeps it so. */
	why: z.string().optional()
});
export type DomainJourney = z.infer<typeof domainJourneySchema>;

export const domainSpecSchema = z.object({
	schemaVersion: z.literal(1),
	/** Qualified like every content id: `{packId}/{localId}`. */
	id: z.string().min(1),
	name: z.string().min(1),
	jurisdiction: z.string().min(1),
	sector: z.string().min(1),
	packs: z.object({
		world: z.string().min(1),
		journeys: z.array(z.string().min(1))
	}),
	/** The obligation tag vocabulary with a gloss each. */
	obligations: z.record(z.string(), z.string()),
	decisionRights: z.array(domainDecisionRightSchema),
	/** The calibration table's id. */
	calibration: z.string().min(1),
	ontology: z.object({
		classes: z.array(z.string().min(1)),
		specialCategory: z.array(z.string().min(1))
	}),
	/** The coverage matrix. */
	journeys: z.array(domainJourneySchema),
	/** Persona ids the world pack ships. */
	personas: z.array(z.string().min(1)),
	/** The domain's words, both registers. */
	glossary: z.record(z.string(), z.string())
});
export type DomainSpec = z.infer<typeof domainSpecSchema>;
