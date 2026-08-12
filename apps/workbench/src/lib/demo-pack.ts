import type { PackManifest } from '@craftabot/core';

/**
 * The demo cartridge.
 *
 * Without at least one cartridge installed, `validateSpec` reports
 * `unknown-cartridge` forever and no bot can ever reach the Playroom — the LLM
 * brick would have an empty slot with nothing to put in it. The OpenAI
 * cartridges arrive in WP7; this is what makes the toy work before then.
 *
 * It is not a stopgap that gets deleted, either: `05-TECH-STACK.md` §2 and
 * `09-ROADMAP.md` §4.1 both want a keyless demo running on the mock provider,
 * and this is that, presented honestly as what it is — a scripted brain that
 * needs no battery.
 */
export const DEMO_CARTRIDGE_ID = 'demo/demo-brain';

export const demoPack: PackManifest = {
	id: 'demo',
	name: 'Demo Brain — no batteries required',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: DEMO_CARTRIDGE_ID,
			providerId: 'demo',
			model: 'scripted-demo-1',
			displayName: 'Demo Brain',
			blurb: 'Follows a script. Needs no battery, and never sends anything anywhere.',
			stats: { words: 1, reasoning: 1, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};
