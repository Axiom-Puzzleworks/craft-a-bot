<script lang="ts">
	import Rocker from '$lib/components/kit/Rocker.svelte';
	import PolicyCardChip from '$lib/components/shared/PolicyCardChip.svelte';
	import { toggle, type BrickPanelProps } from './panel-props.js';

	/**
	 * The Safety brick's panel — the "safety control panel" of 08 §3.
	 *
	 * **The other reason per-kind overrides exist.** The repeat-limit slider
	 * appears only when its rocker is on, and that rocker maps on/off onto
	 * `3`/`undefined` — a field whose *visibility* depends on another field, and
	 * a switch standing in for an optional number. `ControlHints` says neither,
	 * by decision rather than oversight (`14-…` §2.1): a `when` predicate is the
	 * obvious widening when an expansion brick actually needs one.
	 */
	let { config, worldActions, policyCards, onupdate }: BrickPanelProps = $props();

	const maxTicks = $derived(Number(config.maxTicks ?? 0));
	const approval = $derived(
		(config.approval as 'off' | 'everything' | 'risky' | undefined) ?? 'off'
	);
	const maxTokens = $derived(config.maxTokens as number | undefined);
	const blockedActions = $derived((config.blockedActions as string[] | undefined) ?? []);
	const repeatLimit = $derived(config.repeatLimit as number | undefined);
	const selectedCards = $derived((config.policyCards as string[] | undefined) ?? []);

	/**
	 * Three in a row is enough to look stuck without tripping ordinary play. The
	 * builder can move it; the point is that they choose, rather than every bot
	 * silently inheriting a rule (08-GOVERNANCE-GUARDRAILS.md §3).
	 */
	const DEFAULT_REPEAT_LIMIT = 3;

	/** A generous run's worth of spending, so switching the rocker on is never a surprise. */
	const DEFAULT_MAX_TOKENS = 4000;

	const APPROVAL_OPTIONS = [
		{ value: 'off', label: 'Never' },
		{ value: 'risky', label: 'Only for risky things' },
		{ value: 'everything', label: 'Before every action' }
	] as const;
</script>

<label class="field">
	<span>Step budget: {maxTicks} turns</span>
	<input
		type="range"
		min="5"
		max="50"
		step="1"
		data-testid="max-ticks"
		value={maxTicks}
		oninput={(event) => onupdate({ maxTicks: Number(event.currentTarget.value) })}
	/>
</label>

<Rocker
	label="Stop it going in circles"
	hint="Blocks the same move repeated over and over. Watch out: a bot walking a long way in a straight line repeats itself too."
	checked={repeatLimit !== undefined}
	onchange={(on) => onupdate({ repeatLimit: on ? DEFAULT_REPEAT_LIMIT : undefined })}
/>

{#if repeatLimit !== undefined}
	<label class="field">
		<span>Allow the same move: {repeatLimit} times in a row</span>
		<input
			type="range"
			min="2"
			max="10"
			step="1"
			data-testid="repeat-limit"
			value={repeatLimit}
			oninput={(event) => onupdate({ repeatLimit: Number(event.currentTarget.value) })}
		/>
	</label>
{/if}

<fieldset class="field">
	<legend>Ask before acting</legend>
	{#each APPROVAL_OPTIONS as option (option.value)}
		<label class="radio">
			<input
				type="radio"
				name="approval"
				data-testid="approval-{option.value}"
				value={option.value}
				checked={approval === option.value}
				onchange={() => onupdate({ approval: option.value })}
			/>
			{option.label}
		</label>
	{/each}
	<p class="switches-label">
		"Only for risky things" pauses for actions that change something in the world in a way that is
		hard to undo — not for looking around or talking.
	</p>
</fieldset>

<Rocker
	label="Spending limit"
	hint="Stops the run once it has used this many tokens, on top of the turn limit above."
	checked={maxTokens !== undefined}
	onchange={(on) => onupdate({ maxTokens: on ? DEFAULT_MAX_TOKENS : undefined })}
/>

{#if maxTokens !== undefined}
	<label class="field">
		<span>Spending limit: {maxTokens} tokens</span>
		<input
			type="range"
			min="500"
			max="20000"
			step="500"
			data-testid="safety-max-tokens"
			value={maxTokens}
			oninput={(event) => onupdate({ maxTokens: Number(event.currentTarget.value) })}
		/>
	</label>
{/if}

<div class="switches">
	<p class="switches-label">Blocked actions</p>
	{#each worldActions as action (action.id)}
		<Rocker
			label={action.name}
			checked={blockedActions.includes(action.id)}
			onchange={(on) => onupdate({ blockedActions: toggle(blockedActions, action.id, on) })}
		/>
	{/each}
</div>

{#if policyCards.length > 0}
	<div class="policy-cards" data-testid="policy-cards">
		<p class="switches-label">Policy cards</p>
		<div class="policy-cards-shelf">
			{#each policyCards as card (card.id)}
				<PolicyCardChip
					title={card.title}
					description={card.description}
					checked={selectedCards.includes(card.id)}
					onchange={(on) => onupdate({ policyCards: toggle(selectedCards, card.id, on) })}
				/>
			{/each}
		</div>
	</div>
{/if}

<style>
	.policy-cards {
		display: grid;
		gap: var(--cab-space-2);
	}

	.policy-cards-shelf {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
	}
</style>
