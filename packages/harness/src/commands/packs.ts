import type { HarnessConfig } from '../config.js';
import { createRegistry } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { credentialVariable } from '../credentials.js';

/**
 * `craftabot packs` — what this host can assemble, and what it is plugged
 * into. The one report that names credentials, and it names only whether
 * each is *set* and which variable would set it — never a value.
 */
export interface PackReport {
	packs: Array<{ id: string; name: string; version: string }>;
	brickKinds: Array<{ id: string; slot: string; audience: 'kit' | 'workshop' }>;
	providers: Array<{ id: string; name: string; keyRequirement: 'required' | 'none' }>;
	goalCards: string[];
	credentials: Array<{ id: string; variable: string; set: boolean; neededBy: string }>;
}

export function describePacks(config: HarnessConfig, credentials: CredentialSource): PackReport {
	const registry = createRegistry(config);
	const credentialRows: PackReport['credentials'] = [];

	for (const provider of registry.listProviderFactories()) {
		if (provider.keyRequirement !== 'required') continue;
		credentialRows.push({
			id: provider.id,
			variable: credentialVariable(provider.id),
			set: credentials.has(provider.id),
			neededBy: `provider ${provider.id}`
		});
	}
	for (const kind of registry.listBrickKinds()) {
		if (!kind.credential) continue;
		credentialRows.push({
			id: kind.credential.id,
			variable: credentialVariable(kind.credential.id),
			set: credentials.has(kind.credential.id),
			neededBy: `brick ${kind.id}`
		});
	}

	return {
		packs: config.packs.map((pack) => ({ id: pack.id, name: pack.name, version: pack.version })),
		brickKinds: registry
			.listBrickKinds()
			.map((kind) => ({ id: kind.id, slot: kind.slot, audience: kind.audience ?? 'kit' })),
		providers: registry
			.listProviderFactories()
			.map((p) => ({ id: p.id, name: p.name, keyRequirement: p.keyRequirement })),
		goalCards: registry.listGoalCards().map((card) => card.id),
		credentials: credentialRows
	};
}

export function renderPacks(report: PackReport): string {
	const lines: string[] = [];
	lines.push('Packs');
	for (const pack of report.packs)
		lines.push(`  ${pack.id.padEnd(10)} ${pack.version.padEnd(8)} ${pack.name}`);
	lines.push('', 'Brick kinds');
	for (const kind of report.brickKinds) {
		lines.push(`  ${kind.id.padEnd(22)} ${kind.slot.padEnd(11)} ${kind.audience}`);
	}
	lines.push('', 'Providers');
	for (const provider of report.providers) {
		lines.push(
			`  ${provider.id.padEnd(10)} ${provider.keyRequirement === 'required' ? 'needs a key' : 'keyless'}`
		);
	}
	lines.push('', `Goal cards: ${report.goalCards.length}`);
	lines.push('', 'Credentials (from the environment; values are never shown)');
	for (const row of report.credentials) {
		lines.push(`  ${row.variable.padEnd(34)} ${row.set ? 'set' : 'not set'}   ${row.neededBy}`);
	}
	return `${lines.join('\n')}\n`;
}
