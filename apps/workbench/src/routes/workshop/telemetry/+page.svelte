<script lang="ts">
	import type { EngineEvent, RunRecord } from '@craftabot/core';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import {
		autonomyTelemetry,
		guardrailMix,
		telemetryByCard,
		telemetryByCartridge,
		type AutonomyTelemetry,
		type CartridgeTelemetry,
		type GoalCardTelemetry,
		type GuardrailMixEntry
	} from '$lib/workshop/telemetry.js';

	/**
	 * **Telemetry** (`17-…` §4.6, WP34 stage A): the fleet's numbers, broken
	 * down rather than totalled.
	 *
	 * The Bench Dashboard's own tiles (`fleet.ts`) answer "how is the fleet
	 * doing"; this answers "how is it doing *at what*" — per goal card, per
	 * cartridge, per guardrail, and how often a person was actually in the
	 * loop (`19-…` #36). Same source as every other Workshop screen — the
	 * runs and events the Kit already writes — so this is read-only over
	 * history, never a second measurement.
	 *
	 * No spend tile here either, for the same reason the Bench Dashboard has
	 * none: there is no real pricing model in the repo, and ticks/tokens are
	 * the honest proxy.
	 */

	let runs = $state<RunRecord[]>([]);
	let eventsByRun = $state<Map<string, readonly EngineEvent[]>>(new Map());
	let loaded = $state(false);

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		const stored = await storage.listRuns();
		const pairs = await Promise.all(
			stored.map(
				async (run) => [run.id, (await storage.getEvents(run.id)).map((row) => row.event)] as const
			)
		);
		runs = stored;
		eventsByRun = new Map(pairs);
		loaded = true;
	}

	const byCard = $derived<GoalCardTelemetry[]>(telemetryByCard(runs));
	const byCartridge = $derived<CartridgeTelemetry[]>(telemetryByCartridge(runs));
	const mix = $derived<GuardrailMixEntry[]>(guardrailMix(eventsByRun));
	const autonomy = $derived<AutonomyTelemetry>(autonomyTelemetry(runs, eventsByRun));
	const busiestTrip = $derived(mix[0]?.trips ?? 0);

	const pct = (rate: number | undefined) =>
		rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
	const round = (value: number | undefined) =>
		value === undefined ? '—' : Math.round(value * 10) / 10;
</script>

<svelte:head><title>Telemetry — Workshop</title></svelte:head>

<main data-testid="telemetry-page">
	<h1>Telemetry</h1>

	{#if !loaded}
		<p class="status">Reading the run store…</p>
	{:else if runs.length === 0}
		<p class="status" data-testid="telemetry-empty">
			No runs stored yet. Play a run in the Kit and its numbers will appear here.
		</p>
	{:else}
		<section aria-labelledby="by-card-h">
			<h2 id="by-card-h">By goal card</h2>
			<table data-testid="telemetry-by-card">
				<thead>
					<tr>
						<th scope="col">Card</th>
						<th scope="col">Runs</th>
						<th scope="col">Success</th>
						<th scope="col">Looped</th>
						<th scope="col">Mean ticks</th>
						<th scope="col">Mean tokens</th>
					</tr>
				</thead>
				<tbody>
					{#each byCard as row (row.goalCardId)}
						<tr>
							<td class="mono">{row.goalCardId}</td>
							<td>{row.runs}</td>
							<td>{pct(row.successRate)}</td>
							<td>{pct(row.loopRate)}</td>
							<td>{round(row.meanTicks)}</td>
							<td>{round(row.meanTokens)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section aria-labelledby="by-cartridge-h">
			<h2 id="by-cartridge-h">By cartridge</h2>
			<table data-testid="telemetry-by-cartridge">
				<thead>
					<tr>
						<th scope="col">Provider</th>
						<th scope="col">Model</th>
						<th scope="col">Runs</th>
						<th scope="col">Success</th>
						<th scope="col">Mean ticks</th>
					</tr>
				</thead>
				<tbody>
					{#each byCartridge as row (row.providerId + row.wireModel)}
						<tr>
							<td>{row.providerId}</td>
							<td class="mono">{row.wireModel}</td>
							<td>{row.runs}</td>
							<td>{pct(row.successRate)}</td>
							<td>{round(row.meanTicks)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section aria-labelledby="mix-h">
			<h2 id="mix-h">Guardrail trip mix</h2>
			{#if mix.length === 0}
				<p class="status" data-testid="telemetry-mix-empty">
					No guardrail has tripped in any stored run.
				</p>
			{:else}
				<ul class="mix" data-testid="telemetry-mix">
					{#each mix as entry (entry.guardrailId)}
						<li>
							<span class="mix-label mono">{entry.guardrailId}</span>
							<span class="mix-bar" aria-hidden="true">
								<span
									class="mix-fill"
									style="width: {busiestTrip === 0 ? 0 : (entry.trips / busiestTrip) * 100}%"
								></span>
							</span>
							<span class="mix-count">{entry.trips}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="autonomy-h">
			<h2 id="autonomy-h">Autonomy</h2>
			<dl class="autonomy" data-testid="telemetry-autonomy">
				<div>
					<dt>Approval rate</dt>
					<dd>
						{pct(autonomy.approvalRate)}
						<span class="denominator">
							{#if autonomy.approvalsRequested > 0}
								of {autonomy.approvalsRequested} asked
							{:else}
								nothing has asked yet
							{/if}
						</span>
					</dd>
				</div>
				<div>
					<dt>Interruptions</dt>
					<dd>
						{autonomy.interruptions}
						<span class="denominator">of {autonomy.runs} runs stopped by a person</span>
					</dd>
				</div>
			</dl>
		</section>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-md);
	}

	.status {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		overflow: hidden;
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		font-size: var(--cab-text-sm);
	}

	th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cab-ink-muted);
		border-bottom: 1px solid var(--cab-ink-muted);
	}

	tbody tr + tr td {
		border-top: 1px solid color-mix(in srgb, var(--cab-ink-muted) 30%, transparent);
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.mix {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.mix li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2fr auto;
		align-items: center;
		gap: var(--cab-space-2);
	}

	.mix-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/*
	 * Single-hue sequential for magnitude, oscilloscope green — the token
	 * `17-…` §5 reserves for exactly this ("this number is moving"). The
	 * count sits beside every bar, never colour alone.
	 */
	.mix-bar {
		display: block;
		height: 10px;
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	.mix-fill {
		display: block;
		height: 100%;
		background: var(--cab-scope);
	}

	.mix-count {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.autonomy {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-4);
		margin: 0;
	}

	.autonomy dt {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--cab-ink-muted);
	}

	.autonomy dd {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.denominator {
		font-size: var(--cab-text-xs);
		font-weight: 400;
		color: var(--cab-ink-muted);
	}
</style>
