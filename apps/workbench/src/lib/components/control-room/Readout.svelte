<script lang="ts">
	/**
	 * **Readout** (WP57, `44-CONTROL-ROOM.md` §4.4): the stat tile become an
	 * instrument — an engraved label on the brushed panel, the value large,
	 * a unit, an optional delta with its own glyph. Every number the
	 * Workshop quotes as a headline goes through one of these.
	 */
	interface Props {
		label: string;
		value: string | number;
		unit?: string | undefined;
		/** A change since some baseline; `good` says which direction is the good one. */
		delta?: { value: string; direction: 'up' | 'down'; good: boolean } | undefined;
		testId?: string | undefined;
	}

	let { label, value, unit, delta, testId }: Props = $props();
</script>

<div class="readout" data-testid={testId}>
	<span class="label">{label}</span>
	<span class="value" data-testid={testId ? `${testId}-value` : undefined}
		>{value}{#if unit}<small>{unit}</small>{/if}</span
	>
	{#if delta}
		<span class="delta" data-good={delta.good} data-testid={testId ? `${testId}-delta` : undefined}>
			<span aria-hidden="true">{delta.direction === 'up' ? '▲' : '▼'}</span>
			<span class="sr-only">{delta.direction}</span>
			{delta.value}
		</span>
	{/if}
</div>

<style>
	.readout {
		display: inline-grid;
		gap: 2px;
		min-width: 7rem;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-metal);
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

	.value {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xl);
		line-height: 1.1;
	}

	.value small {
		margin-left: var(--cab-space-1);
		font-size: var(--cab-text-xs);
		color: var(--cab-engrave);
	}

	.delta {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		color: var(--cab-fail);
	}

	.delta[data-good='true'] {
		color: var(--cab-pass);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
