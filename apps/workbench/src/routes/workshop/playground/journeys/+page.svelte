<script lang="ts">
	import { resolve } from '$app/paths';
	import { journeyLayout } from '@craftabot/workflow';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import { createRegistry } from '$lib/packs.js';

	/**
	 * **The journeys** (WP100 stage C, `87-JOURNEY-CANVAS.md` §7): every
	 * journey the edition's desks run — its world, its stages, its
	 * configurations — each opening as a drawing. Nothing runs here.
	 */
	const registry = createRegistry();
	const journeys = registry
		.listWorkflows()
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((workflow) => {
			const layout = journeyLayout(workflow, undefined, undefined, { registry });
			return {
				id: workflow.id,
				name: workflow.name,
				world: registry.getWorld(workflow.worldId)?.name ?? workflow.worldId,
				stages: layout.nodes.length,
				lanes: layout.lanes.map((lane) => lane.label).join(', '),
				configurations: Object.keys(workflow.configurations ?? {}).length,
				points: layout.points.length
			};
		});
	const columns = [
		{ id: 'name', label: 'Journey', kind: 'text' as const },
		{ id: 'world', label: 'World', kind: 'text' as const },
		{ id: 'stages', label: 'Stages', kind: 'number' as const },
		{ id: 'lanes', label: 'Lanes', kind: 'text' as const },
		{ id: 'configurations', label: 'Configurations', kind: 'number' as const },
		{ id: 'points', label: 'Guard points', kind: 'number' as const }
	];
	const rows = journeys.map((journey) => ({ id: journey.id, cells: { ...journey } }));

	/**
	 * **The coverage matrix** (WP106, `83-…` §6.6.1): from the domain spec the
	 * bank ships — which journeys ship, which support, which are out and why.
	 * The words are the spec's; the page draws them.
	 */
	const domains = registry.listDomains();
	const coverage = domains.flatMap((domain) =>
		domain.journeys.map((journey) => ({
			id: `${domain.id}:${journey.workflowId}`,
			cells: {
				journey: journey.name,
				status: journey.status,
				workflow: journey.status === 'out' ? '—' : journey.workflowId,
				why: journey.why ?? (journey.status === 'shipped' ? 'Ships with the bank.' : '')
			}
		}))
	);
	const coverageColumns = [
		{ id: 'journey', label: 'Journey', kind: 'text' as const },
		{ id: 'status', label: 'Status', kind: 'text' as const },
		{ id: 'workflow', label: 'Workflow', kind: 'text' as const },
		{ id: 'why', label: 'Why', kind: 'text' as const }
	];
	const outCount = coverage.filter((row) => row.cells.status === 'out').length;
</script>

<svelte:head><title>Journeys — Workshop</title></svelte:head>

<main data-testid="journeys-page">
	<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
	<h1>The journeys</h1>
	<p class="lede">
		Every journey the bank’s desks run, drawn as lanes — the customer, the assistant, a colleague,
		the rules, the systems — with a stage on each and the edges a decision can take. Open one to
		read it before running it: which stage is the bot’s under which configuration, where a person
		decides, where a guard sits.
	</p>
	<p class="simulation" data-testid="journeys-simulation-only">FOR SIMULATION ONLY</p>
	<Strip label="Journeys" icon="journey" testId="journeys-strip">
		<Readout label="journeys" value={journeys.length} testId="journeys-count" />
	</Strip>
	<ul class="links" data-testid="journeys-links">
		{#each journeys as journey (journey.id)}
			<li>
				<a
					href={resolve('/workshop/playground/journeys/[...workflowId]', {
						workflowId: journey.id
					})}
					data-testid="journeys-open-{journey.id.replace('/', '-')}">{journey.name}</a
				>
				— {journey.world}, {journey.stages} stages
			</li>
		{/each}
	</ul>
	<CaseTable {columns} {rows} testId="journeys-table" />
	{#if domains.length > 0}
		<section aria-label="Coverage" data-testid="journeys-coverage-section">
			<h2>What the bank covers</h2>
			<p class="lede">
				The domain’s own account of its journeys: those that ship, those that support them, and
				those that are out — with the reason. Drawn from the domain spec, never guessed.
			</p>
			<Strip label="Coverage" icon="journey" testId="journeys-coverage-strip">
				<Readout
					label="shipped"
					value={coverage.filter((row) => row.cells.status === 'shipped').length}
					testId="journeys-coverage-shipped"
				/>
				<Readout label="out" value={outCount} testId="journeys-coverage-out" />
			</Strip>
			<CaseTable columns={coverageColumns} rows={coverage} testId="journeys-coverage" />
		</section>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}
	.crumb {
		margin: 0;
		font-size: var(--cab-text-sm);
	}
	h1 {
		margin: 0;
	}
	.lede {
		max-width: 70ch;
		margin: 0;
		color: var(--cab-ink-muted);
	}
	.simulation {
		display: inline-block;
		justify-self: start;
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		border: 2px solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}
	.links {
		margin: 0;
		padding-left: var(--cab-space-4);
	}
</style>
