import { describe, expect, it } from 'vitest';
import { cartridgeDefinitionSchema } from '@craftabot/core';
import { FIXED_TEMPERATURE, MODELS, OPENAI_PROVIDER_ID } from '@craftabot/pack-openai';
import { personaCartridges } from './catalogue.js';

describe('personaCartridges', () => {
	it('is six cartridges, one per box-art persona, unique by id', () => {
		expect(personaCartridges).toHaveLength(6);
		expect(new Set(personaCartridges.map((c) => c.id)).size).toBe(6);
	});

	it('every entry is a complete, schema-valid catalogue entry', () => {
		for (const cartridge of personaCartridges) {
			expect(cartridgeDefinitionSchema.safeParse(cartridge).success, cartridge.id).toBe(true);
		}
	});

	it('every entry has a non-empty personality — the whole point of a persona cartridge', () => {
		for (const cartridge of personaCartridges) {
			expect(cartridge.personality?.trim(), cartridge.id).not.toBe('');
		}
	});

	it('rides the existing OpenAI provider and one of its three real models', () => {
		const knownModels: string[] = Object.values(MODELS);
		for (const cartridge of personaCartridges) {
			expect(cartridge.providerId, cartridge.id).toBe(OPENAI_PROVIDER_ID);
			expect(knownModels, cartridge.id).toContain(cartridge.model);
		}
	});

	it('fixes temperature at the value the live GPT-5 family actually accepts', () => {
		// A hard 400 for any other value (pack-openai/catalogue.ts) — a persona
		// cannot express itself through temperature, only through personality
		// text and model choice.
		for (const cartridge of personaCartridges) {
			expect(cartridge.defaults.temperature, cartridge.id).toBe(FIXED_TEMPERATURE);
		}
	});

	it('puts Coder on Penny Thinker — the cheap, low-reasoning model, on purpose', () => {
		const coder = personaCartridges.find((c) => c.id === 'personas/coder');
		expect(coder?.model).toBe(MODELS.pennyThinker);
	});
});
