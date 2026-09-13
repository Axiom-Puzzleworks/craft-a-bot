<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { journeyLayout } from '@craftabot/workflow';
	import JourneyCanvas from '$lib/components/control-room/JourneyCanvas.svelte';
	import JourneyList from '$lib/components/control-room/JourneyList.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { glossTags } from '$lib/workshop/tag-gloss.js';

	/**
	 * **One journey, drawn** (WP100 stage C, `87-JOURNEY-CANVAS.md` §7): the
	 * rest parameter carries the pack-qualified id (`fs-lending/lending`);
	 * canvas unlit with a configuration selector — the lanes change as the
	 * executors change — its points and its obligations listed, the twin
	 * beside it. The page a reader opens to understand a journey before
	 * running it.
	 */
	const registry = createRegistry();
	const workflowId = $derived(page.params['workflowId'] ?? '');
	const spec = $derived(registry.getWorkflow(workflowId));
	const configurationIds = $derived(Object.keys(spec?.configurations ?? {}));
	let configuration = $state('');
	let selected = $state<string | undefined>(undefined);
	const config = $derived(configuration === '' ? undefined : spec?.configurations?.[configuration]);
	const layout = $derived(spec ? journeyLayout(spec, config, undefined, { registry }) : undefined);
	const obligations = $derived([
		...new Set((layout?.nodes ?? []).flatMap((node) => node.obligations))
	]);
	const selectedNode = $derived(layout?.nodes.find((node) => node.stageId === selected));
	const pointsOfSelected = $derived(
		(layout?.points ?? []).filter((point) => point.at === selected)
	);
</script>

<svelte:head><title>{spec?.name ?? 'Journey'} — Workshop</title></svelte:head>

<main data-testid="journey-page">
	<p class="crumb"><a href={resolve('/workshop/playground/journeys')}>← The journeys</a></p>
	{#if !spec || !layout}
		<h1>Journey</h1>
		<p class="status" data-testid="journey-missing">
			No journey with id {workflowId} is installed.
		</p>
	{:else}
		<h1>{spec.name}</h1>
		<p class="lede">{spec.purpose}</p>
		<p class="simulation" data-testid="journey-simulation-only">FOR SIMULATION ONLY</p>
		<Strip label={spec.name} icon="journey" testId="journey-strip">
			<Readout label="stages" value={layout.nodes.length} testId="journey-stages" />
			<Readout label="lanes" value={layout.lanes.length} testId="journey-lanes" />
			<Readout label="guard points" value={layout.points.length} testId="journey-points" />
			{#snippet actions()}
				<label class="pick">
					<span>Configuration</span>
					<select bind:value={configuration} data-testid="journey-configuration">
						<option value="">the journey as written</option>
						{#each configurationIds as id (id)}
							<option value={id}>{id}</option>
						{/each}
					</select>
				</label>
			{/snippet}
		</Strip>

		<section aria-label="The journey, drawn">
			<JourneyCanvas
				{layout}
				{selected}
				onSelect={(stageId) => (selected = stageId)}
				testId="journey-canvas"
				describedBy="journey-list"
			/>
			<p class="keys">
				Arrow keys walk the stages along their edges, <kbd>Home</kbd>/<kbd>End</kbd> jump,
				<kbd>Enter</kbd> selects, <kbd>g</kbd> moves to a stage’s guard points and
				<kbd>Esc</kbd> returns.
			</p>
		</section>

		{#if selectedNode}
			<section class="selected" aria-label="The selected stage" data-testid="journey-selected">
				<h2>{selectedNode.name}</h2>
				<dl>
					<dt>Lane</dt>
					<dd>{selectedNode.lane}</dd>
					<dt>Executor</dt>
					<dd>{selectedNode.executor}</dd>
					<dt>Obligations</dt>
					<dd>
						{selectedNode.obligations.length === 0 ? '—' : glossTags(selectedNode.obligations)}
					</dd>
					<dt>Guard points</dt>
					<dd>
						{#if pointsOfSelected.length === 0}—{:else}
							<ul>
								{#each pointsOfSelected as point (point.id)}
									<li data-testid="journey-point-{point.id}">
										<code>{point.kind}</code>
										— {point.components.length === 0
											? 'nothing fitted'
											: point.components.join(', ')}
									</li>
								{/each}
							</ul>
						{/if}
					</dd>
				</dl>
			</section>
		{/if}

		<section aria-label="The journey, listed" id="journey-list">
			<h2>The list</h2>
			<JourneyList
				{layout}
				{selected}
				onSelect={(stageId) => (selected = stageId)}
				testId="journey-list"
			/>
		</section>

		<section aria-label="Obligations">
			<h2>Obligations on this journey</h2>
			{#if obligations.length === 0}
				<p class="status">None declared.</p>
			{:else}
				<ul data-testid="journey-obligations">
					{#each obligations as tag (tag)}
						<li><code>{tag}</code> — {glossTags([tag])}</li>
					{/each}
				</ul>
			{/if}
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
	h1,
	h2 {
		margin: 0 0 var(--cab-space-2);
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
	.pick {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}
	.keys {
		margin: var(--cab-space-2) 0 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
	.selected dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--cab-space-1) var(--cab-space-3);
		margin: 0;
	}
	.selected dt {
		font-weight: 700;
	}
	.selected dd,
	.selected ul {
		margin: 0;
	}
	.status {
		color: var(--cab-ink-muted);
	}
</style>
