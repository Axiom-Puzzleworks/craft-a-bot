<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { validateSpec, type AgentRecord, type BuildProblem, type SlotId } from '@craftabot/core';
	import { capabilitiesOf } from '$lib/bot-capabilities.js';
	import { needsBattery, noBatteryMessage } from '$lib/brain.js';
	import { createRegistry } from '$lib/packs.js';
	import { createDndController } from '$lib/dnd/dnd-state.svelte.js';
	import { agentsStore } from '$lib/state/agents.svelte.js';
	import { benchStore } from '$lib/state/bench.svelte.js';
	import { leafletStore } from '$lib/leaflet/leaflet.svelte.js';
	import { preferences } from '$lib/state/preferences.svelte.js';
	import Announcer from '$lib/components/bench/Announcer.svelte';
	import Baseplate from '$lib/components/bench/Baseplate.svelte';
	import BrickPanel from '$lib/components/bench/BrickPanel.svelte';
	import BuildChecks from '$lib/components/bench/BuildChecks.svelte';
	import GoalCardRack from '$lib/components/bench/GoalCardRack.svelte';
	import PartsTray from '$lib/components/bench/PartsTray.svelte';
	import GoLever from '$lib/components/kit/GoLever.svelte';
	import RobotFriendsLever from '$lib/components/kit/RobotFriendsLever.svelte';
	import RobotFriendsPicker from '$lib/components/kit/RobotFriendsPicker.svelte';

	/**
	 * The Workbench in BUILD mode (03-UI-UX-DESIGN.md §4): parts tray, baseplate,
	 * brick panel, Goal Card rack, build checks, and the GO lever.
	 */

	const registry = createRegistry();
	const agentId = $derived(page.params.agentId ?? '');

	/** Which socket's panel is open — a place on the chassis, not a brick name. */
	let selected = $state<SlotId | undefined>(undefined);
	let announcement = $state('');

	const controller = createDndController({
		onPlace: (kindId) => {
			benchStore.fitBrick(kindId);
			preferences.cue('snap');
			// Open the panel of the socket it went into, whichever that is.
			selected = slotOfKind(kindId);
		},
		onRemove: (slot) => {
			benchStore.removeBrick(slot);
			if (selected === slot) selected = undefined;
		},
		announce: (message) => {
			announcement = message;
		}
	});

	$effect(() => {
		// Opening an agent is async storage work, so it cannot be derived.
		void benchStore.open(agentId);
	});

	// The shelf, for the second-bot picker (WP31, `24-…` §4.6) — the same
	// shared store the Shelf page itself reads, reloaded here so a bot built
	// or finished since this bench opened is offered too.
	$effect(() => {
		void agentsStore.load();
	});

	/** Which socket a registered kind belongs to — asked before it is fitted. */
	function slotOfKind(kindId: string): SlotId {
		const kind = registry.getBrickKind(kindId);
		if (!kind) throw new Error(`No brick kind "${kindId}" is registered.`);
		return kind.slot;
	}

	const spec = $derived(benchStore.spec);
	/** What the bot can do — what the leaflet watches, and where the cartridge is read. */
	const capabilities = $derived(capabilitiesOf(spec, registry));

	/** The brick in the selected socket, with the kind that defines it. */
	const fittedForPanel = $derived(selected ? benchStore.brickFor(selected) : undefined);

	// The leaflet advances by watching what the user builds (03 §6).
	const leaflet = leafletStore();
	$effect(() => {
		if (spec) leaflet.report({ can: capabilities, goalCardId: spec.goalCardId });
	});
	const world = $derived(
		benchStore.goalCard ? registry.getWorld(benchStore.goalCard.worldId) : undefined
	);

	const cartridges = $derived(registry.listCartridges());
	const tools = $derived(registry.listTools());
	const senseChannels = $derived(world?.senses ?? []);
	const worldActions = $derived(world?.actions ?? []);
	// `coop` cards are built for a `SessionGroup`, not this one-robot bench
	// (WP29, `23-MULTI-AGENT-DESIGN.md` §10 stage D) — the Kit's card picker
	// stays exactly what it was before WP29 shipped any of them.
	const goalCards = $derived(registry.listGoalCards().filter((card) => !card.coop));
	const policyCards = $derived(registry.listPolicyCards());

	const cartridge = $derived(registry.getCartridge(capabilities.cartridgeId));
	/**
	 * Not a `BuildProblem`: keys never touch the AgentSpec, so `validateSpec`
	 * cannot know about them. This is a UI-level check at GO time (03 §9).
	 */
	const batteryMissing = $derived(needsBattery(cartridge, registry));
	const batteryMessage = $derived(noBatteryMessage(cartridge, registry));
	const blockingReason = $derived(
		batteryMissing ? batteryMessage : benchStore.blocking[0]?.message
	);

	/**
	 * **The Robot Friends picker** (WP31, `24-…` §4.6) — the coop rack is the
	 * exact *inverse* of `goalCards`' own filter above, over the same
	 * `listGoalCards()` call, never touched twice for different reasons.
	 */
	const coopGoalCards = $derived(registry.listGoalCards().filter((card) => card.coop));

	/**
	 * "GO-ready", asked about a shelf bot that is not the one open here —
	 * `benchStore.canGo`'s own two checks (`validateSpec`'s blocking problems,
	 * plus the battery/cartridge check `validateSpec` cannot see), generalised
	 * to an arbitrary `AgentRecord` rather than the currently-open spec. A bot
	 * that cannot GO solo cannot GO in a duo either (§4.6) — including on the
	 * battery front, which the design doc's own sentence names `validateSpec`
	 * for but does not literally exclude: offering a partner whose own launch
	 * would immediately fail with a battery error is worse than not offering
	 * it at all.
	 */
	function isGoReady(candidate: AgentRecord): boolean {
		const can = capabilitiesOf(candidate.spec, registry);
		const candidateCartridge = registry.getCartridge(can.cartridgeId);
		const blocking = validateSpec(candidate.spec, registry).some(
			(problem) => problem.severity === 'blocking'
		);
		return !blocking && !needsBattery(candidateCartridge, registry);
	}

	const otherReadyBots = $derived(
		agentsStore.agents.filter((candidate) => candidate.id !== agentId && isGoReady(candidate))
	);

	const robotFriendsDisabled = $derived(
		!benchStore.canGo || batteryMissing || otherReadyBots.length === 0
	);
	const robotFriendsReason = $derived(
		!benchStore.canGo || batteryMissing
			? blockingReason
			: otherReadyBots.length === 0
				? 'Build a second robot first'
				: undefined
	);

	let showRobotFriends = $state(false);

	async function launchDuo(goalCardId: string, otherAgentId: string): Promise<void> {
		showRobotFriends = false;
		// Never navigate away with an unsaved edit in flight (`pullGo`'s own reasoning).
		await benchStore.flush();
		const params = new URLSearchParams({ a: agentId, b: otherAgentId, card: goalCardId });
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path here; its typed surface has no way to attach the ?a=&b=&card= query the rule can verify statically (same exception workshop/runs/+page.svelte's own compareHref already takes for the identical shape).
		await goto(`${resolve('/play/duo')}?${params.toString()}`);
	}

	/** Escape cancels a carry; arrows aim it; Enter places it (03 §4.4). */
	function onKeyDown(event: KeyboardEvent): void {
		if (!controller.carrying) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			controller.cancel();
			return;
		}
		if (controller.carrying.mode !== 'keyboard') return;

		if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
			event.preventDefault();
			controller.aim(1);
		} else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
			event.preventDefault();
			controller.aim(-1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			controller.placeAimed();
		}
	}

	function jumpToProblem(problem: BuildProblem): void {
		// Problems have pointed at a chassis socket since slice 3d, and since 4b
		// so does the bench — the translation table that stood here is gone.
		if (problem.slot) selected = problem.slot;
	}

	async function pullGo(): Promise<void> {
		// Never navigate away with an unsaved edit in flight.
		await benchStore.flush();
		await goto(resolve('/play/[agentId]', { agentId }));
	}
