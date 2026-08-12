<script lang="ts">
	/**
	 * A vintage rocker switch (04 §5).
	 *
	 * The plastic is painted onto the real `<input type=checkbox>` with
	 * `appearance: none` rather than hiding the input behind a decorative span.
	 * A zero-sized hidden input is invisible to assistive tech and to anything
	 * driving the page — the switch has to *be* the control, not sit on top of one.
	 */
	interface Props {
		label: string;
		checked: boolean;
		/** Extra context read out with the label, e.g. a tool's real name. */
		hint?: string | undefined;
		disabled?: boolean;
		onchange: (checked: boolean) => void;
	}

	let { label, checked, hint, disabled = false, onchange }: Props = $props();
	// `$props.id()` may only be called once per component, so derive the second.
	const inputId = $props.id();
	const hintId = `${inputId}-hint`;
</script>

<div class="rocker" class:rocker--disabled={disabled}>
	<input
		id={inputId}
		type="checkbox"
		{checked}
		{disabled}
		aria-describedby={hint ? hintId : undefined}
		onchange={(event) => onchange(event.currentTarget.checked)}
	/>
	<label for={inputId}>{label}</label>
	{#if hint}
		<span id={hintId} class="hint">{hint}</span>
	{/if}
</div>

<style>
	.rocker {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--cab-space-2) var(--cab-space-2);
	}

	input {
		appearance: none;
		-webkit-appearance: none;
		position: relative;
		flex: none;
		margin: 0;
		width: calc(var(--cab-u) * 1.6);
		height: var(--cab-u);
		border-radius: 6px;
		background: color-mix(in srgb, var(--cab-ink) 18%, var(--cab-cream));
		border: var(--cab-border-part) solid var(--cab-ink);
		box-shadow: inset 0 2px 3px var(--cab-shadow);
		cursor: pointer;
	}

	/* The moulded cap that rocks across. */
	input::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 45%;
		height: calc(100% - 2px);
		border-radius: 4px;
		background: var(--cab-cream);
		box-shadow: var(--cab-drop-shadow);
		transition: transform var(--cab-pop-ms) ease-out;
	}

	input:checked {
		background: var(--cab-green);
	}

	input:checked::after {
		transform: translateX(115%);
	}

	input:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	input:disabled {
		cursor: not-allowed;
	}

	label {
		font-size: var(--cab-text-sm);
		cursor: pointer;
	}

	.rocker--disabled label,
	.rocker--disabled input {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.hint {
		grid-column: 2;
		font-size: var(--cab-text-xs);
		opacity: 0.75;
	}

	@media (prefers-reduced-motion: reduce) {
		input::after {
			transition: none;
		}
	}
</style>
