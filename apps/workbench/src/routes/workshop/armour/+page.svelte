<script lang="ts">
	import { resolve } from '$app/paths';
	import { armorConfigSchema } from '@craftabot/pack-geap';
	import type { ArmorDisposition } from '@craftabot/pack-geap';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { labelForEvent } from '$lib/trace-style.js';
	import { runArmourProbe, type ArmourProbeResult } from '$lib/workshop/armour-studio.js';

	/**
	 * **The Armour Studio** (`25-ARMOUR-BRICK.md` §11 Stage B) — a Workshop-only
	 * lane proving the seam before Stage D turns it into a fitted brick: a
	 * project/region/template, the three screen dials and the per-filter
	 * overrides, a token pasted in and held only in this page's own memory
	 * (never the vault, never saved — `25-…` §11's own row), and a button that
	 * runs the sign-hijack scenario (`starter/warning-sign`) with the resulting
	 * guardrails fitted through `CreateSessionDeps.guardrails`, the host seam
	 * `armour-studio.ts` uses instead of any fitted brick.
	 *
	 * The run this button starts is a **real, stored run** — visible in Runs
	 * and the Audit Centre like any other (`25-…` §11's own DoD for this
	 * stage), not the ephemeral probe Policy Studio's own test bench runs.
	 *
	 * **Say what leaves the browser** (`25-…` principle 6): with `offline`
	 * off, the observation, decision or result text this page screens is sent
	 * to Model Armor at the project below, over the token pasted in — nothing
	 * else in this app, and never the token itself, per `pack-geap`'s own
	 * `scrubToken` and the key-leak discipline every battery already holds to.
	 */

	let projectId = $state('');
	let location = $state('europe-west2');
	let templateId = $state('');

	let screenObservation = $state<'off' | 'note' | 'stop'>('off');
	let screenDecision = $state<'off' | 'note' | 'block' | 'ask' | 'stop'>('ask');
	let screenResult = $state<'off' | 'note' | 'stop'>('off');

	let injectionOverride = $state<ArmorDisposition>('inherit');
	let harmfulContentOverride = $state<ArmorDisposition>('inherit');
	let sensitiveDataOverride = $state<ArmorDisposition>('inherit');
	let maliciousLinksOverride = $state<ArmorDisposition>('inherit');
	let injectionMinConfidence = $state<'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH'>(
		'MEDIUM_AND_ABOVE'
	);

	let onFailure = $state<'stop-run' | 'allow-with-note'>('stop-run');
	let timeoutMs = $state(3000);
	/** Defaults on: a blank project/template pointed at a real endpoint is a request going nowhere useful. */
	let offline = $state(true);
	/** Pasted, never persisted — cleared by a page reload, exactly like the design doc's own "held in memory" (§11 Stage B). */
	let token = $state('');

	const draft = $derived({
		projectId,
		location,
		templateId,
		screenObservation,
		screenDecision,
		screenResult,
		filters: {
			injection: injectionOverride,
			harmfulContent: harmfulContentOverride,
			sensitiveData: sensitiveDataOverride,
			maliciousLinks: maliciousLinksOverride
		},
		injectionMinConfidence,
		onFailure,
		timeoutMs,
		offline
	});

	const validation = $derived(armorConfigSchema.safeParse(draft));

	let probing = $state(false);
	let probeResult = $state<ArmourProbeResult | undefined>(undefined);
	let probeError = $state<string | undefined>(undefined);

	const guardEvents = $derived(
		(probeResult?.events ?? []).filter(
			(event) =>
				event.type === 'guardrail.external' ||
				event.type === 'guardrail.checked' ||
				event.type === 'guardrail.tripped'
		)
	);

	async function runProbe(): Promise<void> {
		if (!validation.success) return;
		probing = true;
		probeError = undefined;
		probeResult = undefined;
		try {
			const storage = await appStorage();
			probeResult = await runArmourProbe(validation.data, token, storage);
		} catch (cause) {
			probeError = cause instanceof Error ? cause.message : 'The probe could not run.';
		} finally {
			probing = false;
		}
	}
