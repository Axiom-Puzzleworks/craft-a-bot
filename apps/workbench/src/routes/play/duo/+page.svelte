<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LLMProvider } from '@craftabot/core';
	import { capabilitiesOf } from '$lib/bot-capabilities.js';
	import { chooseBrain, noBatteryMessage } from '$lib/brain.js';
	import { createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import {
		createGroupSessionView,
		type GroupSessionView
	} from '$lib/state/session-group.svelte.js';
	import ApprovalCard from '$lib/components/play/ApprovalCard.svelte';
	import RunControls from '$lib/components/play/RunControls.svelte';
	import ThoughtBubble from '$lib/components/play/ThoughtBubble.svelte';
	import WorldView from '$lib/components/play/WorldView.svelte';

	/**
	 * **The Playroom, for two** (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.3, §10
	 * stage B) — the same `WorldView` the solo Kit plays in, fed by
	 * `createGroupSessionView` instead of `createSessionView`, over a real
	 * `SessionGroup`.
	 *
	 * Reached as `/play/duo?a=<agentId>&b=<agentId>&card=<goalCardId>` — query
	 * params, mirroring the Workshop Compare view's own `?a=&b=` convention
	 * (`workshop/compare/+page.svelte`) rather than inventing a second one for
	 * "exactly two ids" in one route.
	 *
	 * **No picker yet.** Stage E adds the Robot Friends bench lever that builds
	 * this URL; this stage is reached by typing it (or a test navigating
	 * directly), so that this stage's own risk — live two-robot rendering — is
	 * proven on its own before the picker's risk (shelf-filtering UX) is added
	 * on top (`24-…` §10).
	 */

	const registry = createRegistry();
	const agentIdA = $derived(page.url.searchParams.get('a') ?? '');
	const agentIdB = $derived(page.url.searchParams.get('b') ?? '');
	const goalCardId = $derived(page.url.searchParams.get('card') ?? '');

	let view = $state<GroupSessionView | undefined>(undefined);
	let busy = $state(false);
	/** Set once loading fails for a reason worth telling the player about. */
	let loadError = $state<string | undefined>(undefined);

	const goalCard = $derived(goalCardId ? registry.getGoalCard(goalCardId) : undefined);

	$effect(() => {
		void load(agentIdA, agentIdB, goalCardId);
	});

	async function load(idA: string, idB: string, cardId: string): Promise<void> {
		loadError = undefined;
		view = undefined;

		if (!idA || !idB || !cardId) {
			loadError = 'This link is missing a robot or a card.';
			return;
		}
		if (idA === idB) {
			loadError = 'Robot Friends needs two different robots.';
			return;
		}

		const storage = await appStorage();
		const [a, b] = await Promise.all([storage.getAgent(idA), storage.getAgent(idB)]);
		if (!a || !b) {
			loadError = 'One of these robots is not on the shelf any more.';
			return;
		}

		const card = registry.getGoalCard(cardId);
		if (!card) {
			loadError = `"${cardId}" is not a card this build knows.`;
			return;
		}

		/*
		 * Launch-time snapshots, never the shelf's own spec (`24-…` §4.1): the
		 * goal card is overridden for this run only, and neither bot's own
		 * stored record is ever written to. `SessionGroup` itself would refuse
		 * two members whose specs name different cards, so both snapshots
		 * agree on `cardId` by construction, not by coincidence.
		 */
		const launches = [a, b].map((record) => {
			const spec = { ...record.spec, goalCardId: cardId };
			const can = capabilitiesOf(spec, registry);
			const cartridge = registry.getCartridge(can.cartridgeId);
			const brain = chooseBrain(cartridge, cardId, registry, can);
			return { record, spec, cartridge, brain };
		});

		const missingBattery = launches.find((launch) => !launch.brain.ok);
		if (missingBattery) {
			loadError = `${missingBattery.record.spec.name}: ${noBatteryMessage(missingBattery.cartridge, registry)}`;
			return;
		}

		view = createGroupSessionView({
			members: launches.map((launch) => ({
				spec: launch.spec,
				provider: (launch.brain as { ok: true; provider: LLMProvider }).provider
			})),
			goalCardId: cardId
		});
	}

	/** The member whose own turn `WorldView` should foreground right now (`23-…` §4.3). */
	const foregrounded = $derived(
		view?.members.find((member) => member.agentId === view?.foregroundedAgentId)
	);

	async function step(): Promise<void> {
		if (!view) return;
		busy = true;
		try {
			await view.stepRound();
		} finally {
			busy = false;
		}
	}

	function play(): void {
		view?.start('play');
	}

	function pause(): void {
		view?.pause();
	}

	function stop(): void {
		view?.stop();
	}
</script>

<svelte:head><title>Playroom — Robot Friends</title></svelte:head>

{#if loadError}
	<main class="loading">
		<p data-testid="duo-load-error">{loadError}</p>
		<a href={resolve('/')}>← Back to the shelf</a>
	</main>
{:else if !view}
	<main class="loading"><p>Fetching your robots…</p></main>
{:else}
	<main class="play" data-testid="duo-play">
		{#if goalCard}
			<p class="goal" data-testid="duo-goal">{goalCard.goalText}</p>
		{/if}

		<div class="stage">
			<section class="world" aria-label="The Playroom">
				<WorldView
					world={view.world}
					saying={foregrounded?.saying}
					expression={foregrounded?.expression ?? 'idle'}
					outcome={view.outcome}
					events={foregrounded?.events ?? []}
				/>
			</section>

			<aside class="side">
				{#if view.pendingApproval}
					{@const asking = view.members.find(
						(member) => member.agentId === view?.pendingApproval?.agentId
					)}
					<ApprovalCard
						approval={view.pendingApproval}
						botName={asking?.name ?? 'A robot'}
						onallow={() => view?.resolveApproval(view.pendingApproval?.agentId ?? '', true)}
						ondeny={() => view?.resolveApproval(view.pendingApproval?.agentId ?? '', false)}
					/>
				{/if}

				{#each view.members as member (member.agentId)}
					<div class="member" data-testid="member-{member.agentId}">
						<h2>{member.name}</h2>
						<ThoughtBubble thought={member.thought} narration={member.narration} />
						<p class="tick" data-testid="member-tick-{member.agentId}">Turn {member.tick}</p>
						{#if member.outcome}
							<p
								class="outcome"
								data-outcome={member.outcome}
								data-testid="member-outcome-{member.agentId}"
							>
								{member.outcome}
							</p>
						{/if}
					</div>
				{/each}

				<RunControls
					running={view.status === 'running'}
					finished={view.outcome !== undefined}
					{busy}
					speed={1}
					onstep={step}
					onplay={play}
					onpause={pause}
					onstop={stop}
				/>

				<a class="back" href={resolve('/')}>← Back to the shelf</a>
			</aside>
		</div>

		{#if view.outcome}
			<!--
				A plain banner, not the solo Play route's EndCard modal — that
				component's own hint copy is written against one bot's own trace
				(`end-card-hint.ts`), and a proper duo ending is a later polish
				pass, not this stage's job (`24-…` §10 stage B).
			-->
			<p class="finished" role="status" data-testid="duo-finished">
				The adventure is over: <strong data-outcome={view.outcome}>{view.outcome}</strong>
			</p>
		{/if}
	</main>
{/if}

<style>
	.loading {
		padding: var(--cab-space-7);
		text-align: center;
		display: grid;
		gap: var(--cab-space-3);
	}

	.play {
		max-width: 1280px;
		margin-inline: auto;
		padding: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	.goal {
		margin: 0;
		font-size: var(--cab-text-base);
		font-weight: 600;
	}

	.stage {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
		gap: var(--cab-space-4);
		align-items: start;
	}

	.side {
		display: grid;
		gap: var(--cab-space-3);
	}

	.member {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
	}

	.member h2 {
		margin: 0;
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.tick {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.outcome {
		margin: 0;
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.outcome[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.finished {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	.finished strong[data-outcome='SUCCESS'] {
		color: var(--cab-green-text);
	}

	.back {
		color: var(--cab-blue-text);
		font-size: var(--cab-text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.back:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	@media (max-width: 1000px) {
		.stage {
			grid-template-columns: 1fr;
		}
	}
</style>
