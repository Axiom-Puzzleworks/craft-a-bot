<script lang="ts">
	import type { BrickKind } from '$lib/bricks.js';

	/**
	 * Placeholder brick art (11-VISUAL-ASSET-MANIFEST.md §9 — "placeholder
	 * (already in app, from WP5) → draft PR with asset → swap-in"). Crude
	 * geometry, but the two things that must already be right are right:
	 * the token colour, and a **distinct silhouette per kind** (04 §7), because
	 * colour is never allowed to carry meaning on its own. Squint, or drop it to
	 * greyscale, and the six shapes are still tellable apart.
	 *
	 * Footprints follow 11 §2.1, expressed in the stud unit so the real assets
	 * drop straight in.
	 */
	interface Props {
		kind: BrickKind;
		/** Rendered inside the socket rather than in the tray — slightly flatter. */
		fitted?: boolean;
		label?: string;
	}

	let { kind, fitted = false, label }: Props = $props();

	/** width × height in stud units, per 11 §2.1. */
	const FOOTPRINTS: Record<BrickKind, [number, number]> = {
		llm: [3, 2.5],
		memory: [2, 2],
		tools: [3, 1.5],
		sense: [3, 1],
		actions: [4, 1.5],
		safety: [2, 2]
	};

	const size = $derived(FOOTPRINTS[kind]);
	const viewWidth = $derived(size[0] * 24);
	const viewHeight = $derived(size[1] * 24);
</script>

<svg
	class="brick brick--{kind}"
	class:brick--fitted={fitted}
	viewBox="0 0 {viewWidth} {viewHeight}"
	role="presentation"
	aria-hidden="true"
>
	<defs>
		<linearGradient id="sheen-{kind}" x1="0" y1="0" x2="0.6" y2="1">
			<stop offset="0%" stop-color="var(--cab-plastic-hi)" />
			<stop offset="55%" stop-color="transparent" />
		</linearGradient>
	</defs>

	{#if kind === 'llm'}
		<!-- Head block with antenna -->
		<line x1={viewWidth / 2} y1="2" x2={viewWidth / 2} y2="16" class="wire" />
		<circle cx={viewWidth / 2} cy="5" r="4" class="fill" />
		<rect x="4" y="14" width={viewWidth - 8} height={viewHeight - 18} rx="12" class="fill" />
		<circle cx={viewWidth / 2 - 14} cy={viewHeight - 22} r="4" class="eye" />
		<circle cx={viewWidth / 2 + 14} cy={viewHeight - 22} r="4" class="eye" />
	{:else if kind === 'memory'}
		<!-- Satchel with a flap -->
		<rect x="3" y="12" width={viewWidth - 6} height={viewHeight - 15} rx="12" class="fill" />
		<path
			d="M3 20 h{viewWidth - 6} v-6 a12 12 0 0 0 -12 -8 h-{viewWidth - 30} a12 12 0 0 0 -12 8 z"
			class="fill"
		/>
		<rect x={viewWidth / 2 - 6} y="18" width="12" height="9" rx="3" class="detail" />
	{:else if kind === 'tools'}
		<!-- Belt with hanging loops -->
		<rect x="2" y="4" width={viewWidth - 4} height="16" rx="8" class="fill" />
		{#each [0.25, 0.5, 0.75] as at (at)}
			<rect x={viewWidth * at - 4} y="18" width="8" height={viewHeight - 22} rx="4" class="fill" />
		{/each}
	{:else if kind === 'sense'}
		<!-- Visor strip with lens bumps -->
		<rect x="2" y="4" width={viewWidth - 4} height={viewHeight - 8} rx="9" class="fill" />
		{#each [0.3, 0.5, 0.7] as at (at)}
			<circle cx={viewWidth * at} cy={viewHeight / 2} r="4" class="eye" />
		{/each}
	{:else if kind === 'actions'}
		<!-- Wheeled base, wheels overhanging -->
		<rect x="8" y="2" width={viewWidth - 16} height={viewHeight - 14} rx="10" class="fill" />
		<circle cx="14" cy={viewHeight - 9} r="8" class="wheel" />
		<circle cx={viewWidth - 14} cy={viewHeight - 9} r="8" class="wheel" />
	{:else}
		<!-- Chevron-striped shield -->
		<path
			d="M{viewWidth / 2} 2 L{viewWidth - 3} 10 v{viewHeight * 0.4} a{viewWidth / 2} {viewHeight /
				2} 0 0 1 -{viewWidth / 2 - 3} {viewHeight * 0.45} a{viewWidth / 2} {viewHeight /
				2} 0 0 1 -{viewWidth / 2 - 3} -{viewHeight * 0.45} v-{viewHeight * 0.4} z"
			class="fill"
		/>
		{#each [0, 1, 2] as index (index)}
			<path d="M{viewWidth / 2 - 12} {14 + index * 9} l12 6 l12 -6" class="chevron" fill="none" />
		{/each}
	{/if}

	<rect
		x="0"
		y="0"
		width={viewWidth}
		height={viewHeight}
		fill="url(#sheen-{kind})"
		pointer-events="none"
	/>
</svg>

{#if label}
	<span class="embossed">{label}</span>
{/if}

<style>
	.brick {
		display: block;
		width: 100%;
		height: auto;
		filter: drop-shadow(var(--cab-drop-shadow));
	}

	.fill {
		fill: var(--brick-colour);
		stroke: var(--cab-ink);
		stroke-width: 2;
		stroke-opacity: 0.25;
	}

	.wire {
		stroke: var(--cab-ink);
		stroke-width: 3;
		stroke-opacity: 0.55;
	}

	.eye,
	.detail {
		fill: var(--cab-cream);
		fill-opacity: 0.9;
	}

	.wheel {
		fill: var(--cab-ink);
		fill-opacity: 0.75;
	}

	.chevron {
		stroke: var(--cab-ink);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.brick--llm {
		--brick-colour: var(--cab-brick-llm);
	}
	.brick--memory {
		--brick-colour: var(--cab-brick-memory);
	}
	.brick--tools {
		--brick-colour: var(--cab-brick-tools);
	}
	.brick--sense {
		--brick-colour: var(--cab-brick-sense);
	}
	.brick--actions {
		--brick-colour: var(--cab-brick-actions);
	}
	.brick--safety {
		--brick-colour: var(--cab-brick-safety);
	}

	.brick--fitted {
		filter: none;
	}

	.embossed {
		display: block;
		text-align: center;
		font-size: var(--cab-text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--cab-ink);
		margin-top: var(--cab-space-1);
	}
</style>
