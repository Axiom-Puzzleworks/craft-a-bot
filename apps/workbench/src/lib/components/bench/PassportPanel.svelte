<script lang="ts">
	import { buildAgentCard, type AgentSpecV2, type PackRegistry } from '@craftabot/core';
	import { SOCKET_LABELS } from '$lib/bricks.js';
	import Panel from '$lib/components/kit/Panel.svelte';

	/**
	 * The Passport (WP33 stage B; `14-…` §5.8, "your robot's passport"): the
	 * whole bot, not one brick — every fitted brick in the toy's own words, and
	 * a flip side to the Agent Card underneath, the same flip `BrickPanel`
	 * already gives one brick at a time (`00-…` §3.3, 03 §1.4).
	 *
	 * Deliberately neutral (`--cab-ink`/`--cab-cream`), not one of the six fixed
	 * slot colours (`04-…` §2.2) — the same call the Robot Friends lever made
	 * (`24-…` §8, WP31 stage E): this panel is not any one brick's concept.
	 */
	interface Props {
		spec: AgentSpecV2;
		registry: PackRegistry;
		onclose: () => void;
	}

	let { spec, registry, onclose }: Props = $props();

	let flipped = $state(false);

	const card = $derived(buildAgentCard(spec, registry));
	const goalTitle = $derived(registry.getGoalCard(card.goalCardId)?.title ?? card.goalCardId);
</script>

<Panel
	title={flipped ? 'Agent Card' : 'Passport'}
	accent="var(--cab-ink)"
	accentInk="var(--cab-cream)"
>
	{#snippet actions()}
		<button
			type="button"
			class="tab"
			data-testid="flip-passport"
			aria-pressed={flipped}
			onclick={() => (flipped = !flipped)}
		>
			{flipped ? 'Toy side' : 'What this really is'}
		</button>
		<button type="button" class="tab" data-testid="close-passport" onclick={() => onclose()}>
			Close
		</button>
	{/snippet}

	{#if flipped}
		<div class="flip" data-testid="passport-flip-side">
			<p>
				The Agent Card: a machine-readable summary of this bot — every fitted brick, and which pack
				it came from — the same "nutrition label" idea real Agent Cards use for AI agents.
			</p>
			<pre class="json" data-testid="passport-json">{JSON.stringify(card, null, 2)}</pre>
		</div>
	{:else}
		<div class="passport" data-testid="passport-controls">
			<p class="goal">On the job: <strong>{goalTitle}</strong></p>
			{#if card.bricks.length === 0}
				<p class="empty">Nothing fitted yet — an empty passport for an empty chassis.</p>
			{:else}
				<ul class="bricks">
					{#each card.bricks as brick (brick.slot)}
						<li>
							<span class="slot">{SOCKET_LABELS[brick.slot]}</span>
							<span class="desc">{brick.description}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.tab {
		padding: 2px var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 600;
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: none;
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.tab:focus-visible {
		outline: 3px solid var(--cab-cream);
		outline-offset: var(--cab-focus-gap);
	}

	.passport,
	.flip {
		display: grid;
		gap: var(--cab-space-3);
	}

	.goal {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.empty {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.8;
	}

	.bricks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--cab-space-2);
	}

	.bricks li {
		display: grid;
		gap: 2px;
		padding: var(--cab-space-2);
		background: color-mix(in srgb, var(--cab-ink) 6%, transparent);
		border-radius: var(--cab-radius-part);
	}

	.slot {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.75;
	}

	.desc {
		font-size: var(--cab-text-sm);
	}

	.flip p {
		margin: 0;
		font-size: var(--cab-text-sm);
		line-height: 1.5;
	}

	.json {
		margin: 0;
		max-height: 320px;
		overflow: auto;
		padding: var(--cab-space-2);
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		background: var(--cab-cream);
		border-radius: var(--cab-radius-part);
	}
</style>
