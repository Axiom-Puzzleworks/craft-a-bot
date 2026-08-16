import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentSpecV2, BrickKindDefinition, FittedBrick } from '@craftabot/core';
import BrickPanel from './BrickPanel.svelte';

/**
 * **The panel is a dispatcher, not a taxonomy** (WP14 slice 4a).
 *
 * The claim worth a test is the one `12-…` D11 made false until now: a brick
 * kind the workbench has never heard of can be fitted and *opens a working
 * panel*. Before this slice it opened nothing — `BrickPanel` was six `if`s over
 * V1's brick names, so a seventh brick could be built, validated and run, and
 * then present the builder with a blank rectangle.
 *
 * Every kind here is invented in this file, including the one that stands in
 * for a shipped brick, so nothing passes because `starter/llm` happens to work.
 */

const world = [
	{ id: 'starter/playroom/move', name: 'Move', description: 'Roll one square.', parameters: {} },
	{ id: 'starter/playroom/open', name: 'Open', description: 'Open a container.', parameters: {} }
];

function spec(bricks: FittedBrick[]): AgentSpecV2 {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		schemaVersion: 2,
		bricks,
		goalCardId: 'starter/say-hello',
		identity: { displayName: 'Testbot', boxArtSeed: '' },
		createdAt: '2026-08-13T09:00:00Z',
		updatedAt: '2026-08-13T09:00:00Z'
	};
}

/** A brick from a pack this workbench has never seen — the case that matters. */
const monitorKind = {
	id: 'expansion/monitor',
	slot: 'safety',
	name: 'Watchbot',
	description: 'Keeps an eye on things.',
	realName: 'Runtime Monitor',
	realExplanation: 'Observes the agent and raises alerts.',
	configSchema: z.object({
		watchFor: z.array(z.string()),
		sensitivity: z.number().min(0).max(2),
		chatty: z.boolean()
	}),
	configVersion: 1,
	defaults: { watchFor: [], sensitivity: 1, chatty: false },
	controlHints: {
		watchFor: { control: 'checklist', source: 'actions', label: 'Watch for' },
		sensitivity: {
			control: 'dial',
			label: 'How twitchy?',
			options: [
				{ value: 0.5, label: 'relaxed' },
				{ value: 1.5, label: 'normal' },
				{ value: 2, label: 'hair-trigger' }
			]
		},
		chatty: { control: 'switch', label: 'Say something when it trips' }
	}
} as BrickKindDefinition;

const monitorBrick: FittedBrick = {
	slot: 'safety',
	kind: 'expansion/monitor',
	configVersion: 1,
	config: { watchFor: ['starter/playroom/open'], sensitivity: 1.8, chatty: false }
};

function mount(
	kind: BrickKindDefinition,
	brick: FittedBrick,
	onupdate = vi.fn(),
	onremove = vi.fn()
) {
	render(BrickPanel, {
		props: {
			brick,
			kind,
			spec: spec([brick]),
			cartridges: [],
			tools: [],
			senseChannels: [],
			worldActions: world,
			policyCards: [],
			onupdate,
			onremove
		}
	});
	return { onupdate, onremove };
}

describe('a brick kind the workbench has never heard of', () => {
	it('opens a panel with controls, rather than nothing at all', () => {
		mount(monitorKind, monitorBrick);
		expect(screen.getByTestId('brick-controls-safety')).toBeInTheDocument();
		expect(screen.getByText('Keeps an eye on things.')).toBeInTheDocument();
	});

	it('draws a checklist from the world the goal card names', () => {
		mount(monitorKind, monitorBrick);
		// The ids are the *world's*, resolved by the bench: the schema says only
		// "an array of strings", and could never have said which strings.
		expect(screen.getByLabelText(/Move/)).not.toBeChecked();
		expect(screen.getByLabelText(/Open/)).toBeChecked();
	});

	it('patches the config when a checklist entry is switched on', async () => {
		const { onupdate } = mount(monitorKind, monitorBrick);
		await fireEvent.click(screen.getByLabelText(/Move/));
		expect(onupdate).toHaveBeenCalledWith({
			watchFor: ['starter/playroom/open', 'starter/playroom/move']
		});
	});

	it('gives a bounded number a dial that reads in words', () => {
		mount(monitorKind, monitorBrick);
		// 1.8 is past 'normal', so the top band applies.
		expect(screen.getByText('hair-trigger')).toBeInTheDocument();
	});

	it('gives a boolean a switch, and patches it', async () => {
		const { onupdate } = mount(monitorKind, monitorBrick);
		await fireEvent.click(screen.getByLabelText(/Say something when it trips/));
		expect(onupdate).toHaveBeenCalledWith({ chatty: true });
	});

	it('shows the real-terminology side, from the kind rather than a lookup table', async () => {
		mount(monitorKind, monitorBrick);
		await fireEvent.click(screen.getByTestId('flip-brick-panel'));
		expect(screen.getByTestId('brick-flip-side')).toHaveTextContent('Runtime Monitor');
		expect(screen.getByTestId('brick-flip-side')).toHaveTextContent('raises alerts');
	});

	it('can be taken off like any other brick', async () => {
		const { onremove } = mount(monitorKind, monitorBrick);
		await fireEvent.click(screen.getByTestId('remove-brick'));
		expect(onremove).toHaveBeenCalled();
	});
});

describe('a kind with a hand-written panel', () => {
	/**
	 * The override table is keyed by kind id, so this proves the *dispatch* — a
	 * kind whose id is in the table gets that component instead of the inferred
	 * one. `starter/safety` is used only as a key here; the panel it selects is
	 * covered end-to-end by `safety-brick.spec.ts`.
	 */
	it('gets its override, not the schema-driven fallback', () => {
		// Declared without hints at all, rather than with `controlHints: undefined` —
		// under `exactOptionalPropertyTypes` those are different things, and the
		// case being tested is a kind that declares none.
		const safetyKind = {
			id: 'starter/safety',
			slot: 'safety',
			name: 'Safety',
			description: 'Keeps things sensible.',
			realName: 'Policy Engine',
			realExplanation: 'Evaluates rules before the agent acts.',
			configSchema: z.object({
				maxTicks: z.number(),
				blockedActions: z.array(z.string()),
				approvalMode: z.boolean()
			}),
			configVersion: 1,
			defaults: {}
		} as BrickKindDefinition;

		mount(safetyKind, {
			slot: 'safety',
			kind: 'starter/safety',
			configVersion: 1,
			config: { maxTicks: 12, blockedActions: [], approvalMode: false }
		});

		// The hand-written panel's wording, which no schema could have produced.
		expect(screen.getByText('Step budget: 12 turns')).toBeInTheDocument();
		expect(screen.getByText('Ask before acting')).toBeInTheDocument();
	});
});
