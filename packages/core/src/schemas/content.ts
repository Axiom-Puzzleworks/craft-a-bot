import { z } from 'zod';
import { assertionCardSchema, type AssertionCard } from './assertion-card.js';
import type { PackManifest } from './pack-manifest.js';
import { policyCardSchema, type PolicyCard } from './policy-card.js';
import { scenarioDefinitionSchema, type ScenarioDefinition } from './scenario.js';

/**
 * **The Workshop content store's record** (`34-CONTENT-STORE.md` §4.1,
 * WP46; `26-…` §6.10): one shape for everything a person authors — a policy
 * card, an assertion card, a scenario, a campaign — under the reserved pack
 * id `local`, so an authored id can never collide with a shipped one. The
 * three core kinds are validated against their own schemas; a campaign is
 * opaque here (its schema lives in `evals`) and is never pack content.
 */

export const LOCAL_PACK_ID = 'local';
export const CONTENT_SCHEMA_VERSION = 1;

export const contentKindSchema = z.enum(['policy-card', 'assertion-card', 'scenario', 'campaign']);
export type ContentKind = z.infer<typeof contentKindSchema>;

/** The id segment each kind lives under — `local/policy/<slug>`, matching the shipped packs' own conventions. */
export const CONTENT_SEGMENT: Record<ContentKind, string> = {
	'policy-card': 'policy',
	'assertion-card': 'testbench',
	scenario: 'scenarios',
	campaign: 'campaigns'
};

export function isLocalId(id: string): boolean {
	return id.startsWith(`${LOCAL_PACK_ID}/`);
}

export function slugOf(title: string): string {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug === '' ? 'untitled' : slug;
}

export function localContentId(kind: ContentKind, slug: string): string {
	return `${LOCAL_PACK_ID}/${CONTENT_SEGMENT[kind]}/${slug}`;
}

const localIdSchema = z
	.string()
	.regex(/^local\/(policy|testbench|scenarios|campaigns)\/[a-z0-9][a-z0-9-]*$/, {
		message: 'a local content id is local/<segment>/<slug>'
	});

export const contentRecordSchema = z
	.object({
		id: localIdSchema,
		kind: contentKindSchema,
		title: z.string().min(1),
		record: z.unknown(),
		savedAt: z.string().datetime(),
		schemaVersion: z.literal(CONTENT_SCHEMA_VERSION)
	})
	.superRefine((value, ctx) => {
		if (!value.id.startsWith(`${LOCAL_PACK_ID}/${CONTENT_SEGMENT[value.kind]}/`)) {
			ctx.addIssue({
				code: 'custom',
				path: ['id'],
				message: `a ${value.kind} lives under local/${CONTENT_SEGMENT[value.kind]}/`
			});
			return;
		}
		const inner = innerSchemaFor(value.kind)?.safeParse(value.record);
		if (inner && !inner.success) {
			ctx.addIssue({
				code: 'custom',
				path: ['record'],
				message: `not a valid ${value.kind}: ${inner.error.issues[0]?.message ?? 'invalid'}`
			});
			return;
		}
		const innerId = (value.record as { id?: unknown } | undefined)?.id;
		if (typeof innerId === 'string' && innerId !== value.id) {
			ctx.addIssue({
				code: 'custom',
				path: ['record', 'id'],
				message: 'the record inside carries the same id as the envelope'
			});
		}
	});
export type ContentRecord = z.infer<typeof contentRecordSchema>;

function innerSchemaFor(kind: ContentKind): z.ZodType | undefined {
	switch (kind) {
		case 'policy-card':
			return policyCardSchema;
		case 'assertion-card':
			return assertionCardSchema;
		case 'scenario':
			return scenarioDefinitionSchema;
		case 'campaign':
			return undefined;
	}
}

export function parseContentRecord(value: unknown): ContentRecord {
	return contentRecordSchema.parse(value);
}

export function safeParseContentRecord(
	value: unknown
): ReturnType<typeof contentRecordSchema.safeParse> {
	return contentRecordSchema.safeParse(value);
}

/**
 * A record for a card or scenario: the envelope around it, its id made
 * local from its title (or the slug given).
 */
export function contentRecordFor(
	kind: Exclude<ContentKind, 'campaign'>,
	record: PolicyCard | AssertionCard | ScenarioDefinition,
	options: { slug?: string; savedAt: string }
): ContentRecord {
	const id = localContentId(kind, options.slug ?? slugOf(record.title));
	return parseContentRecord({
		id,
		kind,
		title: record.title,
		record: { ...record, id },
		savedAt: options.savedAt,
		schemaVersion: CONTENT_SCHEMA_VERSION
	});
}

/**
 * **The synthetic local pack** (`34-…` §4.1): the store's records as an
 * ordinary manifest, registered beside the shipped packs. Campaigns are
 * left out — the registry has no field for them and the Campaigns page
 * lists them itself.
 */
export function localPackFrom(records: readonly ContentRecord[]): PackManifest {
	const policyCards: PolicyCard[] = [];
	const assertionCards: AssertionCard[] = [];
	const scenarios: ScenarioDefinition[] = [];
	for (const entry of records) {
		switch (entry.kind) {
			case 'policy-card':
				policyCards.push(policyCardSchema.parse(entry.record));
				break;
			case 'assertion-card':
				assertionCards.push(assertionCardSchema.parse(entry.record));
				break;
			case 'scenario':
				scenarios.push(scenarioDefinitionSchema.parse(entry.record));
				break;
			case 'campaign':
				break;
		}
	}
	return {
		id: LOCAL_PACK_ID,
		name: 'Your content',
		version: '0.0.0-local',
		requiresCore: '>=0.0.1',
		...(policyCards.length > 0 ? { policyCards } : {}),
		...(assertionCards.length > 0 ? { assertionCards } : {}),
		...(scenarios.length > 0 ? { scenarios } : {})
	};
}
