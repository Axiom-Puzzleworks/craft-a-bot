import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { BrickKindDefinition, SlotId } from '@craftabot/core';
import starterPack from '@craftabot/pack-starter';

/**
 * **The tray comes out of the registry** (WP14 slice 4b).
 *
 * V1 ships one brick per socket, so the shipped kit cannot exercise the thing
 * this slice actually changed: a second kind competing for a socket. Here an
 * expansion pack is installed alongside the starter one and the tray is asked
 * what it does about it.
 *
 * The Monitor is invented in this file, as everything proving the open contract
 * is. Nothing about it is known to the workbench — no panel, no art, no entry
 * in any table.
 */

const monitorKind = {
	id: 'expansion/monitor',
	slot: 'safety',
	name: 'Watchbot',
	description: 'Keeps an eye on things.',
	realName: 'Runtime Monitor',
	realExplanation: 'Observes the agent and raises alerts.',
	configSchema: z.object({ watchFor: z.array(z.string()) }),
	configVersion: 1,
	defaults: { watchFor: [] }
} as BrickKindDefinition;

/** A Workshop-only kind (`25-…` §4.8, WP35 stage C) — the tray's own gate under test below. */
const hostedKind = {
	id: 'expansion/hosted',
	slot: 'perception',
	name: 'Hosted Watcher',
	description: 'Talks to a service outside the browser.',
	realName: 'Hosted Watcher',
	realExplanation: 'Talks to a service outside the browser.',
	configSchema: z.object({}),
	configVersion: 1,
	defaults: {},
	audience: 'workshop'
} as BrickKindDefinition;

vi.mock('$lib/packs.js', async () => {
	const core = await import('@craftabot/core');
	const starter = (await import('@craftabot/pack-starter')).default;
	return {
		createRegistry: () => {
			const registry = core.createPackRegistry();
			registry.registerPack(starter);
			registry.registerPack({
				id: 'expansion',
				name: 'Expansion',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				brickKinds: [monitorKind, hostedKind]
			});
			return registry;
		}
	};
});

// Imported after the mock so the component picks it up.
const { default: PartsTray } = await import('./PartsTray.svelte');
const { preferences } = await import('$lib/state/preferences.svelte.js');

/** The starter safety brick, for the socket-taken case. */
const SAFETY = { kindId: 'starter/safety', name: 'Safety Brick' };

const controller = {
	carrying: undefined,
	candidate: undefined,
	rejecting: undefined,
	aimedAt: undefined,
	registerSocket: () => () => {},
	liftWithPointer: () => {},
	movePointer: () => {},
	dropPointer: () => {},
	liftWithKeyboard: vi.fn(),
	aim: () => {},
	placeAimed: () => {},
	cancel: () => {}
};

function mount(fittedIn: (slot: SlotId) => { kindId: string; name: string } | undefined) {
	return render(PartsTray, {
		props: { controller, fittedIn, onselect: vi.fn() }
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	preferences.setWorkshop(false);
});

describe('a brick from a pack the workbench ships no code for', () => {
	it('is in the tray, with its own name and description', () => {
		mount(() => undefined);
		expect(screen.getByTestId('tray-expansion/monitor')).toBeInTheDocument();
		expect(screen.getByText('Watchbot')).toBeInTheDocument();
		expect(screen.getByText('Keeps an eye on things.')).toBeInTheDocument();
	});

	it('sits beside the starter bricks rather than replacing them', () => {
		mount(() => undefined);
		// Six from the starter pack, one from the expansion.
		const wells = screen.getAllByTestId(/^tray-/);
		expect(wells).toHaveLength((starterPack.brickKinds ?? []).length + 1);
		expect(screen.getByTestId('tray-starter/safety')).toBeInTheDocument();
	});

	/**
	 * The generic moulded shape, told apart by its footprint: 3×2 studs where the
	 * safety brick's shield is 2×2 (`11-…` §2.1). A kind with no art must not
	 * borrow the silhouette of whatever else lives in its socket — that would
	 * draw a Monitor as the Safety Brick.
	 */
	it('gets the generic silhouette, not the one belonging to its socket', () => {
		mount(() => undefined);
		const monitor = screen.getByTestId('tray-expansion/monitor').querySelector('svg');
		const safety = screen.getByTestId('tray-starter/safety').querySelector('svg');
		expect(monitor?.getAttribute('viewBox')).toBe('0 0 72 48');
		expect(safety?.getAttribute('viewBox')).toBe('0 0 48 48');
	});

	/** Colour means the concept, and the socket carries it (`04-…` §2.2). */
	it('is still safety-coloured, because it is still governance', () => {
		mount(() => undefined);
		const monitor = screen.getByTestId('tray-expansion/monitor').querySelector('svg');
		expect(monitor?.getAttribute('class')).toContain('brick--safety');
	});
});

describe('two bricks wanting one socket', () => {
	it('closes the well and says which brick is in the way', () => {
		mount((slot) => (slot === 'safety' ? SAFETY : undefined));

		const monitor = screen.getByTestId('tray-expansion/monitor');
		expect(monitor).toBeDisabled();
		expect(monitor.getAttribute('aria-label')).toContain('The Safety Brick is in the chest socket');
	});

	it('says "fitted" for the brick that is actually on the bot', () => {
		mount((slot) => (slot === 'safety' ? SAFETY : undefined));

		const safety = screen.getByTestId('tray-starter/safety');
		expect(safety).toBeDisabled();
		expect(safety.getAttribute('aria-label')).toContain('Already fitted');
		expect(safety.getAttribute('data-fitted')).toBe('true');
	});

	/** The occupant is fitted; the one that could not go in is merely blocked. */
	it('does not claim the blocked brick is fitted', () => {
		mount((slot) => (slot === 'safety' ? SAFETY : undefined));
		expect(screen.getByTestId('tray-expansion/monitor').getAttribute('data-fitted')).toBe('false');
	});

	it('leaves every other socket alone', () => {
		mount((slot) => (slot === 'safety' ? SAFETY : undefined));
		expect(screen.getByTestId('tray-starter/llm')).toBeEnabled();
	});

	it('will not let a blocked brick be picked up with the keyboard', async () => {
		mount((slot) => (slot === 'safety' ? SAFETY : undefined));

		const monitor = screen.getByTestId('tray-expansion/monitor');
		monitor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(controller.liftWithKeyboard).not.toHaveBeenCalled();
	});
});

/**
 * `audience: 'workshop'` (`25-ARMOUR-BRICK.md` §4.8, WP35 stage C) — a kind
 * the Workshop has and the Kit does not, gated on the same
 * `preferences.workshop` switch the Kit's own nav already uses. The engine
 * never gates on it (a kit file carrying one still validates and runs
 * anywhere); only the offering — this tray — does.
 */
describe('a Workshop-only kind', () => {
	it('is hidden from the tray while the Workshop door is shut', () => {
		mount(() => undefined);
		expect(screen.queryByTestId('tray-expansion/hosted')).not.toBeInTheDocument();
	});

	it('appears in the tray once the Workshop door is open', () => {
		preferences.setWorkshop(true);
		mount(() => undefined);
		expect(screen.getByTestId('tray-expansion/hosted')).toBeInTheDocument();
	});

	it('leaves every other kind unaffected either way', () => {
		preferences.setWorkshop(true);
		mount(() => undefined);
		expect(screen.getByTestId('tray-expansion/monitor')).toBeInTheDocument();
		expect(screen.getByTestId('tray-starter/safety')).toBeInTheDocument();
	});
});
