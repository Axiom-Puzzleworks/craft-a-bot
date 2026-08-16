<script lang="ts">
	/**
	 * **A policy card, as a toy card** (`14-…` §4.6, `18-…` WP22 — "Kit rendering
	 * as collectible cards").
	 *
	 * Shared between the Kit's Safety Brick panel (a picker: fit this card or
	 * don't) and the Workshop's Policy Studio (a live preview of the card being
	 * authored) — the same component, the same card face, in whichever register
	 * the page around it is written in (`15-…` §5). A real `<input
	 * type="checkbox">` carries the toggle so the card stays keyboard- and
	 * screen-reader-operable; it is visually hidden rather than removed, the
	 * same technique `Rocker.svelte` uses.
	 *
	 * Card styling follows `GoalCardRack.svelte`'s `.card` treatment — cream
	 * fill, a 5px top rule in the concept colour, `--cab-radius-part` corners,
	 * a hover lift — with the safety/governance colour (`--cab-brick-safety`)
	 * in place of the Goal Card's green, per `04-…` §2.2's fixed colour↔concept
	 * mapping.
	 */
	interface Props {
		title: string;
		description?: string | undefined;
		checked: boolean;
		/** Omit for a read-only preview (the Studio's live card face) — no input renders. */
		onchange?: ((checked: boolean) => void) | undefined;
	}

	let { title, description, checked, onchange }: Props = $props();
	const inputId = $props.id();
	const descriptionId = `${inputId}-description`;
</script>

{#if onchange}
	<label class="chip" class:chip--checked={checked} for={inputId}>
		<input
			id={inputId}
			type="checkbox"
			{checked}
			aria-describedby={description ? descriptionId : undefined}
			onchange={(event) => onchange?.(event.currentTarget.checked)}
		/>
		<span class="title">{title}</span>
		{#if description}
			<span id={descriptionId} class="description">{description}</span>
		{/if}
	</label>
{:else}
	<div class="chip chip--preview">
		<span class="title">{title}</span>
		{#if description}
			<span class="description">{description}</span>
		{/if}
	</div>
{/if}

<style>
	.chip {
		display: grid;
		gap: var(--cab-space-1);
		width: calc(var(--cab-sub) * 5);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid
			color-mix(in srgb, var(--cab-brick-safety) 60%, transparent);
		border-top: 5px solid var(--cab-brick-safety);
		border-radius: var(--cab-radius-part);
		transition: transform var(--cab-pop-ms) ease-out;
	}

	label.chip {
		cursor: pointer;
	}

	label.chip:hover {
		transform: translateY(-2px);
	}

	.chip--checked {
		box-shadow: 0 0 0 3px var(--cab-yellow);
	}

	.chip:has(input:focus-visible) {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.title {
		font-weight: 600;
		font-size: var(--cab-text-sm);
	}

	.description {
		font-size: var(--cab-text-xs);
		opacity: 0.8;
	}

	@media (prefers-reduced-motion: reduce) {
		label.chip:hover {
			transform: none;
		}
	}
</style>
