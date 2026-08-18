import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { CartridgeDefinition } from '@craftabot/core';
import LlmPanel from './LlmPanel.svelte';

/**
 * **A cartridge is a physical object you snap in, not a label** (WP26).
 *
 * `CartridgeDefinition.defaults` sat unread since the schema existed —
 * `pack-testkit`'s `checkCartridge` has documented as much since WP21. These
 * tests are the other half of that finding: picking a cartridge now actually
 * writes its defaults (and, for a persona cartridge, its personality) into
 * the brick config, rather than leaving the dials wherever they were.
 */

const quick: CartridgeDefinition = {
	id: 'openai/quick-thinker',
	providerId: 'openai',
	model: 'gpt-5-mini',
	displayName: 'Quick Thinker',
	blurb: 'Fast and cheerful.',
	stats: { words: 2, reasoning: 2, speed: 3 },
	costHint: 'low',
	defaults: { temperature: 1, maxTokens: 800 }
};

const storyteller: CartridgeDefinition = {
	id: 'personas/storyteller',
	providerId: 'openai',
	model: 'gpt-5-mini',
	displayName: 'Storyteller',
	blurb: 'Turns what it sees into a little story.',
	stats: { words: 3, reasoning: 2, speed: 3 },
	costHint: 'low',
	defaults: { temperature: 1, maxTokens: 900 },
	personality: 'You love turning what you see into a little story as you go.'
};

function mount(config: Record<string, unknown>, onupdate = vi.fn()) {
	render(LlmPanel, {
		props: {
			config,
			cartridges: [quick, storyteller],
			spec: {} as never,
			tools: [],
			senseChannels: [],
			worldActions: [],
			policyCards: [],
			onupdate
		}
	});
	return { onupdate };
}

describe('picking a cartridge', () => {
	it('writes the cartridge id plus its temperature and maxTokens defaults', async () => {
		const { onupdate } = mount({ cartridgeId: '', temperature: 0, maxTokens: 0, personality: '' });
		await fireEvent.change(screen.getByTestId('cartridge-select'), {
			target: { value: 'openai/quick-thinker' }
		});
		expect(onupdate).toHaveBeenCalledWith({
			cartridgeId: 'openai/quick-thinker',
			temperature: 1,
			maxTokens: 800,
			personality: ''
		});
	});

	it('also writes a persona cartridge’s personality text', async () => {
		const { onupdate } = mount({ cartridgeId: '', temperature: 0, maxTokens: 0, personality: '' });
		await fireEvent.change(screen.getByTestId('cartridge-select'), {
			target: { value: 'personas/storyteller' }
		});
		expect(onupdate).toHaveBeenCalledWith({
			cartridgeId: 'personas/storyteller',
			temperature: 1,
			maxTokens: 900,
			personality: 'You love turning what you see into a little story as you go.'
		});
	});

	it('overwrites a hand-typed personality when a new cartridge is snapped in', async () => {
		const { onupdate } = mount({
			cartridgeId: 'openai/quick-thinker',
			temperature: 1,
			maxTokens: 800,
			personality: 'A personality the builder typed by hand.'
		});
		await fireEvent.change(screen.getByTestId('cartridge-select'), {
			target: { value: 'personas/storyteller' }
		});
		expect(onupdate).toHaveBeenCalledWith(
			expect.objectContaining({
				personality: 'You love turning what you see into a little story as you go.'
			})
		);
	});

	it('clearing the slot leaves the other dials alone', async () => {
		const { onupdate } = mount({
			cartridgeId: 'openai/quick-thinker',
			temperature: 1,
			maxTokens: 800,
			personality: 'Kept as-is.'
		});
		await fireEvent.change(screen.getByTestId('cartridge-select'), { target: { value: '' } });
		expect(onupdate).toHaveBeenCalledWith({ cartridgeId: '' });
	});
});