</script>

<svelte:head><title>{spec?.name ?? 'Workbench'} — Craft A Bot</title></svelte:head>
<svelte:window onkeydown={onKeyDown} />

<Announcer message={announcement} />

{#if !spec}
	<main class="loading"><p>Opening the box…</p></main>
{:else}
	<main class="bench">
		<header class="bench-head">
			<a class="back" href={resolve('/')}>← Shelf</a>
			<label class="rename">
				<span class="visually-hidden">Bot name</span>
				<input
					data-testid="bot-name"
					value={spec.name}
					oninput={(event) => benchStore.rename(event.currentTarget.value)}
				/>
			</label>
			<button
				type="button"
				class="undo"
				data-testid="undo"
				disabled={!benchStore.canUndo}
				onclick={() => benchStore.undo()}
			>
				Undo
			</button>
		</header>

		<div class="columns">
			<section class="column column--tray" aria-label="Parts tray">
				<PartsTray
					{controller}
					fittedIn={(slot) => benchStore.fittedIn(slot)}
					onselect={(slot) => (selected = slot)}
				/>
			</section>

			<section class="column column--plate" aria-label="Baseplate">
				<Baseplate
					{controller}
					fittedIn={(slot) => benchStore.fittedIn(slot)}
					{selected}
					onselect={(slot) => (selected = slot)}
					onremove={(slot) => {
						benchStore.removeBrick(slot);
						if (selected === slot) selected = undefined;
					}}
				/>

				<BuildChecks problems={benchStore.problems} onjump={jumpToProblem} />

				{#if batteryMissing}
					<p class="battery-notice" data-testid="battery-notice">
						{batteryMessage}
						<a href={resolve('/settings')}>Open the battery compartment</a>
					</p>
				{/if}

				<div class="go-row">
					<RobotFriendsLever
						disabled={robotFriendsDisabled}
						reason={robotFriendsReason}
						onpull={() => (showRobotFriends = true)}
					/>
					<GoLever
						disabled={!benchStore.canGo || batteryMissing}
						reason={blockingReason}
						onpull={pullGo}
					/>
				</div>
			</section>

			<section class="column column--panel" aria-label="Brick panel">
				{#if selected && fittedForPanel && spec}
					<BrickPanel
						brick={fittedForPanel.brick}
						kind={fittedForPanel.kind}
						{spec}
						{cartridges}
						{tools}
						{senseChannels}
						{worldActions}
						{policyCards}
						onupdate={(patch) => selected && benchStore.updateBrick(selected, patch)}
						onremove={() => {
							if (selected) benchStore.removeBrick(selected);
							selected = undefined;
						}}
					/>
				{:else}
					<p class="hint" data-testid="panel-hint">
						Click a fitted brick to open its panel — every one has a flip side explaining what it
						really is.
					</p>
				{/if}
			</section>
		</div>

		<section class="rack" aria-label="Goal cards">
			<GoalCardRack
				cards={goalCards}
				activeCardId={spec.goalCardId}
				customGoalText={spec.customGoalText ?? ''}
				onselect={(cardId) => benchStore.setGoalCard(cardId)}
				oncustomtext={(text) => benchStore.setCustomGoalText(text)}
			/>
		</section>
	</main>
{/if}

{#if showRobotFriends && spec}
	<RobotFriendsPicker
		botName={spec.name}
		{coopGoalCards}
		candidates={otherReadyBots}
		oncancel={() => (showRobotFriends = false)}
		onlaunch={(goalCardId, otherAgentId) => void launchDuo(goalCardId, otherAgentId)}
	/>
{/if}

<style>
	.bench {
		max-width: 1280px;
		margin-inline: auto;
		padding: var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-4);
	}

	.loading {
		padding: var(--cab-space-7);
		text-align: center;
	}

	.bench-head {
		display: flex;
		align-items: center;
		gap: var(--cab-space-3);
	}

	.back {
		color: var(--cab-blue-text);
		font-size: var(--cab-text-sm);
		text-decoration: none;
		font-weight: 600;
	}

	.back:focus-visible,
	.undo:focus-visible,
	.rename input:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.rename {
		flex: 1;
	}

	/*
	 * Visibly a text field at rest, not only on hover — a border that only
	 * appeared on hover read as a static heading, and this is the one place in
	 * the whole app a bot's name can actually be changed (a real user found it
	 * this way, WP22-adjacent feedback). The pencil is a second, redundant cue
	 * for the same reason a hover-only affordance is not enough on a touch
	 * screen, which has no hover at all.
	 */
	.rename {
		flex: 1;
		position: relative;
	}

	.rename input {
		width: 100%;
		font: inherit;
		font-size: var(--cab-text-lg);
		font-weight: 700;
		padding: var(--cab-space-1) calc(var(--cab-space-6) + var(--cab-space-1)) var(--cab-space-1)
			var(--cab-space-2);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: 6px;
		color: inherit;
	}

	.rename input:hover,
	.rename input:focus {
		border-color: var(--cab-ink);
	}

	.rename::after {
		content: '✎';
		position: absolute;
		top: 50%;
		right: var(--cab-space-3);
		transform: translateY(-50%);
		font-size: var(--cab-text-sm);
		color: var(--cab-ink-muted);
		pointer-events: none;
	}

	.undo {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: var(--cab-space-1) var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.undo:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(150px, 200px) minmax(0, 1fr) minmax(230px, 320px);
		gap: var(--cab-space-4);
		align-items: start;
	}

	.column {
		display: grid;
		gap: var(--cab-space-3);
		min-width: 0;
	}

	.go-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--cab-space-3);
	}

	.battery-notice {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: color-mix(in srgb, var(--cab-yellow) 28%, var(--cab-cream));
		border: var(--cab-border-part) solid var(--cab-yellow);
		border-radius: var(--cab-radius-panel);
	}

	.battery-notice a {
		color: var(--cab-blue-text);
		font-weight: 600;
	}

	.hint {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		background: var(--cab-cream);
		border: var(--cab-border-part) dashed color-mix(in srgb, var(--cab-ink) 30%, transparent);
		border-radius: var(--cab-radius-panel);
		opacity: 0.85;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	/* Below 1100px the tray becomes a row above the bench (03 §10). */
	@media (max-width: 1100px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
