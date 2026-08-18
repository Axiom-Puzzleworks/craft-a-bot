<script lang="ts">
	/*
	 * The only link in this component points at the provider's key-management
	 * page, given by the caller. `resolve()` exists to prefix this app's own
	 * routes with its base path and cannot apply to an external URL; the rule
	 * cannot see that through a prop, hence the file-scoped exemption.
	 */
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { BatteryBay } from '$lib/state/battery.svelte.js';

	/**
	 * The battery compartment (03-UI-UX-DESIGN.md §7, 06-LLM-PROVIDERS.md §6).
	 *
	 * The copy is the important part. The key is stored in plaintext in this
	 * browser and the doc is emphatic that we say so plainly rather than implying
	 * a safety we cannot provide — client-side encryption with no user secret
	 * would be theatre. So: where it lives, where it is sent, how to remove it,
	 * and the advice to use a separate spending-capped key.
	 *
	 * **One instance per provider that needs a key** (WP26) — this component
	 * used to import `OPENAI_KEYS_URL` directly, because it was the only
	 * provider there was. `keysUrl` is now a prop, supplied by whichever
	 * `ProviderFactory` the Settings page is rendering a compartment for.
	 */
	interface Props {
		bay: BatteryBay;
		providerId: string;
		providerName: string;
		keysUrl: string;
	}

	let { bay, providerId, providerName, keysUrl }: Props = $props();

	let draft = $state('');
	let busy = $state(false);
	const inputId = $props.id();

	const CHARGE_WORDS = {
		empty: 'No battery',
		unchecked: 'Battery fitted — not checked yet',
		checking: 'Checking…',
		charged: 'Charged',
		flat: 'Flat'
	} as const;

	async function insert(): Promise<void> {
		busy = true;
		try {
			await bay.insert(draft);
			draft = '';
		} finally {
			busy = false;
		}
	}
</script>

<section class="bay" data-testid="battery-compartment-{providerId}">
	<header>
		<h2>{providerName} battery</h2>
		<p class="charge" data-testid="charge-state-{providerId}" data-charge={bay.charge}>
			<span class="cells" aria-hidden="true">
				<span class="cell" class:cell--lit={bay.charge === 'charged'}></span>
				<span class="cell" class:cell--lit={bay.charge === 'charged'}></span>
				<span class="cell" class:cell--lit={bay.charge === 'charged'}></span>
			</span>
			{CHARGE_WORDS[bay.charge]}
		</p>
	</header>

	{#if bay.hasKey}
		<div class="fitted" data-testid="battery-fitted-{providerId}">
			<span class="battery" aria-hidden="true">🔋</span>
			<p>
				A battery is fitted. The key itself is never shown again — eject and paste a new one to
				change it.
			</p>
			<div class="row">
				<button
					type="button"
					data-testid="check-battery-{providerId}"
					disabled={busy}
					onclick={() => bay.check()}
				>
					Check it
				</button>
				<button type="button" data-testid="eject-battery-{providerId}" onclick={() => bay.eject()}>
					Eject battery
				</button>
			</div>
		</div>
	{:else}
		<div class="empty">
			<label for={inputId}>Paste your {providerName} API key</label>
			<div class="row">
				<input
					id={inputId}
					type="password"
					autocomplete="off"
					spellcheck="false"
					placeholder="sk-…"
					data-testid="key-input-{providerId}"
					bind:value={draft}
				/>
				<button
					type="button"
					class="primary"
					data-testid="insert-battery-{providerId}"
					disabled={busy || draft.trim() === ''}
					onclick={insert}
				>
					Insert battery
				</button>
			</div>
		</div>
	{/if}

	{#if bay.message}
		<p class="message" role="status" data-testid="battery-message-{providerId}">{bay.message}</p>
	{/if}

	<div class="smallprint">
		<h3>Where your battery lives</h3>
		<ul>
			<li>
				<strong>In this browser only.</strong> It is saved in this browser's local storage, in plain text.
				Anyone who can use this browser profile could read it — so please don't use a shared computer
				for a key you care about.
			</li>
			<li>
				<strong>It goes to {providerName} and nowhere else.</strong> Craft A Bot has no server. Your
				key is sent straight from this page to the {providerName} API, with your own account footing the
				bill.
			</li>
			<li>
				<strong>It never leaves in anything you share.</strong> Kit files and exported traces are scrubbed
				of it by construction.
			</li>
			<li>
				<strong>Use a spending-capped key.</strong> Make a separate key just for this and give it a
				budget —
				<a href={keysUrl} target="_blank" rel="noreferrer noopener">
					manage your {providerName} keys
				</a>.
			</li>
		</ul>
	</div>
</section>

<style>
	.bay {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-4);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-3);
		flex-wrap: wrap;
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	h3 {
		margin: 0 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.75;
	}

	.charge {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	/* Charge is doubled by the word beside it — never colour alone (03 §8). */
	.cells {
		display: flex;
		gap: 2px;
		padding: 2px;
		border: 2px solid var(--cab-ink);
		border-radius: 3px;
	}

	.cell {
		width: 8px;
		height: 12px;
		background: color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	.cell--lit {
		background: var(--cab-green);
	}

	.fitted,
	.empty {
		display: grid;
		gap: var(--cab-space-2);
	}

	.fitted {
		grid-template-columns: auto 1fr;
		align-items: center;
	}

	.fitted p {
		margin: 0;
		font-size: var(--cab-text-sm);
	}

	.fitted .row {
		grid-column: 2;
	}

	.battery {
		font-size: 28px;
	}

	.row {
		display: flex;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
	}

	label {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	input {
		flex: 1;
		min-width: 200px;
		font: inherit;
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-2);
		background: var(--cab-paper);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 30%, transparent);
		border-radius: 6px;
	}

	button {
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		color: var(--cab-ink);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	button.primary {
		background: var(--cab-blue);
		color: var(--cab-cream);
		border-color: var(--cab-blue);
	}

	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	input:focus-visible,
	button:focus-visible,
	a:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.message {
		margin: 0;
		padding: var(--cab-space-2) var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: var(--cab-paper);
		border-radius: 6px;
	}

	.smallprint ul {
		margin: 0;
		padding-left: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
		line-height: 1.5;
	}

	a {
		color: var(--cab-blue-text);
	}
</style>
