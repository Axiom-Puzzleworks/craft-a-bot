<script lang="ts">
	import type { GeapCredentialBay } from '$lib/state/geap-credential.svelte.js';
	import { testTheGuard } from '$lib/state/geap-credential.svelte.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';

	/**
	 * The Armour Brick's own battery compartment (`25-ARMOUR-BRICK.md` §4.6,
	 * WP35 stage E) — `BatteryCompartment.svelte`'s own shape, adapted for a
	 * credential that is minted through a real Google sign-in rather than
	 * typed in, and that expires. Rendered only while the Workshop door is
	 * open (the caller's own job, matching `PartsTray.svelte`'s `audience`
	 * gate — stage C).
	 */
	interface Props {
		bay: GeapCredentialBay;
	}

	let { bay }: Props = $props();

	let testing = $state(false);
	let testResult = $state<{ ok: boolean; message: string } | undefined>(undefined);
	let testProjectId = $state('');
	let testLocation = $state('europe-west2');
	let testTemplateId = $state('');

	const STATUS_WORDS = {
		empty: 'No battery',
		'signing-in': 'Signing in…',
		live: 'Charged',
		expired: 'Expired'
	} as const;

	function remainingLabel(): string | undefined {
		const seconds = bay.secondsRemaining;
		if (seconds === undefined) return undefined;
		if (seconds <= 0) return 'expired';
		const minutes = Math.round(seconds / 60);
		return minutes <= 1 ? 'under a minute left' : `${minutes} min left`;
	}

	async function runTest(): Promise<void> {
		testing = true;
		testResult = undefined;
		try {
			// Read fresh at call time, the same discipline every provider's own
			// key read follows (`brain.ts`) — `bay` carries no getter for the
			// token itself, on purpose (hard rule 2).
			const token = createBrowserKeyVault().get('geap') ?? '';
			testResult = await testTheGuard(token, testProjectId, testLocation, testTemplateId);
		} finally {
			testing = false;
		}
	}
</script>

<section class="bay" data-testid="battery-compartment-geap">
	<header>
		<h2>Cloud Armour battery</h2>
		<p class="charge" data-testid="charge-state-geap" data-status={bay.status}>
			<span class="cells" aria-hidden="true">
				<span class="cell" class:cell--lit={bay.status === 'live'}></span>
				<span class="cell" class:cell--lit={bay.status === 'live'}></span>
				<span class="cell" class:cell--lit={bay.status === 'live'}></span>
			</span>
			{STATUS_WORDS[bay.status]}
			{#if bay.status === 'live' && remainingLabel()}
				<span class="ttl">— {remainingLabel()}</span>
			{/if}
		</p>
	</header>

	{#if bay.hasToken}
		<div class="fitted" data-testid="battery-fitted-geap">
			<span class="battery" aria-hidden="true">🔋</span>
			<p>
				A token is fitted. It is never shown again — eject and sign in again to replace it, or once
				its own hour runs out.
			</p>
			<div class="row">
				<button type="button" data-testid="eject-battery-geap" onclick={() => bay.eject()}>
					Eject battery
				</button>
			</div>
		</div>

		<div class="test-guard">
			<h3>Test the guard</h3>
			<p class="hint">
				Sends a known sneaky-instruction phrase to a real Model Armor template and expects it to be
				caught.
			</p>
			<div class="row">
				<label class="field">
					<span>Project</span>
					<input type="text" bind:value={testProjectId} data-testid="test-guard-project" />
				</label>
				<label class="field">
					<span>Region</span>
					<input type="text" bind:value={testLocation} data-testid="test-guard-location" />
				</label>
				<label class="field">
					<span>Template</span>
					<input type="text" bind:value={testTemplateId} data-testid="test-guard-template" />
				</label>
				<button
					type="button"
					class="primary"
					disabled={testing || testProjectId.trim() === '' || testTemplateId.trim() === ''}
					data-testid="run-test-guard"
					onclick={runTest}
				>
					{testing ? 'Testing…' : 'Test the guard'}
				</button>
			</div>
			{#if testResult}
				<p
					class="message"
					class:message--bad={!testResult.ok}
					role="status"
					data-testid="test-guard-result"
				>
					{testResult.message}
				</p>
			{/if}
		</div>
	{:else}
		<div class="empty">
			{#if !bay.clientIdConfigured}
				<p class="hint" data-testid="geap-no-client-id">
					No OAuth Client ID is configured for this build. See <code>docs/geap-setup.md</code> §3 — this
					is a one-time thing the app's own maintainer sets up, not something you configure here.
				</p>
			{/if}
			<button
				type="button"
				class="primary"
				disabled={bay.status === 'signing-in'}
				data-testid="sign-in-geap"
				onclick={() => bay.signIn()}
			>
				{bay.status === 'signing-in' ? 'Signing in…' : 'Sign in with Google'}
			</button>
		</div>
	{/if}

	{#if bay.message}
		<p class="message" role="status" data-testid="battery-message-geap">{bay.message}</p>
	{/if}

	<div class="smallprint">
		<h3>Where this battery lives</h3>
		<ul>
			<li>
				<strong>In this browser only.</strong> A real Google sign-in mints a one-hour access token, stored
				in this browser's local storage in plain text — the same place every other battery lives.
			</li>
			<li>
				<strong>It goes to Google Cloud and nowhere else.</strong> With the Armour Brick's own Unplugged
				switch off, each screen sends what your robot sees, decides or does to Model Armor, at whichever
				project and template the brick is configured for — never anywhere else, and never the token itself.
			</li>
			<li>
				<strong>It never leaves in anything you share.</strong> Kit files and exported traces are scrubbed
				of it by construction.
			</li>
			<li>
				<strong>It expires on its own.</strong> An hour after signing in, it stops working — sign in again
				rather than eject-and-wait.
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

	.ttl {
		font-weight: 400;
		opacity: 0.75;
	}

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
		align-items: flex-end;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	label {
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	input {
		font: inherit;
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
	button:focus-visible {
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

	.message--bad {
		color: var(--cab-red, #a33);
	}

	.test-guard {
		display: grid;
		gap: var(--cab-space-2);
		padding-top: var(--cab-space-2);
		border-top: 1px solid color-mix(in srgb, var(--cab-ink) 20%, transparent);
	}

	.hint {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted, inherit);
	}

	.smallprint ul {
		margin: 0;
		padding-left: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
		line-height: 1.5;
	}
</style>
