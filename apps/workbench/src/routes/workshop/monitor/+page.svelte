<script lang="ts">
	import type { WorkItem } from '@craftabot/core';
	import { referenceFromItems } from '@craftabot/evals';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Meter from '$lib/components/control-room/Meter.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import Tape, { type TapeSeries } from '$lib/components/control-room/Tape.svelte';
	import JourneyCanvas from '$lib/components/control-room/JourneyCanvas.svelte';
	import { journeyLayout } from '@craftabot/workflow';
	import { createRegistry } from '$lib/packs.js';
	import { monitor } from '$lib/state/monitor-app.svelte.js';
	import type { MonitorDeskSetup } from '$lib/state/monitor.svelte.js';

	/**
	 * **The Monitor** (WP84, `75-THE-MONITOR.md` §5; `64-…` §6.5.3): the
	 * bank's day, live, on the Control Room system. The day runs in the
	 * Worker and streams into the store; every number here is the fold the
	 * campaign report uses (`foldMonitor`, tenet 20), over a rolling window
	 * and bucketed by the simulated hour — the Monitor adds a window and a
	 * clock, nothing else. Play, Pause, Step and Replay act on the fold, not
	 * the Worker: pausing freezes the numbers while the day goes on
	 * underneath; Replay redraws the same picture from the runs kept.
	 *
	 * For simulation only: every clock on this screen is the population's.
	 */
	const registry = createRegistry();
	const workflows = registry.listWorkflows();
	/** The lending desk is the day's first desk when the edition ships it; the first workflow otherwise. */
	const firstWorkflowId =
		workflows.find((workflow) => workflow.id === 'fs-lending/lending')?.id ?? workflows[0]?.id;

	let seed = $state(1);
	let size = $state(2_000);
	let from = $state('2026-06-10');
	let to = $state('2026-06-16');
	let acceleration = $state<'inf' | '600' | '60'>('inf');
	let window = $state(200);
	let desks = $state<Array<MonitorDeskSetup & { on: boolean }>>(
		workflows.map((workflow) => ({
			on: workflow.id === firstWorkflowId,
			id: workflow.id.split('/').pop() ?? workflow.id,
			workflowId: workflow.id,
			kinds: [...(workflow.kinds ?? (['application'] as WorkItem['kind'][]))],
			configuration: Object.keys(workflow.configurations ?? {}).at(-1),
			concurrency: 3
		}))
	);
	const configurationsOf = (workflowId: string): string[] =>
		Object.keys(workflows.find((workflow) => workflow.id === workflowId)?.configurations ?? {});

	const chosen = $derived(desks.filter((desk) => desk.on));
	const setupNote = $derived(
		chosen.length === 0
			? 'Choose at least one desk.'
			: from > to
				? 'The window ends before it starts.'
				: undefined
	);

	function run(): void {
		if (setupNote) return;
		monitor.start({
			seed,
			size,
			from,
			to,
			acceleration: acceleration === 'inf' ? Infinity : Number(acceleration),
			desks: chosen.map((desk) => ({
				id: desk.id,
				workflowId: desk.workflowId,
				kinds: [...desk.kinds],
				configuration: desk.configuration,
				concurrency: desk.concurrency
			})),
			window,
			minimum: 40
		});
	}

	const fold = $derived(monitor.state);
	/**
	 * WP100 (`87-JOURNEY-CANVAS.md` §7): one small unlit canvas per desk of the day,
	 * the queue's waiting count on the intake node, and the heat — each edge's share
	 * of the kept runs that took it, faded in.
	 */
	const journeys = $derived.by(() => {
		const setups = monitor.setup?.desks ?? [];
		return setups.flatMap((desk) => {
			const workflow = workflows.find((entry) => entry.id === desk.workflowId);
			if (!workflow) return [];
			const config = desk.configuration ? workflow.configurations?.[desk.configuration] : undefined;
			const layout = journeyLayout(workflow, config, undefined, { registry });
			const runs = monitor.kept.filter((entry) => entry.desk === desk.id);
			// A plain record, not a Map: the fold is derived once per change, never mutated in place.
			const counts: Record<string, number> = {};
			for (const entry of runs) {
				const path = entry.run.stages.map((stage) => stage.stageId);
				for (let index = 0; index < path.length; index += 1) {
					const to = path[index + 1] ?? 'end';
					const id = `${path[index]}->${to}`;
					counts[id] = (counts[id] ?? 0) + 1;
				}
			}
			const heat = Object.fromEntries(
				layout.edges.map((edge) => [
					edge.id,
					runs.length === 0 ? 0 : (counts[edge.id] ?? 0) / runs.length
				])
			);
			const waiting = fold?.queues.find((queue) => queue.desk === desk.id)?.waiting ?? 0;
			const intake = layout.nodes[0]?.stageId;
			return [{ desk: desk.id, layout, heat, badges: intake ? { [intake]: waiting } : {} }];
		});
	});
	const readouts = $derived(fold?.readouts);
	const buckets = $derived(fold?.buckets ?? []);
	/** The tapes read the buckets that fall in the working hours seen, so a quiet night does not flatten the day. */
	const shown = $derived.by(() => {
		const active = buckets.filter(
			(bucket) => bucket.runs > 0 || Object.keys(bucket.arrivals).length > 0
		);
		if (active.length === 0) return buckets.slice(0, 24);
		const first = active[0]?.index ?? 0;
		const last = active.at(-1)?.index ?? first;
		return buckets.slice(first, last + 1);
	});
	const xLabels = $derived(
		shown.length > 0 ? { first: shown[0]?.label ?? '', last: shown.at(-1)?.label ?? '' } : undefined
	);
	const arrivalTape = $derived<TapeSeries[]>([
		{
			id: 'arrivals',
			label: 'arrivals',
			lane: 'sense',
			points: shown.map((b, i) => ({
				x: i,
				y: Object.values(b.arrivals).reduce((sum, n) => sum + n, 0)
			}))
		},
		{
			id: 'runs',
			label: 'worked',
			lane: 'action',
			points: shown.map((b, i) => ({ x: i, y: b.runs }))
		}
	]);
	const decisionTape = $derived<TapeSeries[]>([
		{
			id: 'approve',
			label: 'approved',
			lane: 'guardrail',
			points: shown.map((b, i) => ({ x: i, y: b.decisions.approve }))
		},
		{
			id: 'decline',
			label: 'declined',
			lane: 'action',
			points: shown.map((b, i) => ({ x: i, y: b.decisions.decline }))
		},
		{
			id: 'refer',
			label: 'referred',
			lane: 'planner',
			points: shown.map((b, i) => ({ x: i, y: b.decisions.refer }))
		}
	]);
	const rateTape = $derived<TapeSeries[]>([
		{
			id: 'approval',
			label: 'approval rate',
			lane: 'guardrail',
			points: shown.flatMap((b, i) =>
				b.approvalRate === undefined ? [] : [{ x: i, y: b.approvalRate }]
			)
		},
		{
			id: 'referral',
			label: 'referral rate',
			lane: 'planner',
			points: shown.flatMap((b, i) =>
				b.referralRate === undefined ? [] : [{ x: i, y: b.referralRate }]
			)
		}
	]);
	const perDecisionTape = $derived<TapeSeries[]>([
		{
			id: 'trips',
			label: 'guardrail trips per decision',
			lane: 'guardrail',
			points: shown.flatMap((b, i) =>
				b.guardrailTripsPerDecision === undefined ? [] : [{ x: i, y: b.guardrailTripsPerDecision }]
			)
		},
		{
			id: 'approvals',
			label: 'approvals per decision',
			lane: 'reflexes',
			points: shown.flatMap((b, i) =>
				b.approvalsPerDecision === undefined ? [] : [{ x: i, y: b.approvalsPerDecision }]
			)
		},
		{
			id: 'escalations',
			label: 'escalations',
			lane: 'action',
			points: shown.map((b, i) => ({ x: i, y: b.escalations }))
		}
	]);
	const costTape = $derived<TapeSeries[]>([
		{
			id: 'tokens',
			label: 'tokens per decision',
			lane: 'think',
			points: shown.flatMap((b, i) =>
				b.tokensPerDecision === undefined ? [] : [{ x: i, y: b.tokensPerDecision }]
			)
		},
		{
			id: 'duration',
			label: 'mean stage ms',
			lane: 'memory',
			points: shown.flatMap((b, i) =>
				b.meanStageDurationMs === undefined ? [] : [{ x: i, y: b.meanStageDurationMs }]
			)
		}
	]);
	const reference = $derived(
		monitor.kept.length > 0 && readouts
			? referenceApproval(monitor.kept.map((entry) => entry.item))
			: undefined
	);
	function referenceApproval(items: WorkItem[]): { y: number; label: string } | undefined {
		const expected = referenceFromItems(items).approvalRate;
		return expected === undefined
			? undefined
			: { y: expected, label: `expected approval ${pct(expected)}` };
	}

	const pct = (rate: number | undefined) =>
		rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
	const band = (interval: readonly [number, number] | undefined) =>
		interval ? `${pct(interval[0])}–${pct(interval[1])}` : '';
	const round = (value: number | undefined, places = 2) =>
		value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(places);
	const clockLabel = $derived(
		monitor.clock
			? monitor.clock.slice(0, 16).replace('T', ' ')
			: monitor.setup
				? `${monitor.setup.from} 00:00`
				: '—'
	);
	const stageIds = $derived(Object.keys(readouts?.meanStageDurationMs ?? {}));
	const statusLamp = $derived(
		monitor.status === 'running'
			? ('live' as const)
			: monitor.status === 'failed'
				? ('fail' as const)
				: monitor.status === 'done'
					? ('pass' as const)
					: ('inconclusive' as const)
	);
	const READING_LAMP = { stable: 'pass', watch: 'inconclusive', act: 'fail' } as const;
