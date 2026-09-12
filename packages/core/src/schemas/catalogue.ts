import { z } from 'zod';
import { POINT_KINDS } from '../types/guardrail-component.js';

/**
 * **The Guardrail Catalogue's entry** (WP98, `86-CATALOGUE.md` §3;
 * `83-…` §6.4.1, tenet 28): one technique the industry ships or the
 * research proposes — taxonomised, mapped to the threat and framework
 * vocabularies, cited, and carrying a *coverage* status that says what this
 * product can honestly claim about it. Content in `governance`
 * (`catalogue/entries.ts`); `docs/schemas/guardrail-catalogue.schema.json`.
 */
export const CATALOGUE_CATEGORIES = [
	'runtime-protection',
	'secure-by-design',
	'identity-and-access',
	'component-hardening',
	'evaluation-and-assurance',
	'human-oversight'
] as const;
export const catalogueCategorySchema = z.enum(CATALOGUE_CATEGORIES);
export type CatalogueCategory = z.infer<typeof catalogueCategorySchema>;

export const CATALOGUE_MATURITIES = ['widely-adopted', 'emerging', 'research'] as const;
export const catalogueMaturitySchema = z.enum(CATALOGUE_MATURITIES);

/**
 * What the product can say about a technique (tenet 28): `shipped` — a
 * component or a mechanism exists here and the register can show what it
 * did; `connectable` — the shell meets a vendor's contract and a checkpoint
 * proves it; `bespoke` — a design of record exists, built in part or as
 * content; `blueprint` — described and mapped, nothing built; `not-applicable`
 * — said, with the reason. Nothing is implied.
 */
export const COVERAGE_STATUSES = [
	'shipped',
	'connectable',
	'bespoke',
	'blueprint',
	'not-applicable'
] as const;
export const coverageStatusSchema = z.enum(COVERAGE_STATUSES);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

/** OWASP's Agentic Top 10 (2026 edition) and the LLM Top 10 (2025): the closed threat lists an entry may cite; a MITRE ATLAS id is `AML.T…`. */
export const ASI_THREATS = [
	'ASI01',
	'ASI02',
	'ASI03',
	'ASI04',
	'ASI05',
	'ASI06',
	'ASI07',
	'ASI08',
	'ASI09',
	'ASI10'
] as const;
export const LLM_THREATS = [
	'LLM01',
	'LLM02',
	'LLM03',
	'LLM04',
	'LLM05',
	'LLM06',
	'LLM07',
	'LLM08',
	'LLM09',
	'LLM10'
] as const;
export const THREAT_ID_PATTERN = /^(ASI(0[1-9]|10)|LLM(0[1-9]|10)|AML\.T[0-9]{4}(\.[0-9]{3})?)$/;

/** The frameworks' prefixes an entry may map to — the control map's vocabulary (`53-…`), NIST, ISO, the EU AI Act, the PRA. */
export const FRAMEWORK_PREFIXES = [
	'nist-ai-rmf',
	'nist-ai-600-1',
	'iso-42001',
	'iso-23894',
	'eu-ai-act',
	'pra-ss1-23',
	'fca',
	'owasp',
	'cisa',
	'mitre-atlas'
] as const;
export const FRAMEWORK_ID_PATTERN = new RegExp(
	`^(${FRAMEWORK_PREFIXES.join('|')})(:[a-z0-9][a-z0-9.\\-]*)?$`
);

export const catalogueSourceSchema = z.object({
	title: z.string().min(1),
	publisher: z.string().min(1),
	year: z.number().int().min(1950).max(2100),
	url: z.string().url().optional(),
	kind: z.enum(['standard', 'vendor', 'paper', 'guidance'])
});
export type CatalogueSource = z.infer<typeof catalogueSourceSchema>;

export const catalogueCoverageSchema = z.object({
	status: coverageStatusSchema,
	/** The registered guardrail components that implement the technique (`85-…`). */
	componentIds: z.array(z.string().min(1)).optional(),
	/** What implements it when it is not a component — a mechanism, an evaluator, a card, a deck — named as the code names it. */
	implementedBy: z.array(z.string().min(1)).optional(),
	/** One sentence saying what the product means by the status. */
	note: z.string().min(1),
	/** The work package it landed in, when it landed. */
	since: z.string().min(1).optional()
});

export const catalogueEntrySchema = z.object({
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'a catalogue id is a kebab-case slug' }),
	name: z.string().min(1),
	summary: z.string().min(1),
	category: catalogueCategorySchema,
	subcategory: z.string().min(1),
	/** Where in the loop it decides, if it decides. */
	points: z.array(z.enum(POINT_KINDS as [string, ...string[]])),
	maturity: catalogueMaturitySchema,
	threats: z.array(z.string().regex(THREAT_ID_PATTERN)),
	frameworks: z.array(z.string().regex(FRAMEWORK_ID_PATTERN)),
	/** The bank's obligation tags where one applies (`48-…` §5). */
	obligations: z.array(z.string().min(1)).optional(),
	sources: z.array(catalogueSourceSchema).min(1),
	coverage: catalogueCoverageSchema,
	bankingRelevance: z.enum(['core', 'supporting', 'none']),
	/** Reviewed content, like the calibration table (`66-…`): pending until a person has read the entry against its sources. */
	review: z.enum(['pending', 'reviewed'])
});
export type CatalogueEntry = z.infer<typeof catalogueEntrySchema>;

export const guardrailCatalogueSchema = z.object({
	schemaVersion: z.literal(1),
	/** The edition, dated: `2026-09` for the first. */
	edition: z.string().min(1),
	entries: z.array(catalogueEntrySchema).min(1)
});
export type GuardrailCatalogue = z.infer<typeof guardrailCatalogueSchema>;
