/**
 * The edition's id and mode alone (`59-EDITIONS.md` §4.1, WP69) — read once
 * from `CAB_EDITION` at build — for the modules that need to know which box
 * this is without pulling in every pack (`settings.ts`); `edition.ts` builds
 * the full record on top of it.
 */
export type EditionId = 'simulator' | 'workshop' | 'playground' | 'full';
export const EDITION_IDS: readonly EditionId[] = ['simulator', 'workshop', 'playground', 'full'];

export function isEditionId(value: unknown): value is EditionId {
	return typeof value === 'string' && (EDITION_IDS as readonly string[]).includes(value);
}

// Vite defines `import.meta.env` in a build and in vitest; Playwright loads the e2e helpers under plain Node, where it is absent — then this is `full`.
const built = (import.meta as { env?: Record<string, unknown> }).env?.['CAB_EDITION'];
/** The edition this bundle was built as — `full` by default. */
export const editionId: EditionId = isEditionId(built) ? built : 'full';

/** Whether the Workshop door starts open in this box. */
export const EDITION_MODE: Record<EditionId, 'kit' | 'workshop'> = {
	simulator: 'kit',
	workshop: 'workshop',
	playground: 'workshop',
	full: 'kit'
};

const KIT_PACK_IDS = [
	'starter',
	'openai',
	'personas',
	'anthropic',
	'gemini',
	'ollama',
	'monitor',
	'workshop',
	'demo'
];
const WORKSHOP_PACK_IDS = [
	'geap',
	'guard-local',
	'azure-content-safety',
	'pdp-opa',
	'evals',
	'evidence',
	'governance'
];
const PLAYGROUND_PACK_IDS = [
	'fs-bank',
	'fs-advice',
	'fs-fraud',
	'fs-lending',
	'fs-onboarding',
	'fs-disputes',
	'fs-collections',
	'fs-servicing'
];

/** Which packs each box holds, by id — the manifests themselves come through `$edition-packs` (`editions/<id>.ts`). */
export const EDITION_PACK_IDS: Record<EditionId, readonly string[]> = {
	simulator: KIT_PACK_IDS,
	workshop: [...KIT_PACK_IDS, ...WORKSHOP_PACK_IDS],
	playground: [...KIT_PACK_IDS, ...WORKSHOP_PACK_IDS, ...PLAYGROUND_PACK_IDS],
	full: [...KIT_PACK_IDS, ...WORKSHOP_PACK_IDS, ...PLAYGROUND_PACK_IDS]
};
