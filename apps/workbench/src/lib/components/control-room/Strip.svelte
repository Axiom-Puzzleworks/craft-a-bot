<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * **Strip** (WP57, `44-CONTROL-ROOM.md` §4.4): a header strip on graph
	 * paper with an engraved label and whatever readouts, lamps and chips a
	 * screen puts beside it — the Run Lab's header, a campaign's summary.
	 */
	interface Props {
		label: string;
		children: Snippet;
		/** Right-aligned controls. */
		actions?: Snippet | undefined;
		testId?: string | undefined;
	}

	let { label, children, actions, testId }: Props = $props();
</script>

<div class="strip" data-testid={testId}>
	<span class="label">{label}</span>
	{@render children()}
	{#if actions}
		<span class="spacer"></span>
		<div class="actions">{@render actions()}</div>
	{/if}
</div>

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-2) var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background-color: var(--cab-graph);
		background-image:
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px);
		background-size: 16px 16px;
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	.label {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--cab-engrave);
	}

	.spacer {
		flex: 1;
	}

	.actions {
		display: flex;
		gap: var(--cab-space-2);
	}
</style>
