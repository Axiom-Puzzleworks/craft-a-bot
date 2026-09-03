import type { PackManifest } from '@craftabot/core';
import { personaCartridges } from './catalogue.js';

/**
 * `@craftabot/pack-personas` — the LLM Multi-Pack's persona cartridges
 * (`06-LLM-PROVIDERS.md` §8, WP26).
 *
 * Ships no bricks, tools or worlds — pure catalogue content, like
 * `@craftabot/pack-openai` itself. A builder who has this pack installed sees
 * six more cartridges in the Brain brick's picker alongside the three V1
 * ones; nothing else about a bot changes.
 */
export const personasPack: PackManifest = {
	id: 'personas',
	name: 'LLM Multi-Pack — Persona Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	/** Every persona is an OpenAI-provider cartridge; said in the manifest, not only in the catalogue (WP52). */
	requiresPacks: { openai: '>=1.0.0' },
	cartridges: personaCartridges
};

export default personasPack;

export { personaCartridges } from './catalogue.js';
