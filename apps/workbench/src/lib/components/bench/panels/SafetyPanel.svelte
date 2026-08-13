<script lang="ts">
	import Rocker from '$lib/components/kit/Rocker.svelte';
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
	let { config, worldActions, onupdate }: BrickPanelProps = $props();

	const maxTicks = $derived(Number(config.maxTicks ?? 0));
	const approvalMode = $derived(config.approvalMode === true);
	const blockedActions = $derived((config.blockedActions as string[] | undefined) ?? []);
	const repeatLimit = $derived(config.repeatLimit as number | undefined);

	/**
	 * Three in a row is enough to look stuck without tripping ordinary play. The
	 * builder can move it; the point is that they choose, rather than every bot
	 * silently inheriting a rule (08-GOVERNANCE-GUARDRAILS.md §3).
	 */
	const DEFAULT_REPEAT_LIMIT = 3;
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

<Rocker
	label="Ask before acting"
	hint="Pauses for your approval before every action."
	checked={approvalMode}
	onchange={(value) => onupdate({ approvalMode: value })}
/>

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
