import type { AgentSpec } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { capabilitiesOf } from '$lib/bot-capabilities.js';
import { createRegistry } from '$lib/packs.js';
import type { WebStorageLike } from '$lib/state/keys.js';
import { createSettingsStore } from '$lib/state/settings.js';
import { createLeaflet } from './leaflet.svelte.js';

/**
 * The leaflet controller: progress, badges, and the small amount of state the
 * pure chapter model cannot hold.
 */

function fakeStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

const BRAIN = { cartridgeId: 'demo', temperature: 0, maxTokens: 256, personality: '' };
const ACTIONS = { enabled: ['move', 'say', 'celebrate'] };

function spec(over: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: '55555555-5555-4555-8555-555555555555',
		name: 'Tutorialbot',
		bricks: { llm: BRAIN },
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1,
		...over
	};
}

/**
 * A report about a bot, in the vocabulary the leaflet now speaks (WP14 slice 4c).
 *
 * The fixtures stay written as bots and are turned into capabilities here — the
 * same conversion the bench and play pages do — so these tests exercise the
 * real bricks rather than a hand-built claim about them.
 */
function built(over: Partial<AgentSpec> = {}) {
	const bot = spec(over);
	return { can: capabilitiesOf(bot, createRegistry()), goalCardId: bot.goalCardId };
}

const leafletWith = (storage: WebStorageLike = fakeStore()) => ({
	leaflet: createLeaflet({ settings: createSettingsStore(storage) }),
	storage
});

describe('when the leaflet opens by itself', () => {
	it('opens for a first-time visitor', () => {
		const { leaflet } = leafletWith();
		expect(leaflet.open).toBe(true);
		expect(leaflet.chapter?.number).toBe(1);
	});

	it('stays shut for someone who said they had built kits before', () => {
		const storage = fakeStore();
		createSettingsStore(storage).update({ tutorialSkipped: true });
		expect(leafletWith(storage).leaflet.open).toBe(false);
	});

	it('stays shut for someone already partway through', () => {
		const storage = fakeStore();
		createSettingsStore(storage).update({ tutorialChapter: 2 });
		const { leaflet } = leafletWith(storage);
		expect(leaflet.open).toBe(false);
		expect(leaflet.chapter?.number).toBe(3);
	});

	it('reopens from the Instructions handle whatever the history', () => {
		const storage = fakeStore();
		createSettingsStore(storage).update({ tutorialSkipped: true });
		const { leaflet } = leafletWith(storage);
		leaflet.show();
		expect(leaflet.open).toBe(true);
	});
});

describe('skipping', () => {
	it('is remembered, and does not pretend the chapters were done', () => {
		const { leaflet, storage } = leafletWith();
		leaflet.skip();

		expect(leaflet.open).toBe(false);
		expect(leaflet.badges).toStrictEqual([]);
		expect(createSettingsStore(storage).read().tutorialSkipped).toBe(true);
		expect(createSettingsStore(storage).read().tutorialChapter).toBe(0);
	});
});

/** Drive chapter 1 to its end: bot, run, notice, actions, run again. */
function completeChapterOne(leaflet: ReturnType<typeof createLeaflet>) {
	leaflet.report({ route: 'bench', ...built() });
	leaflet.report({ route: 'play', ticks: 2, variant: 'no-actions' });
	leaflet.ack('notice');
	leaflet.report({ ...built({ bricks: { llm: BRAIN, actions: ACTIONS } }) });
	leaflet.report({ ticks: 1, variant: 'no-sight' });
}

describe('finishing a chapter', () => {
	it('awards the badge and moves to the next chapter', () => {
		const { leaflet } = leafletWith();
		expect(leaflet.chapter?.number).toBe(1);

		completeChapterOne(leaflet);

		expect(leaflet.badges).toStrictEqual(['first-words']);
		expect(leaflet.justEarned).toBe('first-words');
		expect(leaflet.chapter?.number).toBe(2);
	});

	it('persists progress across a reload', () => {
		const { leaflet, storage } = leafletWith();
		completeChapterOne(leaflet);

		const reopened = createLeaflet({ settings: createSettingsStore(storage) });
		expect(reopened.chapter?.number).toBe(2);
		expect(reopened.badges).toStrictEqual(['first-words']);
	});

	it('clears acknowledgements so a later chapter cannot inherit them', () => {
		const { leaflet } = leafletWith();
		completeChapterOne(leaflet);

		// Chapter 2 opens on its own unread `blind` step, not skipped past it.
		expect(leaflet.step?.id).toBe('blind');
	});

	it('the badge popper can be dismissed', () => {
		const { leaflet } = leafletWith();
		completeChapterOne(leaflet);
		leaflet.dismissBadge();
		expect(leaflet.justEarned).toBeUndefined();
	});
});

describe('rebuilding the bot', () => {
	it('throws away the last run, so the next chapter needs a real one', () => {
		const { leaflet } = leafletWith();
		completeChapterOne(leaflet);
		expect(leaflet.chapter?.number).toBe(2);

		// Chapter 2 ends on a *successful* run. Fitting the Sense brick must not
		// carry the previous chapter's outcome across and tick it off unearned.
		leaflet.ack('blind');
		leaflet.report({
			...built({ bricks: { llm: BRAIN, actions: ACTIONS, sense: { channels: ['sight'] } } })
		});

		expect(leaflet.steps.find((view) => view.step.id === 'see')?.done).toBe(false);
		expect(leaflet.chapter?.number).toBe(2);

		// A real successful run finishes it.
		leaflet.report({ ticks: 5, outcome: 'SUCCESS' });
		expect(leaflet.chapter?.number).toBe(3);
	});
});

describe('the step list the panel renders', () => {
	it('marks exactly one step as current, and ticks the ones behind it', () => {
		const { leaflet } = leafletWith();
		leaflet.report({ route: 'bench', ...built() });

		const views = leaflet.steps;
		expect(views.filter((view) => view.current)).toHaveLength(1);
		expect(views[0]?.done).toBe(true); // a bot is open
		expect(views.find((view) => view.current)?.step.id).toBe('first-go');
	});
});

describe('starting over', () => {
	it('clears progress and badges and opens at chapter one', () => {
		const { leaflet, storage } = leafletWith();
		leaflet.report({ route: 'bench', ...built() });
		leaflet.report({ ticks: 2, variant: 'no-actions' });
		leaflet.ack('notice');

		leaflet.restart();

		expect(leaflet.chapter?.number).toBe(1);
		expect(leaflet.badges).toStrictEqual([]);
		expect(leaflet.open).toBe(true);
		expect(createSettingsStore(storage).read().tutorialSkipped).toBe(false);
	});
});
