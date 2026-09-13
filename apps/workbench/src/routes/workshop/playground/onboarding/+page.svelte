<script lang="ts">
	import { glossTags } from '$lib/workshop/tag-gloss.js';

	/** Deck counts read aloud (UX-22). */
	const DECK_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
	import { resolve } from '$app/paths';
	import { migrateAgentSpec, type AgentSpecV2, type DeskWorldState } from '@craftabot/core';
	import { seededRandom, type DeskTruth } from '@craftabot/desk';
	import {
		ONBOARDING_POLICY_CARD_IDS,
		onboardingDesk,
		onboardingEvaluators,
		onboardingPolicyCards,
		onboardingScenarios,
		ONBOARDING_DECKS,
		scenariosInOnboardingDeck,
		type OnboardingDeskState
	} from '@craftabot/pack-fs-onboarding';
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
	const campaignHref = `${resolve('/workshop/campaigns')}?baseline=fs-onboarding-baseline`;

	/**
	 * **The Onboarding Desk's page** (WP103, `95-FS-ONBOARDING.md` §4.7): the
	 * desk, read. A layout and a seed make a case on `CaseFile` — the
	 * application on the desk, what the checks would earn (the document, the
	 * screening result, the rating), the rule's verdict and the list under
	 * the flap; the three decks; the three cards and the four evaluators; the
	 * campaign build on the map with the `kyc` line outside. Nothing runs here.
	 */
	const registry = createRegistry();
	let layoutId = $state(onboardingDesk.layouts[0]?.id ?? 'clean-open');
	let seed = $state(7);
	let snapshot = $state<OnboardingDeskState | undefined>(undefined);
	let truth = $state<DeskTruth | undefined>(undefined);

	function generate(): void {
		const world = onboardingDesk.create(layoutId, { random: seededRandom(seed) });
		snapshot = world.snapshot() as unknown as OnboardingDeskState;
		truth = world.truth?.() as DeskTruth | undefined;
	}

	/** The campaign's build (§4.6), for the map: the desk's senses and actions, the three cards, the `kyc` line. */
	const spec: AgentSpecV2 = (() => {
		const v1 = buildSpec({
			goalCardId: 'fs-onboarding/clean-open',
			senses: onboardingDesk.senses.map((sense) => sense.id),
			actions: onboardingDesk.actions.map((action) => action.id),
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [...ONBOARDING_POLICY_CARD_IDS]
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
					config: { serviceId: 'fs-bank/kyc', scopes: ['verify-identity', 'sanctions'] }
				}
			]
		};
	})();
	// The desk's own journey on the ring (WP86, `77-…` §5).
	const journey = registry.getWorkflow('fs-onboarding/onboarding');
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
	const deckRows = ONBOARDING_DECKS.flatMap((deck) =>
		scenariosInOnboardingDeck(deck).map((scenario) => ({
			id: scenario.id,
			cells: {
				deck,
				title: scenario.title,
				card: scenario.goalCardId.replace('fs-onboarding/', ''),
				tags: glossTags(scenario.tags)
			}
		}))
	);
	const records = $derived((snapshot as DeskWorldState | undefined)?.records ?? []);
	const hidden = $derived(snapshot?.hidden ?? []);
	const application = $derived(snapshot?.extra.onboarding.application);
</script>

<svelte:head><title>The Onboarding Desk — Workshop</title></svelte:head>

<main>
	<p class="crumb"><a href={resolve('/workshop/playground')}>← The Playground</a></p>
	<h1>The Onboarding Desk</h1>
	<p class="lede">
		The bank’s account-opening assistant: check what the applicant gave against the document, screen
		them against the bank’s lists, rate the risk, decide — approve, decline or refer — on the
		reasons the checks showed, open the account under four eyes, and welcome them. The screening
		result is a record the desk earns and never speaks: a match is declined or referred, and the
		applicant is never told why. The lists are six synthetic names; the rule is stated, never a
		model. Five cards, ten scenarios, three policy cards, four evaluators, one campaign — none of it
		real.
	</p>
	<p class="simulation" data-testid="onboarding-simulation-only">FOR SIMULATION ONLY</p>

	<section aria-label="Generate a case">
		<Strip label="A case" icon="desk">
			<label class="pick">
				Layout
				<select bind:value={layoutId} data-testid="onboarding-layout">
					{#each onboardingDesk.layouts as layout (layout.id)}
						<option value={layout.id}>{layout.name}</option>
					{/each}
				</select>
			</label>
			<label class="pick">
				Seed
				<input type="number" min="1" step="1" bind:value={seed} data-testid="onboarding-seed" />
			</label>
			<button type="button" onclick={generate} data-testid="onboarding-generate">Generate</button>
			{#if snapshot && application}
				<Readout label="Applicant" value={snapshot.desk.role} testId="onboarding-role" />
				<Readout label="On file" value={hidden.length} testId="onboarding-hidden-count" />
				<Readout label="Product" value={application.productKind} testId="onboarding-product" />
				<Readout label="Purpose" value={application.purpose} testId="onboarding-purpose" />
			{/if}
		</Strip>
	</section>

	{#if snapshot}
		<div class="panes">
			<section aria-label="On the desk">
				<h2>On the desk</h2>
				<CaseFile {records} testId="onboarding-revealed" />
			</section>
			<section aria-label="On file">
				<h2>On file — what the checks would earn</h2>
				<CaseFile
					records={hidden}
					truth={truth?.records}
					facts={truth?.facts}
					testId="onboarding-hidden"
				/>
			</section>
		</div>
	{/if}

	<section aria-label="The decks">
		<h2>
			The {DECK_WORDS[ONBOARDING_DECKS.length] ?? ONBOARDING_DECKS.length} decks — {onboardingScenarios.length}
			scenarios
		</h2>
		<CaseTable columns={deckColumns} rows={deckRows} testId="onboarding-decks" />
		<p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path (campaignHref above); its typed surface has no way to attach the ?baseline= query the rule can verify statically (the same exception the lending page takes). -->
			<a class="run-campaign" href={campaignHref} data-testid="onboarding-run-campaign"
				>Run this desk’s campaign →</a
			>
		</p>
	</section>

	<div class="panes">
		<section aria-label="The policy cards">
			<h2>The three policy cards</h2>
			<ul class="list" data-testid="onboarding-cards">
				{#each onboardingPolicyCards as card (card.id)}
					<li data-testid="onboarding-card-{card.id.replace('fs-onboarding/policy/', '')}">
						<strong>{card.title}</strong> — {card.description}
					</li>
				{/each}
			</ul>
		</section>
		<section aria-label="The evaluators">
			<h2>The evaluators</h2>
			<ul class="list" data-testid="onboarding-evaluators">
				{#each onboardingEvaluators as evaluator (evaluator.id)}
					<li data-testid="onboarding-evaluator-{evaluator.id.replace('fs-onboarding/', '')}">
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
			The desk bot at the centre with the three cards on its Safety Brick, the desk inside the
			boundary, and the bank’s <code>kyc</code> line outside — the same screening function the
			desk’s truth reads. The build <code>campaigns/fs-onboarding-baseline.json</code> runs under three
			guards, with the tipping-off pair as its gates.
		</p>
		<Boundary {map} testId="onboarding-map" />
	</section>
</main>

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
