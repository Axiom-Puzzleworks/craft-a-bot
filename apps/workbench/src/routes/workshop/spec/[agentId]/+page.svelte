<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		brickKindsFor,
		validateSpec,
		type AgentRecord,
		type BuildProblem
	} from '@craftabot/core';
	import { SOCKET_LABELS } from '$lib/bricks.js';
	import { createRegistry, packVersions } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';

	/**
	 * **The Spec Lab** (`17-…` §4.2): the whole `AgentSpec`, at full fidelity,
	 * with what it requires in order to run anywhere else.
	 *
	 * **Read-only, and that is a scope decision rather than an oversight.** §4.2
	 * describes the bench grown up — the same draggable baseplate on the left, a
	 * schema-driven form per brick on the right, and a JSON editor. This version
	 * builds the half that does not exist anywhere else: the spec as data, its
	 * validation problems, and its contract. The editable half already exists in
	 * the Kit's bench and re-hosting it here is a real piece of work (drag,
	 * tray, sockets, undo) that would be a worse use of this WP than the Eval
	 * Matrix was. The door to the Kit's bench is on this page instead.
	 *
	 * **The contract view is the part worth having.** A kit file carries a
	 * `requires` block — core version, packs, and which pack provides each brick
	 * kind — and until now that was written on export and never shown. It is the
	 * answer to "will this bot run on your machine", which is the first question
	 * anybody sharing a bot has.
	 */

	const registry = createRegistry();
	const agentId = $derived(page.params.agentId ?? '');

	let record = $state<AgentRecord | undefined>(undefined);
	let loaded = $state(false);
	let showJson = $state(true);

	/**
	 * `validateSpec`, not `validateSpecV2` — the same function the Kit's bench
	 * uses.
	 *
	 * The first version called the v2 validator directly and reported "nothing to
	 * report" for a bot whose bench was showing a missing cartridge. Two screens
	 * disagreeing about whether the same bot is ready to run is exactly the
	 * divergence `15-…` §7 rule 1 exists to prevent, and it is worse here than on
	 * the bench: this is the screen somebody checks *before* sharing a bot.
	 */
	const problems = $derived<BuildProblem[]>(record ? validateSpec(record.spec, registry) : []);
	const brickKinds = $derived(record ? brickKindsFor(record.spec, registry) : {});
	const json = $derived(record ? JSON.stringify(record.spec, null, 2) : '');

	$effect(() => {
		void load(agentId);
	});

	async function load(id: string): Promise<void> {
		const storage = await appStorage();
		record = await storage.getAgent(id);
		loaded = true;
	}

	const blocking = $derived(problems.filter((problem) => problem.severity === 'blocking'));
	const advisory = $derived(problems.filter((problem) => problem.severity !== 'blocking'));
</script>

<svelte:head><title>{record?.spec.name ?? 'Spec'} — Spec Lab</title></svelte:head>

