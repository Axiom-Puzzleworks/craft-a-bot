<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		stackSchema,
		type GuardrailComponent,
		type JourneyLayout,
		type PointKind,
		type Stack
	} from '@craftabot/core';
	import {
		verdictFlow,
		verdictFlowSignature,
		type VerdictFlowRow
	} from '@craftabot/governance/reports';
	import { journeyLayout } from '@craftabot/workflow';
	import Connections from '$lib/components/workshop/Connections.svelte';
	import JourneyCanvas from '$lib/components/control-room/JourneyCanvas.svelte';
	import JourneyList from '$lib/components/control-room/JourneyList.svelte';
	import Lamp from '$lib/components/control-room/Lamp.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import { createBrowserKeyVault } from '$lib/state/keys.js';
	import { browserPrincipal } from '$lib/state/principal.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import { runStackTestIn } from '$lib/worker/campaign-client.js';
	import { spawnCampaignWorker } from '$lib/worker/spawn.js';
	import {
		LOOP_POINTS,
		configure,
		connectionLamp,
		emptyStack,
		filterComponents,
		fitAt,
		groupByTechnique,
		renamed,
		stackRecord,
		stackTestCampaign,
		unfit,
		type CatalogueFilter,
		type StudioPoint
	} from '$lib/workshop/studio.js';

	/**
	 * **The Guardrail Studio** (WP101, `88-STUDIO.md`; `83-…` §6.3): where
	 * stacks are built. The catalogue on the left — every component the
	 * installed packs ship, grouped by technique, each with its connection's
	 * lamp; the journey and its points in the centre, the stack under
	 * construction beneath; the test bench on the right, running a scenario
	 * through the stack in the Worker and drawing the verdict flow. The
	 * Guard Rack is the *Connections* tab.
	 */
	const registry = createRegistry();
	const vault = createBrowserKeyVault();
	const components = registry.listGuardrailComponents();
	const workflows = registry
		.listWorkflows()
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	const scenarios = registry
		.listScenarios()
		.slice()
		.sort((a, b) => a.id.localeCompare(b.id));
	const author = browserPrincipal(preferences.displayName);

	let tab = $state<'studio' | 'connections'>(
		page.url.searchParams.get('tab') === 'connections' ? 'connections' : 'studio'
	);
	let stack = $state<Stack>(emptyStack(author, new Date().toISOString()));
	let pinned = $state<Stack | undefined>(undefined);
	let selectedComponent = $state<string | undefined>(undefined);
	let workflowId = $state<string>('');
	let filter = $state<CatalogueFilter>({});
	let note = $state('');
	let saved = $state('');
	/** The bot the Spec Lab came from (`?agent=`), so *Use in… the Spec Lab* can go back to it. */
	const agentFromSpecLab = page.url.searchParams.get('agent') ?? '';

	// A stack named on the URL (the Spec Lab's *Open in the Studio*): the shipped or saved one, copied to edit.
	$effect(() => {
		const asked = page.url.searchParams.get('stack');
		if (!asked) return;
		void (async () => {
			const shipped = registry.getStack(asked);
			if (shipped) {
				stack = structuredClone(shipped);
				return;
			}
			const storage = await appStorage();
			const record = await storage.getContent(asked);
			const parsed = record ? stackSchema.safeParse(record.record) : undefined;
			if (parsed?.success) stack = parsed.data;
		})();
	});

	const grouped = $derived(groupByTechnique(filterComponents(components, filter)));
	const techniques = [...new Set(components.map((component) => component.technique))].sort();
	const lampOf = (component: GuardrailComponent) =>
		connectionLamp(component, registry, (id) => vault.get(id) !== undefined);
	const componentOf = (id: string) => registry.getGuardrailComponent(id);
	/** A card's one-line explanation: the component's own over its defaults, or the technique when its settings are required. */
	const explainDefault = (component: GuardrailComponent): string => {
		const defaults = component.configSchema.safeParse({});
		return defaults.success
			? component.explain(defaults.data)
			: `${component.technique}; settings required`;
	};

	const workflow = $derived(workflowId ? registry.getWorkflow(workflowId) : undefined);
	const layout = $derived<JourneyLayout | undefined>(
		workflow ? journeyLayout(workflow, undefined, undefined, { registry }) : undefined
	);
	/** The loop alone (§3): three points for a Playroom bot. */
	const loopPoints: StudioPoint[] = LOOP_POINTS.map((kind) => ({ kind }));

	function pointFromId(id: string): StudioPoint | undefined {
		if (id === 'group' || id === 'egress') return { kind: id };
		const loop = /^loop:(.+):(pre-think|pre-act|post-act)$/.exec(id);
		if (loop) return { kind: loop[2] as PointKind, at: loop[1] };
		const boundary = /^boundary:(.+):(stage-in|stage-out)$/.exec(id);
		if (boundary) return { kind: boundary[2] as PointKind, at: boundary[1] };
		return undefined;
	}

	/** §3: a component selected and a point chosen — by click, by drop, or by the keyboard — is one `fitAt`. */
	function fitSelectedAt(point: StudioPoint): void {
		const component = selectedComponent ? componentOf(selectedComponent) : undefined;
		if (!component) {
			note = 'Choose a component in the catalogue first.';
			return;
		}
		// The component's own defaults when its schema parses an empty config; the settings editor otherwise.
		const defaults = component.configSchema.safeParse({});
		const result = fitAt(stack, component, point, defaults.success ? defaults.data : undefined);
		if (!result.ok) {
			note = result.reason;
			return;
		}
		stack = result.stack;
		note = `${component.name} fitted at ${point.kind}${point.at ? ` on ${point.at}` : ''}${defaults.success ? '' : ' — open its settings and fill them in'}.`;
	}
	function onPoint(id: string): void {
		const point = pointFromId(id);
		if (!point) return;
		fitSelectedAt(point);
	}
	function onDrop(event: DragEvent, point: StudioPoint): void {
		event.preventDefault();
		const id = event.dataTransfer?.getData('text/component');
		if (id) selectedComponent = id;
		fitSelectedAt(point);
	}
	function onDragStart(event: DragEvent, id: string): void {
		event.dataTransfer?.setData('text/component', id);
		selectedComponent = id;
	}

	const explainOf = (fit: Stack['fit'][number]): string => {
		const component = componentOf(fit.componentId);
		if (!component) return 'an unknown component';
		const parsed = component.configSchema.safeParse(fit.config ?? {});
		return parsed.success
			? component.explain(parsed.data)
			: `settings: ${parsed.error.issues[0]?.message ?? 'do not fit'}`;
	};
	let configText = $state<Record<number, string>>({});
	function applyConfig(index: number): void {
		try {
			stack = configure(stack, index, JSON.parse(configText[index] ?? '{}'));
			note = '';
		} catch (error) {
			note = `settings: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	// ── The bench (§5) ────────────────────────────────────────────────────
	let scenarioId = $state(scenarios[0]?.id ?? '');
	let brain = $state<'scripted-optimal' | 'scripted-noisy'>('scripted-optimal');
	let seed = $state(1);
	/** WP110 (GAP-5): who sits across the desk on the bench — scripted, or a live cartridge (a key in the battery). */
	let counterpart = $state<'scripted' | 'live'>('scripted');
	let running = $state(false);
	let flows = $state<Record<string, VerdictFlowRow[]>>({});
	let benchNote = $state('');

	async function runThrough(): Promise<void> {
		// Plain data for the Worker: a `$state` proxy cannot be structured-cloned.
		const stacks = [
			$state.snapshot(stack),
			...(pinned ? [$state.snapshot(pinned)] : [])
		] as Stack[];
		running = true;
		flows = {};
		benchNote = '';
		try {
			const worker = spawnCampaignWorker();
			const job = runStackTestIn(
				worker,
				stackTestCampaign({ scenarioId, brain, seed, stacks, counterpart }),
				{
					onTrace: (cell, trace) => {
						flows = { ...flows, [cell.guard]: verdictFlow(trace.events) };
					}
				}
			);
			await job.result;
			benchNote = `${Object.keys(flows).length} flow${Object.keys(flows).length === 1 ? '' : 's'} over ${scenarioId} at seed ${seed}.`;
		} catch (error) {
			benchNote = error instanceof Error ? error.message : String(error);
		} finally {
			running = false;
		}
	}
	const litVerdicts = $derived(
		Object.entries(flows).length === 0
			? new Map<string, string>()
			: new Map((flows[stack.id] ?? []).map((row) => [row.point?.kind ?? row.hook, row.verdict]))
	);
	const difference = $derived.by(() => {
		if (!pinned) return undefined;
		const a = verdictFlowSignature(flows[stack.id] ?? []);
		const b = verdictFlowSignature(flows[pinned.id] ?? []);
		const at = a.findIndex((entry, index) => entry !== b[index]);
		if (at === -1 && a.length === b.length) return 'the two flows agree, row for row';
		const index = at === -1 ? Math.min(a.length, b.length) : at;
		return `first difference at row ${index + 1}: ${a[index] ?? 'nothing'} against ${b[index] ?? 'nothing'}`;
	});

	// ── Save and Use in… (§6) ─────────────────────────────────────────────
	async function save(): Promise<void> {
		// Plain data for the store: a `$state` proxy cannot be structured-cloned.
		const parsed = stackSchema.safeParse($state.snapshot(stack));
		if (!parsed.success) {
			note = `the stack does not parse: ${parsed.error.issues[0]?.message ?? ''}`;
			return;
		}
		try {
			const storage = await appStorage();
			await storage.putContent(stackRecord(parsed.data, new Date().toISOString()));
			saved = parsed.data.id;
			note = `Saved as ${parsed.data.id}.`;
		} catch (error) {
			note = `not saved: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	function pin(): void {
		pinned = pinned
			? undefined
			: renamed(structuredClone($state.snapshot(stack)) as Stack, `${stack.name} (pinned)`);
	}
	const useHref = (target: 'campaigns' | 'experiments' | 'spec') =>
		target === 'campaigns'
			? `${resolve('/workshop/campaigns')}?stack=${encodeURIComponent(saved || stack.id)}`
			: target === 'experiments'
				? `${resolve('/workshop/experiments')}?guard=${encodeURIComponent(saved || stack.id)}`
				: `${resolve('/workshop/spec/[agentId]', { agentId: agentFromSpecLab })}?stack=${encodeURIComponent(saved || stack.id)}`;
	const verdictStatus = (verdict: string) =>
		verdict === 'allow' || verdict === 'annotate' || verdict === 'redact' ? 'pass' : 'fail';
</script>

<svelte:head><title>Studio — Workshop</title></svelte:head>

<main data-testid="studio-page">
	<header class="head">
		<h1>The Guardrail Studio</h1>
		<nav class="tabs" aria-label="Studio tabs">
			<button
				type="button"
				class:active={tab === 'studio'}
				aria-pressed={tab === 'studio'}
				onclick={() => (tab = 'studio')}
				data-testid="studio-tab-studio">Stacks</button
			>
			<button
				type="button"
				class:active={tab === 'connections'}
				aria-pressed={tab === 'connections'}
				onclick={() => (tab = 'connections')}
				data-testid="studio-tab-connections">Connections</button
			>
		</nav>
	</header>

	{#if tab === 'connections'}
		<Connections />
	{:else}
		<Strip label={stack.name} icon="stack" testId="studio-strip">
			<Readout label="fits" value={stack.fit.length} testId="studio-fits" />
			<Readout label="components" value={components.length} testId="studio-components" />
			{#snippet actions()}
				<label class="field"
					><span>Name</span><input
						value={stack.name}
						onchange={(event) => (stack = renamed(stack, event.currentTarget.value))}
						data-testid="studio-name"
					/></label
				>
				<button type="button" onclick={() => void save()} data-testid="studio-save">Save</button>
				<button type="button" onclick={pin} data-testid="studio-pin"
					>{pinned ? 'Unpin' : 'Pin for side by side'}</button
				>
			{/snippet}
		</Strip>
		{#if note}<p class="note" data-testid="studio-note">{note}</p>{/if}

		<div class="columns">
			<section class="catalogue" aria-label="The catalogue" data-testid="studio-catalogue">
				<h2>Catalogue</h2>
				<div class="filters">
					<label
						><span>Point</span><select bind:value={filter.point} data-testid="studio-filter-point">
							<option value="">any</option>
							{#each ['pre-think', 'pre-act', 'post-act', 'stage-in', 'stage-out', 'group', 'egress'] as kind (kind)}
								<option value={kind}>{kind}</option>
							{/each}
						</select></label
					>
					<label
						><span>Verdict</span><select
							bind:value={filter.verdict}
							data-testid="studio-filter-verdict"
						>
							<option value="">any</option>
							{#each ['allow', 'block', 'stop', 'pause', 'redact', 'annotate'] as kind (kind)}
								<option value={kind}>{kind}</option>
							{/each}
						</select></label
					>
					<label
						><span>Cost</span><select bind:value={filter.cost} data-testid="studio-filter-cost">
							<option value="">any</option>
							<option value="free">free</option>
							<option value="local-compute">local compute</option>
							<option value="metered">metered</option>
						</select></label
					>
					<label
						><span>Connection</span><select
							bind:value={filter.connection}
							data-testid="studio-filter-connection"
						>
							<option value="">any</option>
							<option value="none">built in</option>
							<option value="local">local</option>
							<option value="hosted">hosted</option>
						</select></label
					>
					<label
						><span>Technique</span><select
							bind:value={filter.technique}
							data-testid="studio-filter-technique"
						>
							<option value="">any</option>
							{#each techniques as technique (technique)}<option value={technique}
									>{technique}</option
								>{/each}
						</select></label
					>
				</div>
				{#each grouped as group (group.technique)}
					<h3>{group.technique}</h3>
					<ul class="cards">
						{#each group.components as component (component.id)}
							{@const lamp = lampOf(component)}
							<li>
								<button
									type="button"
									class="card"
									class:card--selected={selectedComponent === component.id}
									aria-pressed={selectedComponent === component.id}
									draggable="true"
									ondragstart={(event) => onDragStart(event, component.id)}
									onclick={() => (selectedComponent = component.id)}
									data-testid="studio-component-{component.id}"
								>
									<b>{component.name}</b>
									<span class="mono">{component.id}</span>
									<span class="meta"
										>{component.points.join(', ')} · {component.verdicts.join(', ')} · {component
											.cost.class}</span
									>
									<span class="meta">{explainDefault(component)}</span>
									<Lamp
										status={lamp.status}
										label={lamp.word}
										testId="studio-lamp-{component.id}"
									/>
								</button>
							</li>
						{/each}
					</ul>
				{/each}
			</section>

			<section class="centre" aria-label="The journey and its points" data-testid="studio-centre">
				<h2>Points</h2>
				<label class="field"
					><span>Journey</span><select bind:value={workflowId} data-testid="studio-workflow">
						<option value="">the loop alone</option>
						{#each workflows as entry (entry.id)}<option value={entry.id}>{entry.name}</option
							>{/each}
					</select></label
				>
				<p class="hint">
					Choose a component, then a point: click it, drop the card on it, or from a stage press
					<kbd>g</kbd> and <kbd>Enter</kbd>.
				</p>
				{#if layout}
					<JourneyCanvas {layout} {onPoint} testId="studio-journey" />
					<!-- WP110 (`97-ACCESS.md` §1; tenet 29): the drawing's list twin, always beside it. -->
					<JourneyList {layout} testId="studio-journey-list" />
				{:else}
					<ul class="loop" data-testid="studio-loop">
						{#each loopPoints as point (point.kind)}
							<li>
								<button
									type="button"
									class="point"
									class:point--lit={litVerdicts.has(point.kind)}
									data-verdict={litVerdicts.get(point.kind)}
									ondragover={(event) => event.preventDefault()}
									ondrop={(event) => onDrop(event, point)}
									onclick={() => fitSelectedAt(point)}
									data-testid="studio-point-{point.kind}"
								>
									{point.kind}
									{#if litVerdicts.has(point.kind)}<Lamp
											status={verdictStatus(litVerdicts.get(point.kind) ?? '')}
											label={litVerdicts.get(point.kind)}
										/>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<h3>The stack</h3>
				{#if stack.fit.length === 0}
					<p class="hint" data-testid="studio-empty">Nothing fitted yet.</p>
				{:else}
					<ol class="fits" data-testid="studio-stack">
						{#each stack.fit as fit, index (index)}
							<li data-testid="studio-fit-{index}">
								<b>{componentOf(fit.componentId)?.name ?? fit.componentId}</b>
								at <code>{fit.point.kind}{fit.point.at ? ` on ${fit.point.at}` : ''}</code>
								— {explainOf(fit)}
								<details>
									<summary>Settings</summary>
									<textarea
										rows="3"
										value={configText[index] ?? JSON.stringify(fit.config ?? {}, null, '\t')}
										oninput={(event) =>
											(configText = { ...configText, [index]: event.currentTarget.value })}
										data-testid="studio-fit-config-{index}"></textarea>
									<button type="button" onclick={() => applyConfig(index)}>Apply</button>
								</details>
								<button
									type="button"
									onclick={() => (stack = unfit(stack, index))}
									data-testid="studio-unfit-{index}">Remove</button
								>
							</li>
						{/each}
					</ol>
				{/if}
				<div class="use">
					<span>Use in…</span>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() builds each base path in useHref; the stack id is a query the typed surface cannot carry. -->
					<a href={useHref('campaigns')} data-testid="studio-use-campaign">a campaign</a>
					<a href={useHref('experiments')} data-testid="studio-use-experiment">an experiment</a>
					{#if agentFromSpecLab}<a href={useHref('spec')} data-testid="studio-use-spec"
							>the Spec Lab</a
						>{/if}
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if !saved}<span class="hint">(save first, so the page can find it)</span>{/if}
				</div>
			</section>

			<section class="bench" aria-label="The test bench" data-testid="studio-bench">
				<h2>Test bench</h2>
				<label class="field"
					><span>Scenario</span><select bind:value={scenarioId} data-testid="studio-scenario">
						{#each scenarios as scenario (scenario.id)}<option value={scenario.id}
								>{scenario.id}</option
							>{/each}
					</select></label
				>
				<label class="field"
					><span>Brain</span><select bind:value={brain} data-testid="studio-brain">
						<option value="scripted-optimal">scripted-optimal</option>
						<option value="scripted-noisy">scripted-noisy</option>
					</select></label
				>
				<label class="field"
					><span>Seed</span><input
						type="number"
						min="1"
						bind:value={seed}
						data-testid="studio-seed"
					/></label
				>
				<label class="field"
					><span>Counterpart</span><select
						bind:value={counterpart}
						data-testid="studio-counterpart"
					>
						<option value="scripted">the desk's scripted persona</option>
						<option value="live">live — a cartridge in the battery (Talk to this desk)</option>
					</select></label
				>
				<button
					type="button"
					onclick={() => void runThrough()}
					disabled={running || scenarios.length === 0}
					data-testid="studio-run">{running ? 'Running…' : 'Run through the stack'}</button
				>
				{#if benchNote}<p class="hint" data-testid="studio-bench-note">{benchNote}</p>{/if}
				{#if pinned && Object.keys(flows).length > 0}<p
						class="hint"
						data-testid="studio-difference"
					>
						{difference}
					</p>{/if}
				<div class="flows">
					{#each [stack, ...(pinned ? [pinned] : [])] as entry (entry.id)}
						{#if flows[entry.id]}
							<table data-testid="studio-flow-{entry.id}">
								<caption>{entry.name}</caption>
								<thead
									><tr
										><th scope="col">Tick</th><th scope="col">Point</th><th scope="col"
											>Guardrail</th
										><th scope="col">Verdict</th><th scope="col">Why</th><th scope="col">ms</th></tr
									></thead
								>
								<tbody>
									{#each flows[entry.id] ?? [] as row (row.seq)}
										<tr data-verdict={row.verdict}>
											<td>{row.tick}</td>
											<td
												>{row.point
													? `${row.point.kind}${row.point.at ? ` on ${row.point.at}` : ''}`
													: row.hook}</td
											>
											<td class="mono">{row.componentId ?? row.guardrailId}</td>
											<td><Lamp status={verdictStatus(row.verdict)} label={row.verdict} /></td>
											<td
												>{row.reason ?? row.findingCategory ?? ''}{row.cause
													? ` (${row.cause})`
													: ''}{row.redactedText ? ` → ${row.redactedText}` : ''}</td
											>
											<td>{row.latencyMs ?? '—'}</td>
										</tr>
									{/each}
									{#if (flows[entry.id] ?? []).length === 0}<tr
											><td colspan="6">No guardrail decided on this run.</td></tr
										>{/if}
								</tbody>
							</table>
						{/if}
					{/each}
				</div>
			</section>
		</div>
	{/if}
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-3);
		align-content: start;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: var(--cab-space-3);
	}
	h1,
	h2,
	h3 {
		margin: 0 0 var(--cab-space-2);
	}
	.tabs button {
		font-weight: 700;
	}
	.tabs .active {
		background: var(--cab-yellow);
	}
	.columns {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr) minmax(240px, 1fr);
		gap: var(--cab-space-3);
	}
	@media (max-width: 1100px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
	.filters {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-xs);
		margin-bottom: var(--cab-space-2);
	}
	.filters label,
	.field {
		display: flex;
		gap: var(--cab-space-2);
		align-items: center;
	}
	.cards,
	.loop,
	.fits {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--cab-space-2);
	}
	.card,
	.point {
		display: grid;
		gap: 2px;
		width: 100%;
		text-align: left;
		padding: var(--cab-space-2);
		border: 1.5px solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
		background: var(--cab-cream);
		cursor: grab;
	}
	.card--selected,
	.point--lit {
		background: var(--cab-graph);
		outline: 3px solid var(--cab-blue);
	}
	.point {
		cursor: pointer;
	}
	.meta,
	.hint,
	.note {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}
	.note {
		color: var(--cab-ink);
		font-weight: 700;
	}
	.mono {
		font-family: var(--cab-font-mono, monospace);
		font-size: var(--cab-text-xs);
	}
	.fits li {
		border-bottom: 1px solid var(--cab-metal);
		padding: var(--cab-space-1) 0;
	}
	.fits textarea {
		width: 100%;
		font-family: var(--cab-font-mono, monospace);
	}
	.use {
		display: flex;
		gap: var(--cab-space-2);
		flex-wrap: wrap;
		margin-top: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}
	.flows table {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--cab-text-xs);
		margin-top: var(--cab-space-2);
	}
	.flows th,
	.flows td {
		text-align: left;
		padding: 2px var(--cab-space-1);
		border-bottom: 1px solid var(--cab-metal);
		vertical-align: top;
	}
</style>
