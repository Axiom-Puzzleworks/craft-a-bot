<script lang="ts">
	import { glossTags } from '$lib/workshop/tag-gloss.js';

	/** Deck counts read aloud (UX-22). */
	const DECK_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
	import { resolve } from '$app/paths';
	import { migrateAgentSpec, type AgentSpecV2, type DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		COLLECTIONS_POLICY_CARD_IDS,
		collectionsDesk,
		collectionsEvaluators,
		collectionsPolicyCards,
		collectionsScenarios,
		COLLECTIONS_DECKS,
		scenariosInCollectionsDeck,
		type CollectionsDeskState
	} from '@craftabot/pack-fs-collections';
	import { buildSpec } from '@craftabot/pack-starter/testing';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { boundaryFor } from '$lib/workshop/boundary.js';
	import { workflowRing } from '@craftabot/governance/reports';

	/** The Campaigns screen opened on this desk's baseline (UX-5). */
	const campaignHref = `${resolve('/workshop/campaigns')}?baseline=fs-collections-baseline`;

	/**
	 * **The Collections Desk's page** (WP105, `91-FS-COLLECTIONS.md` §7): the
	 * desk, read. A layout and a seed make a case on `CaseFile` — the dispute
	 * on the desk, what the investigation would earn, the rule's verdict and
	 * the classification under the flap; the three decks; the four cards and
	 * the four evaluators; the campaign build on the map with the `payments`
	 * line outside. Nothing runs here.
	 */
	const registry = createRegistry();
	let layoutId = $state(collectionsDesk.layouts[0]?.id ?? 'missed-payment');
	let seed = $state(7);
	let snapshot = $state<CollectionsDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = collectionsDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as CollectionsDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	/** The campaign's build (§6), for the map: the desk's senses and actions, the four cards, the bureau line. */
	const spec: AgentSpecV2 = (() => {
		const v1 = buildSpec({
			goalCardId: 'fs-collections/missed-payment',
			senses: collectionsDesk.senses.map((sense) => sense.id),
			actions: collectionsDesk.actions.map((action) => action.id),
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [...COLLECTIONS_POLICY_CARD_IDS]
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
					config: { serviceId: 'fs-bank/credit-bureau', scopes: ['file', 'affordability'] }
				}
			]
		};
	})();
	// The desk's own journey on the ring (WP86, `77-…` §5).
	const journey = registry.getWorkflow('fs-collections/arrears');
	const map = boundaryFor(
		spec,
		registry,
		undefined,
		undefined,
		journey ? [workflowRing(journey)] : []
	);

	const deckColumns = [
		{ id: 'deck', label: 'Deck', kind: 'text' as const },
		{ id: 'title', label: 'Scenario', kind: 'text' as const },
		{ id: 'card', label: 'Card', kind: 'text' as const },
		{ id: 'tags', label: 'Tags', kind: 'text' as const }
	];
	const deckRows = COLLECTIONS_DECKS.flatMap((deck) =>
		scenariosInCollectionsDeck(deck).map((scenario) => ({
			id: scenario.id,
			cells: {
				deck,
				title: scenario.title,
				card: scenario.goalCardId.replace('fs-collections/', ''),
				tags: glossTags(scenario.tags)
			}
		}))
	);
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const hidden = $derived(snapshot?.hidden ?? []);
	const arrears = $derived(snapshot?.extra.collections.arrears);
</script>

<svelte:head><title>The Collections Desk — Workshop</title></svelte:head>

<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
<h1>The Collections Desk</h1>
<p class="lede">
	The bank’s collections handler: verify the customer, review the account, hear and record their
	circumstances — with any disclosure of a job loss, a bereavement or a health condition, as they
	say it — reassess what they can afford, and offer the plan the rule gives: a payment plan, reduced
	payments, or breathing space. The rule is CONC 7-shaped and synthetic; a disclosed support need
	stops a default notice and needs no proving; the plan is agreed under four eyes, and a disclosure
	is handed on to the servicing desk. Five cards, ten scenarios, four policy cards, four evaluators,
	one campaign with the matched pair’s parity gate — none of it real.
</p>
<p class="simulation" data-testid="collections-simulation-only">FOR SIMULATION ONLY</p>

<section aria-label="Generate a case">
	<Strip label="A case" icon="desk">
		<label class="pick">
			Layout
			<select bind:value={layoutId} data-testid="collections-layout">
				{#each collectionsDesk.layouts as layout (layout.id)}
					<option value={layout.id}>{layout.name}</option>
				{/each}
			</select>
		</label>
		<label class="pick">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="collections-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="collections-generate">Generate</button>
		{#if snapshot && arrears}
			<Readout label="Applicant" value={snapshot.desk.role} testId="collections-role" />
			<Readout label="On file" value={hidden.length} testId="collections-hidden-count" />
			<Readout label="Missed" value={arrears.missedPayments} testId="collections-missed" />
			<Readout
				label="Arrears"
				value={`£${arrears.arrears.toLocaleString('en-GB')}`}
				testId="collections-arrears"
			/>
		{/if}
	</Strip>
</section>

{#if snapshot}
	<div class="panes">
		<section aria-label="On the desk">
			<h2>On the desk</h2>
			<CaseFile {records} testId="collections-revealed" />
		</section>
		<section aria-label="On file">
			<h2>On file — what the journey would earn</h2>
			<CaseFile
				records={hidden}
				truth={truth?.records}
				facts={truth?.facts}
				testId="collections-hidden"
			/>
		</section>
	</div>
{/if}

<section aria-label="The decks">
	<h2>
		The {DECK_WORDS[COLLECTIONS_DECKS.length] ?? COLLECTIONS_DECKS.length} decks — {collectionsScenarios.length}
		scenarios
	</h2>
	<CaseTable columns={deckColumns} rows={deckRows} testId="collections-decks" />
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path (campaignHref above); its typed surface has no way to attach the ?baseline= query the rule can verify statically (the same exception the lending page takes). -->
		<a class="run-campaign" href={campaignHref} data-testid="collections-run-campaign"
			>Run this desk’s campaign →</a
		>
	</p>
</section>

<div class="panes">
	<section aria-label="The policy cards">
		<h2>The four policy cards</h2>
		<ul class="list" data-testid="collections-cards">
			{#each collectionsPolicyCards as card (card.id)}
				<li data-testid="collections-card-{card.id.replace('fs-collections/policy/', '')}">
					<strong>{card.title}</strong> — {card.description}
				</li>
			{/each}
		</ul>
	</section>
	<section aria-label="The evaluators">
		<h2>The evaluators</h2>
		<ul class="list" data-testid="collections-evaluators">
			{#each collectionsEvaluators as evaluator (evaluator.id)}
				<li data-testid="collections-evaluator-{evaluator.id.replace('fs-collections/', '')}">
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
		The desk bot at the centre with the four cards on its Safety Brick, the desk inside the
		boundary, and the bank’s bureau line outside. The build <code
			>campaigns/fs-collections-baseline.json</code
		>
		runs under three guards, with the circumstances, the notice and the matched pair as its gates.
	</p>
	<Boundary {map} testId="collections-map" />
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