{#if loaded && !record}
	<p class="empty" data-testid="spec-missing">
		No bot with that id. <a href={resolve('/workshop')}>Back to the bench</a>.
	</p>
{:else if record}
	<header class="strip">
		<a class="back" href={resolve('/workshop')}>← Bench</a>
		<h1>{record.spec.name}</h1>
		<span class="version" data-testid="spec-version">spec v{record.spec.schemaVersion}</span>
		<a class="kit" href={resolve('/bench/[agentId]', { agentId })} data-testid="edit-in-kit">
			Edit on the Kit's bench →
		</a>
	</header>

	<div class="regions">
		<section aria-label="Build checks">
			<h2>Build checks</h2>
			{#if problems.length === 0}
				<p class="ok" data-testid="spec-ok">Nothing to report — this bot is ready to run.</p>
			{:else}
				<ul class="problems" data-testid="spec-problems">
					{#each problems as problem (problem.code + JSON.stringify(problem.details))}
						<li data-severity={problem.severity}>
							<!-- Severity as a word, never as colour alone (`04-…` §7). -->
							<span class="sev">{problem.severity}</span>
							<span>{problem.message}</span>
							<code>{problem.code}</code>
						</li>
					{/each}
				</ul>
				<p class="hint">
					{blocking.length} blocking, {advisory.length} advisory.
				</p>
			{/if}
		</section>

		<section aria-label="Contract">
			<h2>Contract</h2>
			<!--
				What a kit file's `requires` block would say. Written on export since
				WP4 and never shown until now — and it is the answer to "will this bot
				run on your machine", which is the first question anybody sharing a bot
				has.
			-->
			<dl class="contract" data-testid="spec-contract">
				<div>
					<dt>Goal card</dt>
					<dd class="mono">{record.spec.goalCardId}</dd>
				</div>
				<div>
					<dt>Packs installed</dt>
					<dd class="mono">
						{Object.entries(packVersions())
							.map(([id, version]) => `${id}@${version}`)
							.join(' · ')}
					</dd>
				</div>
			</dl>

			<h3>Bricks required</h3>
			{#if Object.keys(brickKinds).length === 0}
				<p class="hint" data-testid="no-bricks">
					Nothing fitted, so this bot requires no bricks at all.
				</p>
			{:else}
				<table data-testid="brick-kinds">
					<thead>
						<tr>
							<th scope="col">Socket</th>
							<th scope="col">Brick kind</th>
							<th scope="col">Provided by</th>
						</tr>
					</thead>
					<tbody>
						{#each record.spec.bricks as brick (brick.slot + brick.kind)}
							<tr>
								<td>{SOCKET_LABELS[brick.slot] ?? brick.slot}</td>
								<td class="mono">{brick.kind}</td>
								<td class="mono">
									{#if brickKinds[brick.kind]}
										{brickKinds[brick.kind]}
									{:else}
										<!--
											Not guessed. `brickKindsFor` skips a kind whose pack is not
											registered rather than inventing a plausible id, because a
											wrong id turns a local build problem into somebody else's
											import failure.
										-->
										<span class="missing">not installed</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>

		<section aria-label="Spec">
			<div class="head">
				<h2>AgentSpec</h2>
				<label class="check">
					<input type="checkbox" bind:checked={showJson} data-testid="show-json" /> JSON
				</label>
			</div>
			{#if showJson}
				<pre class="json" data-testid="spec-json">{json}</pre>
			{:else}
				<p class="hint">Hidden. The spec is the source of truth for everything above it.</p>
			{/if}
		</section>
	</div>
{/if}

<style>
	.strip {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		margin-bottom: var(--cab-space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-lg);
	}

	.version {
		font-size: var(--cab-text-xs);
		font-family: var(--cab-font-mono);
		color: var(--cab-ink-muted);
	}

	.back,
	.kit {
		font-size: var(--cab-text-sm);
	}

	.kit {
		margin-left: auto;
	}

	.regions {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(280px, 1.1fr) minmax(280px, 1.2fr);
		gap: var(--cab-space-3);
		align-items: start;
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
		gap: var(--cab-space-2);
	}

	h2,
	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	h3 {
		margin-top: var(--cab-space-3);
	}

	.problems {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}

	.problems li {
		display: grid;
		gap: 2px;
		padding-left: var(--cab-space-2);
		border-left: 3px solid var(--cab-ink-muted);
	}

	.problems li[data-severity='blocking'] {
		border-left-color: var(--cab-red);
	}

	.sev {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
	}

	.problems code,
	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.contract {
		display: grid;
		gap: var(--cab-space-2);
		margin: 0;
	}

	dt {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	dd {
		margin: 0;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: 2px var(--cab-space-1);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.missing {
		color: var(--cab-red-text);
		font-weight: 600;
	}

	.json {
		max-height: 60vh;
		overflow: auto;
		margin: 0;
		padding: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	.ok,
	.hint,
	.empty {
		margin: 0;
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
	}

	.check {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--cab-text-xs);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (max-width: 1100px) {
		.regions {
			grid-template-columns: 1fr;
		}
	}
</style>
