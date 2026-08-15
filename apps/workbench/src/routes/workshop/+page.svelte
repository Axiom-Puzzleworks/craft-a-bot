<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AgentRecord, RunRecord } from '@craftabot/core';
	import { SOCKET_LABELS } from '$lib/bricks.js';
	import { safetyTally } from '$lib/safety-tally.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { fleetRows, telemetryFrom, type Telemetry } from '$lib/workshop/fleet.js';

	/**
	 * **The Bench Dashboard** (`17-…` §4.1): the fleet, and what it has been
	 * doing.
	 *
	 * Over the same two stores the Kit writes — no mode-private data (`15-…` §7
	 * rule 1). The Kit's shelf shows a child six boxes; this shows a
	 * practitioner what those six bots have actually done.
	 *
	 * **Tiles are numbers, not charts**, which is §4.1's instruction and also the
	 * right form for a single headline value. §4.1's 30-day sparklines are
	 * deliberately absent: they need thirty days of history, and a trend line
	 * drawn through four runs is a picture of nothing.
	 *
	 * **The spend tile is absent too, and that is the more important omission.**
	 * §4.1 asks for a spend estimate; there is no cost model in the repo, the
	 * only cartridge most runs use is free, and a governance tool that invents a
	 * number is the one thing it must never be. It arrives with real pricing or
	 * not at all.
	 */

	let agents = $state<AgentRecord[]>([]);
	let runs = $state<RunRecord[]>([]);
	let saves = $state<Record<string, number>>({});
	let loaded = $state(false);

	const rows = $derived(fleetRows(agents, runs));
	const stats = $derived<Telemetry>(telemetryFrom({ runs, savesByRun: saves }));

	$effect(() => {
		void load();
	});

	async function load(): Promise<void> {
		const storage = await appStorage();
		agents = await storage.listAgents();
		runs = await storage.listRuns();

		/*
		 * Guardrail saves live in the events, not in the run record, so the tile
		 * costs one read per run. Bounded on purpose: the store caps runs at 50,
		 * so this is fifty small reads and not a scan of everything ever.
		 */
		const tallies: Record<string, number> = {};
		for (const run of runs) {
			const events = await storage.getEvents(run.id);
			tallies[run.id] = safetyTally(events.map((row) => row.event)).saves;
		}
		saves = tallies;
		loaded = true;
	}

	const pct = (value: number | undefined) =>
		value === undefined ? '—' : `${Math.round(value * 100)}%`;
	const round = (value: number | undefined) => (value === undefined ? '—' : value.toFixed(1));
	const when = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : 'never run');
</script>

<svelte:head><title>Workshop — Craft A Bot</title></svelte:head>

<main>
	<h1>Bench</h1>

	<section class="tiles" aria-label="Telemetry">
		<div class="tile">
			<span class="value" data-testid="tile-runs">{stats.runsThisWeek}</span>
			<span class="label">runs this week</span>
		</div>
		<div class="tile">
			<span class="value" data-testid="tile-success">{pct(stats.successRate)}</span>
			<!--
				The denominator is on the tile, and it is the denominator the rate
				actually used — `finishedRuns`, not `runs`. They differ the moment
				anything is still in progress, and showing the larger one would make
				a weak claim look like a strong one.
			-->
			<span class="label">
				success rate<em>
					of {stats.finishedRuns} finished{stats.runs !== stats.finishedRuns
						? ` (${stats.runs} total)`
						: ''}</em
				>
			</span>
		</div>
		<div class="tile">
			<span class="value" data-testid="tile-ticks">{round(stats.meanTicksToSuccess)}</span>
			<span class="label">mean turns to success</span>
		</div>
		<div class="tile">
			<span class="value scope" data-testid="tile-saves">{stats.guardrailSaves}</span>
			<span class="label">guardrail saves</span>
		</div>
	</section>

	<section aria-label="Fleet">
		<div class="head">
			<h2>Fleet</h2>
			<a href={resolve('/workshop/evals')}>Eval Matrix →</a>
		</div>

		{#if !loaded}
			<p class="empty">Reading the stores…</p>
		{:else if rows.length === 0}
			<p class="empty" data-testid="fleet-empty">
				No bots yet. <a href={resolve('/')}>Build one in the Kit</a> and it will appear here.
			</p>
		{:else}
			<table data-testid="fleet">
				<thead>
					<tr>
						<th scope="col">Bot</th>
						<th scope="col">Fitted</th>
						<th scope="col">Runs</th>
						<th scope="col">Last outcome</th>
						<th scope="col">Last run</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.agentId)}
						<tr data-testid="fleet-row-{row.agentId}">
							<td>{row.name}</td>
							<td>
								<!--
									The strip is keyed by socket, and the sockets are named for
									anyone who cannot see the colours — `04-…` §7, never colour
									alone.
								-->
								<span class="strip">
									{#each row.slots as slot (slot)}
										<span class="chip" data-slot={slot} title={SOCKET_LABELS[slot]}></span>
									{/each}
									<span class="visually-hidden">
										{row.slots.length === 0
											? 'nothing fitted'
											: row.slots.map((slot) => SOCKET_LABELS[slot]).join(', ')}
									</span>
								</span>
							</td>
							<td class="num">{row.runs}</td>
							<td>{row.lastOutcome ?? '—'}</td>
							<td class="when">{when(row.lastRunAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<p class="note">
		Spend and 30-day trends are not shown: there is no cost model in the repo and no thirty days of
		history. A dashboard that invented either would be worse than one that says so.
	</p>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
		max-width: 900px;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
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

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-3);
		margin-bottom: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--cab-space-4);
	}

	.tile {
		display: grid;
		gap: 2px;
	}

	.value {
		font-size: var(--cab-text-2xl);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	/* Oscilloscope green, reserved for the number that means "working". */
	.scope {
		color: var(--cab-scope);
	}

	.label {
		display: grid;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.label em {
		font-style: normal;
		text-transform: none;
		letter-spacing: 0;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
		white-space: nowrap;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.when {
		white-space: nowrap;
	}

	.strip {
		display: inline-flex;
		gap: 2px;
	}

	.chip {
		width: 12px;
		height: 12px;
		border-radius: 2px;
		border: 1px solid var(--cab-ink);
	}

	/* The Kit's colours, unchanged — a socket means the same thing in both modes. */
	.chip[data-slot='brain'] {
		background: var(--cab-brick-slot-brain);
	}
	.chip[data-slot='memory'] {
		background: var(--cab-brick-slot-memory);
	}
	.chip[data-slot='equipment'] {
		background: var(--cab-brick-slot-equipment);
	}
	.chip[data-slot='perception'] {
		background: var(--cab-brick-slot-perception);
	}
	.chip[data-slot='mobility'] {
		background: var(--cab-brick-slot-mobility);
	}
	.chip[data-slot='safety'] {
		background: var(--cab-brick-slot-safety);
	}

	.empty,
	.note {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
