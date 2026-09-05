<script lang="ts">
	import { resolve } from '$app/paths';
	import { migrateAgentSpec, type AgentSpecV2, type DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		ADVICE_POLICY_CARD_IDS,
		adviceDesk,
		adviceEvaluators,
		advicePolicyCards,
		adviceScenarios,
		ADVICE_DECKS,
		scenariosInDeck,
		type AdviceDeskState
	} from '@craftabot/pack-fs-advice';
	import { buildSpec } from '@craftabot/pack-starter/testing';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { boundaryFor } from '$lib/workshop/boundary.js';

	/**
	 * **The Advice Desk's page** (WP60 stage D, `49-FS-ADVICE.md` §4.8): the
	 * desk, read. A layout and a seed make a case on `CaseFile` — what is on
	 * the desk, what a look-up would earn, the truth under the flap with the
	 * suitable set; the four decks as a table of scenarios with their tags;
	 * the seven cards and the thirteen evaluators; and the Boundary map of
	 * the campaign's own build — the desk bot with the cards on its Safety
	 * Brick and the CRM line outside. Nothing runs here.
	 */
	const registry = createRegistry();
	let layoutId = $state(adviceDesk.layouts[0]?.id ?? 'inheritance');
	let seed = $state(7);
	let snapshot = $state<AdviceDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = adviceDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as AdviceDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	/** The campaign's build (§4.7), for the map: the desk's senses and actions, the seven cards, the CRM line. */
	const spec: AgentSpecV2 = (() => {
		const v1 = buildSpec({
			goalCardId: 'fs-advice/advise-inheritance',
			senses: adviceDesk.senses.map((sense) => sense.id),
			actions: adviceDesk.actions.map((action) => action.id),
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [...ADVICE_POLICY_CARD_IDS]
			}
		});
		const migrated = migrateAgentSpec(v1);
		if ('kind' in migrated) throw new Error(migrated.message);
		return {
			...migrated,
			bricks: [
				...migrated.bricks,
				{
					slot: 'equipment',
					kind: 'starter/connector',
					configVersion: 1,
					config: { serviceId: 'fs-bank/crm', scopes: ['read-customer', 'read-record'] }
				}
			]
		};
	})();
	const map = boundaryFor(spec, registry);

	const deckColumns = [
		{ id: 'deck', label: 'Deck', kind: 'text' as const },
		{ id: 'title', label: 'Scenario', kind: 'text' as const },
		{ id: 'card', label: 'Card', kind: 'text' as const },
		{ id: 'tags', label: 'Tags', kind: 'text' as const }
	];
	const deckRows = ADVICE_DECKS.flatMap((deck) =>
		scenariosInDeck(deck).map((scenario) => ({
			id: scenario.id,
			cells: {
				deck,
				title: scenario.title,
				card: scenario.goalCardId.replace('fs-advice/', ''),
				tags: scenario.tags.join(' ')
			}
		}))
	);
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const hidden = $derived(snapshot?.hidden ?? []);
</script>

<svelte:head><title>The Advice Desk — Workshop</title></svelte:head>

<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
<h1>The Advice Desk</h1>
<p class="lede">
	The bank’s savings-and-investment assistant: gather what suitability needs, stay on the right side
	of the advice line the card sets, describe products with their warnings, recognise a customer who
	is vulnerable, recommend or refer. Sixteen cards, thirty scenarios, seven policy cards, thirteen
	evaluators, one campaign — none of it real.
</p>
<p class="simulation" data-testid="advice-simulation-only">FOR SIMULATION ONLY</p>

<section aria-label="Generate a case">
	<Strip label="A case">
		<label class="pick">
			Layout
			<select bind:value={layoutId} data-testid="advice-layout">
				{#each adviceDesk.layouts as layout (layout.id)}
					<option value={layout.id}>{layout.name}</option>
				{/each}
			</select>
		</label>
		<label class="pick">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="advice-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="advice-generate">Generate</button>
		{#if snapshot}
			<Readout label="Customer" value={snapshot.desk.role} testId="advice-role" />
			<Readout label="On file" value={hidden.length} testId="advice-hidden-count" />
			<Readout
				label="Suitable"
				value={String(
					truth?.records.find((r: { id: string }) => r.id === 'suitable-set')?.fields[
						'product_ids'
					] ?? ''
				)
					.split(' ')
					.filter(Boolean).length}
				testId="advice-suitable-count"
			/>
		{/if}
	</Strip>
</section>

{#if snapshot}
	<div class="panes">
		<section aria-label="On the desk">
			<h2>On the desk</h2>
			<CaseFile {records} testId="advice-revealed" />
		</section>
		<section aria-label="On file">
			<h2>On file — what a look-up would earn</h2>
			<CaseFile
				records={hidden}
				truth={truth?.records}
				facts={truth?.facts}
				testId="advice-hidden"
			/>
		</section>
	</div>
{/if}

<section aria-label="The decks">
	<h2>The four decks — {adviceScenarios.length} scenarios</h2>
	<CaseTable columns={deckColumns} rows={deckRows} testId="advice-decks" />
</section>

<div class="panes">
	<section aria-label="The policy cards">
		<h2>The seven policy cards</h2>
		<ul class="list" data-testid="advice-cards">
			{#each advicePolicyCards as card (card.id)}
				<li data-testid="advice-card-{card.id.replace('fs-advice/policy/', '')}">
					<strong>{card.title}</strong> — {card.description}
				</li>
			{/each}
		</ul>
	</section>
	<section aria-label="The evaluators">
		<h2>The evaluators</h2>
		<ul class="list" data-testid="advice-evaluators">
			{#each adviceEvaluators as evaluator (evaluator.id)}
				<li
					data-testid="advice-evaluator-{evaluator.id.replace('fs-advice/', '').replace('/', '-')}"
				>
					<strong>{evaluator.name}</strong>
					<span class="kind" data-kind={evaluator.kind}>{evaluator.kind}</span>
					{#if evaluator.reads?.includes('truth')}<span class="kind">reads truth</span>{/if}
					— {evaluator.description}
				</li>
			{/each}
		</ul>
	</section>
</div>

<section aria-label="The boundary">
	<h2>The campaign’s build, on the map</h2>
	<p>
		The desk bot at the centre with the seven cards on its Safety Brick, the desk inside the
		boundary, and the bank’s CRM line outside — the build <code
			>campaigns/fs-advice-baseline.json</code
		>
		runs under four guards.
	</p>
	<Boundary {map} testId="advice-map" />
</section>

<style>
	.crumb {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
	}
	h1 {
		margin: 0 0 var(--cab-space-2);
	}
	.lede {
		max-width: 70ch;
		color: var(--cab-ink-muted);
	}
	.simulation {
		display: inline-block;
		margin: 0 0 var(--cab-space-3);
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
	.pick input {
		width: 6rem;
	}
	.panes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--cab-space-3);
		margin: var(--cab-space-3) 0;
	}
	@media (max-width: 900px) {
		.panes {
			grid-template-columns: 1fr;
		}
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}
	.list li {
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
	}
	.kind {
		display: inline-block;
		margin: 0 var(--cab-space-1);
		padding: 0 var(--cab-space-1);
		font-size: var(--cab-text-xs);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-pill);
	}
</style>
