<script lang="ts">
	import { focusTrap } from '$lib/a11y/focus-trap.js';
	import type { PendingApproval } from '$lib/state/session.svelte.js';

	/**
	 * The approval interrupt (03-UI-UX-DESIGN.md §7, 08-GOVERNANCE-GUARDRAILS.md
	 * §3): the run is suspended and the proposed action is put to a person as
	 * *"Snackbot wants to `open(toy_chest)` — Allow / Deny"*.
	 *
	 * Deliberately not a modal over the whole screen like the end card. The
	 * player is being asked to judge an action *in context*, so the world stays
	 * visible and the card sits beside it — hiding the Playroom behind a scrim
	 * would be asking someone to approve something they cannot see.
	 *
	 * Denying is not a failure state and is not styled as one: a refusal is fed
	 * back to the bot as information and the run carries on.
	 */

	interface Props {
		approval: PendingApproval;
		botName: string;
		onallow: () => void;
		ondeny: () => void;
	}

	let { approval, botName, onallow, ondeny }: Props = $props();

	/** `open(toy_chest)` — the call as the bot actually proposed it. */
	const signature = $derived.by(() => {
		const args = approval.arguments;
		if (args === null || typeof args !== 'object') return `${approval.name}()`;
		const values = Object.values(args as Record<string, unknown>).map((value) =>
			typeof value === 'string' ? value : JSON.stringify(value)
		);
		return `${approval.name}(${values.join(', ')})`;
	});

	/*
	 * Deny takes the focus, not Allow. The run is stopped waiting for a person,
	 * and the answer you get by pressing Enter without reading should be the one
	 * that cannot do anything (08 §3).
	 */
	let denyButton = $state<HTMLButtonElement | undefined>();
</script>

<div
	class="card"
	data-testid="approval-card"
	role="alertdialog"
	aria-labelledby="approval-title"
	aria-describedby="approval-reason"
	use:focusTrap={{ initial: () => denyButton }}
>
	<span class="badge" aria-hidden="true">✋</span>
	<h2 id="approval-title">
		{botName} wants to <code data-testid="approval-signature">{signature}</code>
	</h2>
	<p id="approval-reason">{approval.reason}</p>

	<div class="actions">
		<button
			type="button"
			class="deny"
			data-testid="approval-deny"
			bind:this={denyButton}
			onclick={ondeny}
		>
			Deny
		</button>
		<button type="button" class="allow" data-testid="approval-allow" onclick={onallow}>
			Allow
		</button>
	</div>
</div>

<style>
	.card {
		display: grid;
		justify-items: center;
		gap: var(--cab-space-2);
		padding: var(--cab-space-4);
		text-align: center;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-sky);
		border-radius: var(--cab-radius-panel);
		box-shadow: var(--cab-lift-shadow);
	}

	.badge {
		font-size: 32px;
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-base);
		color: var(--cab-ink);
	}

	code {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
		padding: 0 var(--cab-space-1);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	p {
		margin: 0;
		font-size: var(--cab-text-sm);
		line-height: 1.5;
		color: var(--cab-ink);
	}

	.actions {
		display: flex;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
		justify-content: center;
	}

	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		padding: var(--cab-space-2) var(--cab-space-4);
		color: var(--cab-ink);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		cursor: pointer;
	}

	.deny {
		background: var(--cab-cream);
	}

	.allow {
		background: var(--cab-green-fill);
		color: var(--cab-cream);
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: 2px;
	}
</style>