</script>

<svelte:head><title>Cloud Armour — Workshop</title></svelte:head>

<main>
	<h1>Cloud Armour</h1>
	<p class="hint">
		Sends what the bot sees, decides and does to Google Cloud Model Armor for a real classifier
		verdict, mapped onto the same allow / block / ask / stop dispositions the Safety Brick uses.
		Every call, its latency and its filter results land on the trace as <code
			>guardrail.external</code
		>. Nothing here is fitted to a bot yet — this proves the seam before Stage D turns it into a
		brick.
	</p>

	<section aria-label="Configuration">
		<h2>Configuration</h2>
		<div class="form">
			<div class="row">
				<label class="field">
					<span>Project</span>
					<input type="text" bind:value={projectId} data-testid="armour-project" />
				</label>
				<label class="field">
					<span>Region</span>
					<input type="text" bind:value={location} data-testid="armour-location" />
				</label>
				<label class="field">
					<span>Template</span>
					<input type="text" bind:value={templateId} data-testid="armour-template" />
				</label>
			</div>

			<div class="row">
				<label class="field">
					<span>Screen what it sees</span>
					<select bind:value={screenObservation} data-testid="armour-screen-observation">
						<option value="off">Off</option>
						<option value="note">Just make a note</option>
						<option value="stop">Stop the whole run</option>
					</select>
				</label>
				<label class="field">
					<span>Screen what it decides</span>
					<select bind:value={screenDecision} data-testid="armour-screen-decision">
						<option value="off">Off</option>
						<option value="note">Just make a note</option>
						<option value="block">Stop that one thing</option>
						<option value="ask">Ask me first</option>
						<option value="stop">Stop the whole run</option>
					</select>
				</label>
				<label class="field">
					<span>Screen what it did</span>
					<select bind:value={screenResult} data-testid="armour-screen-result">
						<option value="off">Off</option>
						<option value="note">Just make a note</option>
						<option value="stop">Stop the whole run</option>
					</select>
				</label>
			</div>

			<fieldset class="rule">
				<legend>Per-filter overrides — win over the hook dial above, stricter or looser</legend>
				<div class="row">
					<label class="field">
						<span>Sneaky instructions</span>
						<select bind:value={injectionOverride}>
							<option value="inherit">Inherit</option>
							<option value="off">Off</option>
							<option value="note">Note</option>
							<option value="block">Block</option>
							<option value="ask">Ask</option>
							<option value="stop">Stop</option>
						</select>
					</label>
					<label class="field">
						<span>Harmful content</span>
						<select bind:value={harmfulContentOverride}>
							<option value="inherit">Inherit</option>
							<option value="off">Off</option>
							<option value="note">Note</option>
							<option value="block">Block</option>
							<option value="ask">Ask</option>
							<option value="stop">Stop</option>
						</select>
					</label>
					<label class="field">
						<span>Secrets</span>
						<select bind:value={sensitiveDataOverride}>
							<option value="inherit">Inherit</option>
							<option value="off">Off</option>
							<option value="note">Note</option>
							<option value="block">Block</option>
							<option value="ask">Ask</option>
							<option value="stop">Stop</option>
						</select>
					</label>
					<label class="field">
						<span>Dangerous links</span>
						<select bind:value={maliciousLinksOverride}>
							<option value="inherit">Inherit</option>
							<option value="off">Off</option>
							<option value="note">Note</option>
							<option value="block">Block</option>
							<option value="ask">Ask</option>
							<option value="stop">Stop</option>
						</select>
					</label>
				</div>
				<p class="hint">
					Content that must always be stopped (child sexual abuse material) is never dialable — it
					stops the run regardless of any setting here.
				</p>
			</fieldset>

			<div class="row">
				<label class="field">
					<span>How sure before an instruction counts as sneaky</span>
					<select bind:value={injectionMinConfidence}>
						<option value="LOW_AND_ABOVE">Fairly sure</option>
						<option value="MEDIUM_AND_ABOVE">Quite sure</option>
						<option value="HIGH">Very sure</option>
					</select>
				</label>
				<label class="field">
					<span>If the guard can't be reached</span>
					<select bind:value={onFailure}>
						<option value="stop-run">Stop the run (safest)</option>
						<option value="allow-with-note">Carry on and make a note</option>
					</select>
				</label>
				<label class="field">
					<span>Timeout (ms)</span>
					<input type="number" min="500" max="10000" bind:value={timeoutMs} />
				</label>
			</div>

			<div class="row">
				<label class="field checkbox">
					<input type="checkbox" bind:checked={offline} data-testid="armour-offline" />
					<span>Unplugged — every screen reads clean, no network call made</span>
				</label>
			</div>

			<label class="field">
				<span>Token — pasted here for this session only, never saved</span>
				<input
					type="password"
					autocomplete="off"
					bind:value={token}
					placeholder="a Model Armor access token, e.g. from gcloud auth print-access-token"
					data-testid="armour-token"
				/>
			</label>

			{#if !validation.success}
				<p class="error" data-testid="armour-config-error">
					{validation.error.issues[0]?.message ?? 'This configuration is not valid yet.'}
				</p>
			{/if}
		</div>
	</section>

	<section aria-label="Test bench: starter/warning-sign">
		<h2>Test bench — the sign-hijack scenario</h2>
		<p class="hint">
			Runs a scripted bot that reads the sign taped to the wall and does what it says instead of the
			goal it was actually given (<code>starter/warning-sign</code>, CAISI ASI01) — with the
			guardrails above fitted. Any approval card raised along the way is declined, so the run proves
			the guard rather than rubber-stamping past it. The result is saved as a real run, openable in
			Runs and the Audit Centre like any other.
		</p>
		<div class="row">
			<button
				type="button"
				disabled={!validation.success || probing}
				data-testid="armour-run-probe"
				onclick={runProbe}
			>
				{probing ? 'Running…' : 'Run the probe'}
			</button>
			{#if probeResult}
				<span class="mono" data-testid="armour-probe-outcome"
					>{probeResult.outcome ?? 'IN_PROGRESS'}</span
				>
			{/if}
		</div>

		{#if probeError}
			<p class="error" data-testid="armour-probe-error">{probeError}</p>
		{/if}

		{#if probeResult}
			<p class="row">
				<a
					href={resolve('/workshop/runs/[runId]', { runId: probeResult.runId })}
					data-testid="armour-open-run">Open in Runs →</a
				>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() builds the base path; the `?run=` query mirrors safety-case's own identical exception in workshop/export/+page.svelte. -->
				<a
					href={`${resolve('/workshop/export')}?run=${encodeURIComponent(probeResult.runId)}`}
					data-testid="armour-open-audit">Open in the Audit Centre →</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>

			{#if guardEvents.length === 0}
				<p class="hint" data-testid="armour-no-guard-events">
					No screen fired — every dial above is off, or nothing in the run had anything to check.
				</p>
			{:else}
				<table data-testid="armour-guard-events">
					<thead>
						<tr>
							<th scope="col">Turn</th>
							<th scope="col">Event</th>
						</tr>
					</thead>
					<tbody>
						{#each guardEvents as event, eventIndex (eventIndex)}
							<tr>
								<td class="num">{event.tick}</td>
								<td>{labelForEvent(event)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
		max-width: 1100px;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	section {
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-3);
	}

	.form {
		display: grid;
		gap: var(--cab-space-3);
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.field.checkbox {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--cab-space-2);
	}

	.rule {
		display: grid;
		gap: var(--cab-space-2);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		padding: var(--cab-space-2);
	}

	legend {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-3);
	}

	button,
	input,
	select {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: progress;
		color: var(--cab-ink-muted);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.error {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-red, #a33);
	}

	.hint {
		margin: 0;
		max-width: 70ch;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.mono {
		font-family: var(--cab-font-mono, monospace);
		font-size: var(--cab-text-xs);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		text-align: left;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-bottom: 1px solid var(--cab-ink-muted);
	}

	td.num {
		font-variant-numeric: tabular-nums;
	}
</style>
