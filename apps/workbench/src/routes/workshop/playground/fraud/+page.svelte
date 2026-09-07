<script lang="ts">
	import { glossTags } from '$lib/workshop/tag-gloss.js';

	/** Deck counts read aloud (UX-22). */
	const DECK_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
	import { resolve } from '$app/paths';
	import { migrateAgentSpec, type AgentSpecV2, type DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		FRAUD_POLICY_CARD_IDS,
		fraudDesk,
		fraudEvaluators,
		fraudPolicyCards,
		fraudScenarios,
		FRAUD_DECKS,
		scenariosInFraudDeck,
		type FraudDeskState
	} from '@craftabot/pack-fs-fraud';
	import { buildSpec } from '@craftabot/pack-starter/testing';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { boundaryFor } from '$lib/workshop/boundary.js';

	/** The Campaigns screen opened on this desk's baseline (UX-5). */
	const campaignHref = `${resolve('/workshop/campaigns')}?baseline=fs-fraud-baseline`;

	/**
	 * **The Fraud Desk's page** (WP62 stage D, `51-FS-FRAUD.md` §4.7): the
	 * desk, read. A layout and a seed make a case on `CaseFile` — the alerts on
	 * the desk, what a look-up would earn, the labels and the caller under the
	 * flap; the four decks; the five cards and the ten evaluators; the campaign
	 * build on the map with the KYC line outside. Nothing runs here.
	 */
	const registry = createRegistry();
	let layoutId = $state(fraudDesk.layouts[0]?.id ?? 'inheritance');
	let seed = $state(7);
	let snapshot = $state<FraudDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = fraudDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as FraudDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	/** The campaign's build (§4.7), for the map: the desk's senses and actions, the seven cards, the CRM line. */
	const spec: AgentSpecV2 = (() => {
		const v1 = buildSpec({
			goalCardId: 'fs-fraud/queue-mixed',
			senses: fraudDesk.senses.map((sense) => sense.id),
			actions: fraudDesk.actions.map((action) => action.id),
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [...FRAUD_POLICY_CARD_IDS]
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
					config: { serviceId: 'fs-bank/kyc', scopes: ['verify-identity', 'verification-status'] }
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
	const deckRows = FRAUD_DECKS.flatMap((deck) =>
		scenariosInFraudDeck(deck).map((scenario) => ({
			id: scenario.id,
			cells: {
				deck,
				title: scenario.title,
				card: scenario.goalCardId.replace('fs-fraud/', ''),
				tags: glossTags(scenario.tags)
			}
		}))
	);
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const hidden = $derived(snapshot?.hidden ?? []);
</script>

<svelte:head><title>The Fraud Desk — Workshop</title></svelte:head>

<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
<h1>The Fraud Desk</h1>
<p class="lede">
	The bank’s fraud-operations assistant: work a queue of alerts, look up what the file says, decide
	— release, hold, block, freeze or escalate — and handle the call from the customer or the
	“customer” without ever tipping them off. Twelve cards, eighteen scenarios, five policy cards, ten
	evaluators, one campaign — none of it real.
</p>
<p class="simulation" data-testid="fraud-simulation-only">FOR SIMULATION ONLY</p>

<section aria-label="Generate a case">
	<Strip label="A case" icon="desk">
		<label class="pick">
			Layout
			<select bind:value={layoutId} data-testid="fraud-layout">
				{#each fraudDesk.layouts as layout (layout.id)}
					<option value={layout.id}>{layout.name}</option>
				{/each}
			</select>
		</label>
		<label class="pick">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="fraud-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="fraud-generate">Generate</button>
		{#if snapshot}
			<Readout label="Customer" value={snapshot.desk.role} testId="fraud-role" />
			<Readout label="On file" value={hidden.length} testId="fraud-hidden-count" />
			<Readout
				label="Alerts"
				value={records.filter((record) => record.kind === 'alert').length}
				testId="fraud-alert-count"
			/>
		{/if}
	</Strip>
</section>

{#if snapshot}
	<div class="panes">
		<section aria-label="On the desk">
			<h2>On the desk</h2>
			<CaseFile {records} testId="fraud-revealed" />
		</section>
		<section aria-label="On file">
			<h2>On file — what a look-up would earn</h2>
			<CaseFile
				records={hidden}
				truth={truth?.records}
				facts={truth?.facts}
				testId="fraud-hidden"
			/>
		</section>
	</div>
{/if}

<section aria-label="The decks">
	<!-- The count comes from the data (UX-22): the incident deck arrived after the heading was written. -->
	<h2>
		The {DECK_WORDS[FRAUD_DECKS.length] ?? FRAUD_DECKS.length} decks — {fraudScenarios.length} scenarios
	</h2>
	<CaseTable columns={deckColumns} rows={deckRows} testId="fraud-decks" />
	<p>
		<a class="run-campaign" href={campaignHref} data-testid="fraud-run-campaign"
			>Run this desk’s campaign →</a
		>
	</p>
</section>

<div class="panes">
	<section aria-label="The policy cards">
		<h2>The five policy cards</h2>
		<ul class="list" data-testid="fraud-cards">
			{#each fraudPolicyCards as card (card.id)}
				<li data-testid="fraud-card-{card.id.replace('fs-fraud/policy/', '')}">
					<strong>{card.title}</strong> — {card.description}
				</li>
			{/each}
		</ul>
	</section>
	<section aria-label="The evaluators">
		<h2>The evaluators</h2>
		<ul class="list" data-testid="fraud-evaluators">
			{#each fraudEvaluators as evaluator (evaluator.id)}
				<li data-testid="fraud-evaluator-{evaluator.id.replace('fs-fraud/', '').replace('/', '-')}">
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
		The desk bot at the centre with the five cards on its Safety Brick, the desk inside the
		boundary, and the bank’s KYC line outside — the build <code
			>campaigns/fs-fraud-baseline.json</code
		>
		runs under four guards.
	</p>
	<Boundary {map} testId="fraud-map" />
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