</script>

<svelte:head><title>Monitor — Workshop</title></svelte:head>

<main data-testid="monitor-page">
	<h1>Monitor</h1>
	<p class="status">
		The bank's day, live, in the Worker — every number the fold the campaign report uses, over the
		last {monitor.setup?.window ?? window} runs and by the simulated hour.
		<strong>For simulation only.</strong>
	</p>

	<section class="setup" aria-labelledby="setup-h" data-testid="monitor-setup">
		<h2 id="setup-h">The day</h2>
		<div class="row">
			<label class="field"
				><span>From</span><input type="date" bind:value={from} data-testid="monitor-from" /></label
			>
			<label class="field"
				><span>To</span><input type="date" bind:value={to} data-testid="monitor-to" /></label
			>
			<label class="field"
				><span>Population seed</span><input
					type="number"
					min="0"
					bind:value={seed}
					data-testid="monitor-seed"
				/></label
			>
			<label class="field"
				><span>Customers</span><input
					type="number"
					min="100"
					step="100"
					bind:value={size}
					data-testid="monitor-size"
				/></label
			>
			<label class="field"
				><span>Acceleration</span>
				<select bind:value={acceleration} data-testid="monitor-acceleration">
					<option value="inf">∞ (as fast as it can)</option>
					<option value="600">600× (a day in ~2½ minutes)</option>
					<option value="60">60× (a day in 24 minutes)</option>
				</select></label
			>
			<label class="field"
				><span>Window (runs)</span><input
					type="number"
					min="10"
					step="10"
					bind:value={window}
					data-testid="monitor-window"
				/></label
			>
		</div>
		<table class="desks" data-testid="monitor-desks">
			<thead>
				<tr
					><th scope="col">Desk</th><th scope="col">Workflow</th><th scope="col">Takes</th><th
						scope="col">Configuration</th
					><th scope="col">Lanes</th></tr
				>
			</thead>
			<tbody>
				{#each desks as desk (desk.workflowId)}
					<tr data-testid="monitor-desk-{desk.id}">
						<td
							><label
								><input
									type="checkbox"
									bind:checked={desk.on}
									data-testid="monitor-desk-on-{desk.id}"
								/>
								{desk.id}</label
							></td
						>
						<td class="mono">{desk.workflowId}</td>
						<td>{desk.kinds.join(', ')}</td>
						<td>
							<select
								bind:value={desk.configuration}
								data-testid="monitor-desk-configuration-{desk.id}"
								aria-label="{desk.id} configuration"
							>
								{#each configurationsOf(desk.workflowId) as id (id)}
									<option value={id}>{id}</option>
								{/each}
							</select>
						</td>
						<td
							><input
								type="number"
								min="1"
								max="8"
								bind:value={desk.concurrency}
								data-testid="monitor-desk-concurrency-{desk.id}"
								aria-label="{desk.id} lanes"
							/></td
						>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="row">
			<button
				type="button"
				onclick={run}
				disabled={setupNote !== undefined}
				data-testid="monitor-run">Run the day</button
			>
			{#if monitor.status === 'running'}
				<button type="button" onclick={() => monitor.cancel()} data-testid="monitor-cancel"
					>Cancel</button
				>
			{/if}
			{#if setupNote}<span class="note" data-testid="monitor-setup-note">{setupNote}</span>{/if}
			{#if monitor.error}<span class="note fail" data-testid="monitor-error">{monitor.error}</span
				>{/if}
		</div>
	</section>

	<Strip label="The clock" icon="clock" testId="monitor-strip">
		<Readout label="simulated time" value={clockLabel} testId="monitor-clock" />
		<Readout
			label="acceleration"
			value={monitor.setup
				? Number.isFinite(monitor.setup.acceleration)
					? `${monitor.setup.acceleration}×`
					: '∞'
				: '—'}
			testId="monitor-acceleration-readout"
		/>
		<Readout
			label="population"
			value={monitor.bank?.populationDigest
				? monitor.bank.populationDigest.slice(0, 12)
				: monitor.setup
					? `seed ${monitor.setup.seed} · ${monitor.setup.size}`
					: '—'}
			unit={monitor.bank?.populationDigest ? 'digest' : undefined}
			testId="monitor-population"
		/>
		<Readout
			label="desks"
			value={monitor.setup
				? monitor.setup.desks.map((desk) => `${desk.id} ×${desk.concurrency}`).join(', ')
				: '—'}
			testId="monitor-desks-readout"
		/>
		<Readout
			label="folded"
			value={`${monitor.folded} / ${monitor.kept.length}`}
			unit="runs"
			testId="monitor-folded"
		/>
		<Lamp
			status={statusLamp}
			label={monitor.status === 'idle'
				? 'no day yet'
				: monitor.replaying
					? 'replaying'
					: monitor.mode === 'pause'
						? `${monitor.status}, paused`
						: monitor.status}
			testId="monitor-status"
		/>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => monitor.play()}
				disabled={monitor.status === 'idle' || (monitor.mode === 'play' && !monitor.replaying)}
				data-testid="monitor-play"
				aria-pressed={monitor.mode === 'play'}>Play</button
			>
			<button
				type="button"
				onclick={() => monitor.pause()}
				disabled={monitor.status === 'idle' || monitor.mode === 'pause'}
				data-testid="monitor-pause"
				aria-pressed={monitor.mode === 'pause'}>Pause</button
			>
			<button
				type="button"
				onclick={() => monitor.step()}
				disabled={monitor.status === 'idle' || monitor.folded >= monitor.kept.length}
				data-testid="monitor-step">Step</button
			>
			<button
				type="button"
				onclick={() => monitor.replay()}
				disabled={monitor.kept.length === 0}
				data-testid="monitor-replay">Replay</button
			>
		{/snippet}
	</Strip>

	{#if !readouts}
		<p class="status" data-testid="monitor-empty">
			No day yet. Choose the day, the population and the desks, then run it — the numbers fold as
			each item is worked.
		</p>
	{:else}
		<Strip label="Readouts" icon="meter" testId="monitor-readouts">
			<Readout
				label="arrivals"
				value={Object.values(readouts.arrivals).reduce((s, n) => s + n, 0)}
				unit={Object.entries(readouts.arrivals)
					.map(([k, n]) => `${n} ${k}`)
					.join(', ')}
				testId="readout-arrivals"
			/>
			<Readout label="runs in window" value={readouts.runs} testId="readout-runs" />
			<Readout
				label="decided"
				value={readouts.decided}
				unit={`${readouts.decisions.approve} approve · ${readouts.decisions.decline} decline · ${readouts.decisions.refer} refer`}
				testId="readout-decided"
			/>
			<Readout
				label="approval rate"
				value={pct(readouts.approvalRate.value)}
				unit={band(readouts.approvalRate.interval)}
				testId="readout-approval"
			/>
			<Readout
				label="referral rate"
				value={pct(readouts.referralRate.value)}
				unit={band(readouts.referralRate.interval)}
				testId="readout-referral"
			/>
			<Readout label="escalations" value={readouts.escalations} testId="readout-escalations" />
			<Readout
				label="guardrail trips / decision"
				value={round(readouts.guardrailTripsPerDecision)}
				unit={`${readouts.guardrailTrips} trips`}
				testId="readout-trips"
			/>
			<Readout
				label="approvals / decision"
				value={round(readouts.approvalsPerDecision)}
				unit={`${readouts.approvals} approvals`}
				testId="readout-approvals"
			/>
			<Readout
				label="tokens / decision"
				value={round(readouts.tokensPerDecision, 0)}
				unit={`${readouts.tokens} tokens`}
				testId="readout-tokens"
			/>
			<Readout label="incidents open" value={readouts.incidentsOpen} testId="readout-incidents" />
			<Readout
				label="touches / case"
				value={round(readouts.touchesPerCase.value)}
				unit={readouts.touchesPerCase.underpowered
					? 'underpowered'
					: band(readouts.touchesPerCase.interval)}
				testId="readout-touches"
			/>
			<Readout
				label="unattended"
				value={pct(readouts.unattendedRate.value)}
				testId="readout-unattended"
			/>
			<Readout
				label="ceiling breaches"
				value={readouts.breaches}
				unit={`of ${readouts.ceilingDecisions} decisions`}
				testId="readout-breaches"
			/>
		</Strip>

		{#if stageIds.length > 0}
			<section aria-labelledby="stages-h">
				<h2 id="stages-h">Mean stage duration</h2>
				<table data-testid="monitor-stages">
					<thead><tr><th scope="col">Stage</th><th scope="col">Mean ms (simulated)</th></tr></thead>
					<tbody>
						{#each stageIds as stageId (stageId)}
							<tr
								><td class="mono">{stageId}</td><td
									>{round(readouts.meanStageDurationMs[stageId], 0)}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		<section aria-labelledby="tapes-h" data-testid="monitor-tapes">
			<h2 id="tapes-h">The day, by the hour</h2>
			<div class="tapes">
				<Tape series={arrivalTape} {xLabels} testId="tape-arrivals" />
				<Tape series={decisionTape} {xLabels} testId="tape-decisions" />
				<Tape
					series={rateTape}
					{xLabels}
					range={{ min: 0, max: 1 }}
					{reference}
					testId="tape-rates"
				/>
				<Tape series={perDecisionTape} {xLabels} testId="tape-per-decision" />
				<Tape series={costTape} {xLabels} testId="tape-cost" />
			</div>
		</section>

		<section
			aria-labelledby="fairness-h"
			class:underpowered={!fold?.windowFull}
			data-testid="monitor-fairness"
		>
			<h2 id="fairness-h">
				Fairness now
				{#if !fold?.windowFull}<span class="muted" data-testid="monitor-fairness-underpowered"
						>— underpowered until the window holds 40 runs</span
					>{/if}
			</h2>
			<div class="meters">
				{#each fold?.fairness ?? [] as row (row.metric)}
					<div class="meter" class:greyed={row.underpowered} data-testid="fairness-{row.metric}">
						{#if row.value !== undefined}
							<Meter
								value={row.value}
								range={row.interval}
								label={`${row.metric} across ${row.across}`}
								min={row.metric === 'disparate-impact' ? 0 : -1}
								max={1}
								format={(v) => v.toFixed(3)}
								testId="fairness-meter-{row.metric}"
							/>
							<span class="muted"
								>n = {row.n}{row.underpowered ? ', underpowered' : ''} · {row.groups.join(
									' / '
								)}</span
							>
						{:else}
							<span class="muted">{row.metric}: {row.reason ?? 'no reading'}</span>
						{/if}
					</div>
				{/each}
			</div>
		</section>

		<section aria-labelledby="drift-h">
			<h2 id="drift-h">Drift now</h2>
			<table data-testid="monitor-drift">
				<thead
					><tr
						><th scope="col">Feature</th><th scope="col">PSI</th><th scope="col">Reading</th><th
							scope="col">Against</th
						></tr
					></thead
				>
				<tbody>
					{#each fold?.drift ?? [] as row (row.feature)}
						<tr data-testid="drift-{row.feature}">
							<td class="mono">{row.feature}</td>
							<td>{row.psi ? row.psi.value.toFixed(3) : '—'}</td>
							<td
								>{#if row.psi}<Lamp
										status={READING_LAMP[row.psi.reading]}
										label={row.flagged ? `${row.psi.reading} — flagged` : row.psi.reading}
									/>{:else}<span class="muted">{row.reason}</span>{/if}</td
							>
							<td
								>{row.psi
									? `the population's expected verdicts (n = ${row.psi.n.reference})`
									: ''}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		{#if journeys.length > 0}
			<section aria-labelledby="journeys-h" data-testid="monitor-journeys">
				<h2 id="journeys-h">The journeys</h2>
				<p class="status">
					Each desk's journey with the queue on its first stage and the edges the day is taking,
					darker the more of the last {monitor.setup?.window ?? window} runs took them.
				</p>
				<div class="journeys">
					{#each journeys as journey (journey.desk)}
						<div class="journey-tile">
							<h3>{journey.desk}</h3>
							<JourneyCanvas
								layout={journey.layout}
								heat={journey.heat}
								badges={journey.badges}
								size="small"
								testId="monitor-journey-{journey.desk}"
							/>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section aria-labelledby="queues-h">
			<h2 id="queues-h">Queues</h2>
			<table data-testid="monitor-queues">
				<thead
					><tr
						><th scope="col">Desk</th><th scope="col">Arrived</th><th scope="col">Waiting</th><th
							scope="col">In progress</th
						><th scope="col">Done</th><th scope="col">Oldest waiting</th></tr
					></thead
				>
				<tbody>
					{#each fold?.queues ?? [] as queue (queue.desk)}
						<tr data-testid="queue-{queue.desk}">
							<td>{queue.desk}</td>
							<td>{queue.arrived}</td>
							<td>{queue.waiting}</td>
							<td>{queue.inProgress}</td>
							<td>{queue.done}</td>
							<td
								>{queue.oldestWaitingMinutes === undefined
									? '—'
									: `${queue.oldestWaitingMinutes} min`}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		<section aria-labelledby="incidents-h">
			<h2 id="incidents-h">Incidents</h2>
			{#if (fold?.incidents.length ?? 0) === 0}
				<p class="status" data-testid="monitor-no-incidents">No incident in the day so far.</p>
			{:else}
				<table data-testid="monitor-incidents">
					<thead
						><tr
							><th scope="col">Item</th><th scope="col">Desk</th><th scope="col">Stage</th><th
								scope="col">What</th
							><th scope="col">Workflow run</th></tr
						></thead
					>
					<tbody>
						{#each fold?.incidents ?? [] as incident (`${incident.workflowRunId}:${incident.runId ?? ''}`)}
							<tr data-testid="incident-{incident.itemId}">
								<td class="mono">{incident.itemId}</td>
								<td>{incident.desk}</td>
								<td class="mono"
									>{incident.stageId ?? '—'}{incident.status ? ` (${incident.status})` : ''}</td
								>
								<td>
									{#if incident.finding}{incident.finding}{/if}
									{#each incident.findings as finding, index (index)}
										<span class="finding"
											>{finding.kind} at tick {finding.tick}: {finding.summary}</span
										>
									{/each}
								</td>
								<td class="mono">{incident.workflowRunId}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</main>

<style>
	.journeys {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--cab-space-3);
	}
	.journey-tile h3 {
		margin: 0 0 var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}
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

	.status,
	.note,
	.muted {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.note.fail {
		color: var(--cab-fail);
	}

	.setup {
		display: grid;
		gap: var(--cab-space-3);
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		align-items: end;
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.field input,
	.field select {
		min-width: 8rem;
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
		vertical-align: top;
	}

	.mono {
		font-family: var(--cab-font-mono);
	}

	.tapes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: var(--cab-space-3);
	}

	.meters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: var(--cab-space-3);
	}

	.meter {
		display: grid;
		gap: var(--cab-space-1);
	}

	.underpowered .meter.greyed {
		opacity: 0.55;
		filter: grayscale(1);
	}

	.finding {
		display: block;
	}
</style>
