import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { describePacks, renderPacks } from './packs.js';

describe('craftabot packs', () => {
	it('lists what the default config can assemble, and which credentials it would read', () => {
		const report = describePacks(
			defaultConfig(),
			credentialsFromEnv({ CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-secret' })
		);

		expect(report.packs.map((p) => p.id)).toContain('starter');
		expect(report.brickKinds.find((k) => k.id === 'geap/armor')?.audience).toBe('workshop');
		expect(report.brickKinds.find((k) => k.id === 'starter/llm')?.audience).toBe('kit');
		expect(report.providers.find((p) => p.id === 'ollama')?.keyRequirement).toBe('none');

		const openai = report.credentials.find((c) => c.id === 'openai');
		expect(openai).toEqual({
			id: 'openai',
			variable: 'CRAFTABOT_CREDENTIAL_OPENAI',
			set: true,
			neededBy: 'provider openai'
		});
		expect(report.credentials.find((c) => c.id === 'geap')).toMatchObject({
			set: false,
			neededBy: 'brick geap/armor'
		});
		expect(report.credentials.find((c) => c.id === 'ollama')).toBeUndefined();
	});

	it('renders without ever printing a secret', () => {
		const text = renderPacks(
			describePacks(
				defaultConfig(),
				credentialsFromEnv({ CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-secret' })
			)
		);
		expect(text).toContain('CRAFTABOT_CREDENTIAL_OPENAI');
		expect(text).toContain('set');
		expect(text).not.toContain('sk-planted-secret');
	});
});
