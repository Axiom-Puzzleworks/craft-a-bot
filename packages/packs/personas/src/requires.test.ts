import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '@craftabot/core';
import openAiPack from '@craftabot/pack-openai';
import personasPack from './index.js';

/** The pack says what its cartridges need (WP52, `40-DEBTS.md` §4.5), and the registry holds it to that. */
describe('personas and its provider', () => {
	it('declares the OpenAI pack, and is refused without it', () => {
		expect(personasPack.requiresPacks).toEqual({ openai: '>=1.0.0' });
		const alone = createPackRegistry();
		expect(() => alone.registerPack(personasPack)).toThrow(/needs pack "openai"/);

		const together = createPackRegistry();
		together.registerPack(openAiPack);
		expect(() => together.registerPack(personasPack)).not.toThrow();
		expect(
			together.listCartridges().some((cartridge) => cartridge.id.startsWith('personas/'))
		).toBe(true);
	});
});
