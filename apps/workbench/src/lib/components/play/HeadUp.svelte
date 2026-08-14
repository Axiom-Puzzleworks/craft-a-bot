<script lang="ts">
	import type { LampState } from '$lib/state/session.svelte.js';
	import { safetyWords, type SafetyTally } from '$lib/safety-tally.js';

	/**
	 * The head-up bar (03-UI-UX-DESIGN.md §5.1): the bot's name and goal, steps
	 * left as a battery gauge, a token meter, and the status lamp.
	 *
	 * Every lamp colour is paired with its word — colour never carries meaning on
	 * its own (03 §8).
	 */
	interface Props {
		botName: string;
		goalText: string;
		tick: number;
		maxTicks: number;
		usage: { inputTokens: number; outputTokens: number };
		lamp: LampState;
		/** What the Safety Brick has done this run (`16-…` §2.1). */
		safety?: SafetyTally;
	}

	let {
		botName,
		goalText,
		tick,
		maxTicks,
		usage,
		lamp,
		safety = { checks: 0, saves: 0 }
	}: Props = $props();

	const safetyLine = $derived(safetyWords(safety));

	const stepsLeft = $derived(Math.max(0, maxTicks - tick));
	const segments = 10;
	const litSegments = $derived(Math.ceil((stepsLeft / maxTicks) * segments));
	const totalTokens = $derived(usage.inputTokens + usage.outputTokens);

	const LAMP_WORDS: Record<LampState, string> = {
		idle: 'Ready',
		thinking: 'Thinking',
		acting: 'Acting',
		paused: 'Paused',
		tripped: 'Stopped by a safety rule',
		finished: 'Finished'
	};
</script>

<header class="headup" data-testid="head-up">
	<div class="who">
		<span class="face" aria-hidden="true">🤖</span>
		<div>
			<p class="name">{botName}</p>
			<p class="goal" data-testid="headup-goal">{goalText}</p>
		</div>
	</div>

	<div class="gauges">
		<div class="gauge">
			<span class="gauge-label">Steps left</span>
			<span class="battery" data-testid="steps-gauge" aria-hidden="true">
				{#each Array.from({ length: segments }, (_value, index) => index) as index (index)}
					<span
						class="segment"
						class:segment--lit={index < litSegments}
						class:segment--low={index < litSegments && litSegments <= 2}
					></span>
				{/each}
			</span>
			<span class="gauge-value" data-testid="steps-left">{stepsLeft} of {maxTicks}</span>
		</div>

		<div class="gauge">
			<span class="gauge-label">Tokens</span>
			<span class="gauge-value" data-testid="token-meter">{totalTokens}</span>
		</div>

		{#if safetyLine}
			<!--
				Governance made visible (`16-…` §2.1). A run where the Safety Brick
				checked fourteen times and stopped nothing looks, without this,
				exactly like a run with no safety brick at all — and the successful
				case is the one worth showing a child.

				`data-saves` drives the flash on a save; the count itself is keyed so
				the animation restarts each time it changes.
			-->
			<p
				class="safety"
				class:safety--saved={safety.saves > 0}
				data-testid="safety-ticker"
				data-checks={safety.checks}
				data-saves={safety.saves}
			>
				<span class="shield" aria-hidden="true">🛡</span>
				<span class="safety-words">Safety brick: {safetyLine}</span>
			</p>
		{/if}

		<p class="lamp lamp--{lamp}" data-testid="status-lamp" data-lamp={lamp}>
			<span class="bulb" aria-hidden="true"></span>
			{LAMP_WORDS[lamp]}
		</p>
	</div>
</header>

<style>
	.headup {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-4);
		flex-wrap: wrap;
		padding: var(--cab-space-3);
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-blue);
		border-radius: var(--cab-radius-panel);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--cab-space-3);
		min-width: 0;
	}

	.face {
		font-size: 32px;
	}

	.name {
		margin: 0;
		font-size: var(--cab-text-lg);
		font-weight: 700;
	}

	.goal {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.85;
	}

	.gauges {
		display: flex;
		align-items: center;
		gap: var(--cab-space-4);
		flex-wrap: wrap;
	}

	.gauge {
		display: grid;
		gap: 2px;
		justify-items: start;
	}

	.gauge-label {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.7;
	}

	.gauge-value {
		font-size: var(--cab-text-sm);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	/* Segmented battery bar with the classic red end zone (04 §5). */
	.battery {
		display: flex;
		gap: 2px;
		padding: 2px;
		border: 2px solid var(--cab-ink);
		border-radius: 4px;
	}

	.segment {
		width: 7px;
		height: 12px;
		border-radius: 1px;
		background: color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	.segment--lit {
		background: var(--cab-green);
	}

	.segment--low {
		background: var(--cab-red);
	}

	.safety {
		display: flex;
		align-items: center;
		gap: var(--cab-space-1);
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		font-size: var(--cab-text-xs);
		font-weight: 600;
		color: var(--cab-ink);
		background: var(--cab-cream);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-pill);
	}

	/* A save is the brick's whole reason for existing, so it gets the colour. */
	.safety--saved {
		background: var(--cab-yellow);
	}

	.lamp {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		margin: 0;
		font-size: var(--cab-text-sm);
		font-weight: 600;
	}

	.bulb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--cab-ink);
		background: var(--lamp-colour, transparent);
	}

	.lamp--idle {
		--lamp-colour: color-mix(in srgb, var(--cab-ink) 20%, transparent);
	}
	.lamp--thinking {
		--lamp-colour: var(--cab-yellow);
	}
	.lamp--acting {
		--lamp-colour: var(--cab-green);
	}
	.lamp--paused {
		--lamp-colour: var(--cab-sky);
	}
	.lamp--tripped {
		--lamp-colour: var(--cab-red);
	}
	.lamp--finished {
		--lamp-colour: var(--cab-blue);
	}

	.lamp--thinking .bulb {
		animation: pulse 900ms ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lamp--thinking .bulb {
			animation: none;
		}
	}
</style>
