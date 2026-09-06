<script lang="ts">
	import { resolve } from '$app/paths';
	import { migrateAgentSpec, type AgentSpecV2, type DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		LENDING_POLICY_CARD_IDS,
		lendingDesk,
		lendingEvaluators,
		lendingPolicyCards,
		lendingScenarios,
		LENDING_DECKS,
		scenariosInLendingDeck,
		type LendingDeskState
	} from '@craftabot/pack-fs-lending';
	import { buildSpec } from '@craftabot/pack-starter/testing';
	import Boundary from '$lib/components/control-room/Boundary.svelte';
	import CaseFile from '$lib/components/control-room/CaseFile.svelte';
	import CaseTable from '$lib/components/control-room/CaseTable.svelte';
	import Readout from '$lib/components/control-room/Readout.svelte';
	import Strip from '$lib/components/control-room/Strip.svelte';
	import { createRegistry } from '$lib/packs.js';
	import { boundaryFor } from '$lib/workshop/boundary.js';

	/**
	 * **The Lending Desk's page** (WP63 stage D, `52-FS-LENDING.md` §4.7): the
	 * desk, read. A layout and a seed make a case on `CaseFile` — the
	 * application on the desk, what the journey would earn, the rule's verdict
	 * and the cohort under the flap; the four decks; the five cards and the
	 * five evaluators; the campaign build on the map with the bureau line
	 * outside. Nothing runs here.
	 */
	const registry = createRegistry();
	let layoutId = $state(lendingDesk.layouts[0]?.id ?? 'clear-approve');
	let seed = $state(7);
	let snapshot = $state<LendingDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = lendingDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as LendingDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	/** The campaign's build (§4.7), for the map: the desk's senses and actions, the five cards, the bureau line. */
	const spec: AgentSpecV2 = (() => {
		const v1 = buildSpec({
			goalCardId: 'fs-lending/clear-approve',
			senses: lendingDesk.senses.map((sense) => sense.id),
			actions: lendingDesk.actions.map((action) => action.id),
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [...LENDING_POLICY_CARD_IDS]
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
	const map = boundaryFor(spec, registry);

	const deckColumns = [
		{ id: 'deck', label: 'Deck', kind: 'text' as const },
		{ id: 'title', label: 'Scenario', kind: 'text' as const },
		{ id: 'card', label: 'Card', kind: 'text' as const },
		{ id: 'tags', label: 'Tags', kind: 'text' as const }
	];
	const deckRows = LENDING_DECKS.flatMap((deck) =>
		scenariosInLendingDeck(deck).map((scenario) => ({
			id: scenario.id,
			cells: {
				deck,
				title: scenario.title,
				card: scenario.goalCardId.replace('fs-lending/', ''),
				tags: scenario.tags.join(' ')
			}
		}))
	);
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const hidden = $derived(snapshot?.hidden ?? []);
	const application = $derived(snapshot?.extra.lending.application);
</script>

<svelte:head><title>The Lending Desk — Workshop</title></svelte:head>

<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
<h1>The Lending Desk</h1>
<p class="lede">
	The bank’s lending assistant: verify the applicant, assess affordability, decide — approve,
	decline or refer — on the reasons the worksheet showed, explain the decision in those reasons, pay
	out under four eyes, and hear the appeal. The verdict is a rule over a synthetic bureau file,
	never a scorecard; every case carries a cohort in truth and the fairness deck’s matched pair is
	what the parity gate reads. Ten cards, seventeen scenarios, five policy cards, five evaluators,
	one campaign — none of it real.
</p>
<p class="simulation" data-testid="lending-simulation-only">FOR SIMULATION ONLY</p>

<section aria-label="Generate a case">
	<Strip label="A case">
		<label class="pick">
			Layout
			<select bind:value={layoutId} data-testid="lending-layout">
				{#each lendingDesk.layouts as layout (layout.id)}
					<option value={layout.id}>{layout.name}</option>
				{/each}
			</select>
		</label>
		<label class="pick">
			Seed
			<input type="number" min="1" step="1" bind:value={seed} data-testid="lending-seed" />
		</label>
		<button type="button" onclick={generate} data-testid="lending-generate">Generate</button>
		{#if snapshot && application}
			<Readout label="Applicant" value={snapshot.desk.role} testId="lending-role" />
			<Readout label="On file" value={hidden.length} testId="lending-hidden-count" />
			<Readout label="Asked for" value={`£${application.amount}`} testId="lending-amount" />
			<Readout label="Term" value={`${application.termMonths} months`} testId="lending-term" />
		{/if}
	</Strip>
</section>

{#if snapshot}
	<div class="panes">
		<section aria-label="On the desk">
			<h2>On the desk</h2>
			<CaseFile {records} testId="lending-revealed" />
		</section>
		<section aria-label="On file">
			<h2>On file — what the journey would earn</h2>
			<CaseFile
				records={hidden}
				truth={truth?.records}
				facts={truth?.facts}
				testId="lending-hidden"
			/>
		</section>
	</div>
{/if}

<section aria-label="The decks">
	<h2>The four decks — {lendingScenarios.length} scenarios</h2>
	<CaseTable columns={deckColumns} rows={deckRows} testId="lending-decks" />
</section>

<div class="panes">
	<section aria-label="The policy cards">
		<h2>The five policy cards</h2>
		<ul class="list" data-testid="lending-cards">
			{#each lendingPolicyCards as card (card.id)}
				<li data-testid="lending-card-{card.id.replace('fs-lending/policy/', '')}">
					<strong>{card.title}</strong> — {card.description}
				</li>
			{/each}
		</ul>
	</section>
	<section aria-label="The evaluators">
		<h2>The evaluators</h2>
		<ul class="list" data-testid="lending-evaluators">
			{#each lendingEvaluators as evaluator (evaluator.id)}
				<li
					data-testid="lending-evaluator-{evaluator.id
						.replace('fs-lending/', '')
						.replace('/', '-')}"
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
		The desk bot at the centre with the five cards on its Safety Brick, the desk inside the
		boundary, and the bank’s bureau line outside — the build <code
			>campaigns/fs-lending-baseline.json</code
		>
		runs under four guards, with the first matched parity gate.
	</p>
	<Boundary {map} testId="lending-map" />
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
