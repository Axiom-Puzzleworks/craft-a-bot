<script lang="ts">
	import type { SlotId } from '@craftabot/core';

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
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4b):** takes a **kind id and a socket**
	 * > rather than one of V1's six brick names, because the tray is filled from
	 * > the registry now and a brick may come from a pack this app has never seen.
	 * >
	 * > A kind with no art gets the **generic moulded shape**, tinted by socket.
	 * > That is a deliberate answer to a real tension with 04 §7: there is no
	 * > silhouette to give it, and borrowing the one belonging to the socket's
	 * > starter brick would be worse than none — a Monitor drawn as a shield
	 * > *says* it is the Safety Brick. So the tint places it (governance goes in
	 * > the chest) and the kind's printed name distinguishes it, which keeps
	 * > colour from carrying the meaning alone. When an expansion pack ships art,
	 * > `11-…` §9's swap-in is where it lands.
	 */
	interface Props {
		/** Which registered kind — its art, if this app has any for it. */
		kindId: string;
		/** Which socket it belongs in — its colour, and its fallback shape. */
		slot: SlotId;
		/** Rendered inside the socket rather than in the tray — slightly flatter. */
		fitted?: boolean;
		label?: string;
	}

	let { kindId, slot, fitted = false, label }: Props = $props();

	/**
	 * The six the kit ships with, by kind id.
	 *
	 * A lookup rather than a `SlotId` switch on purpose: art belongs to a *brick*,
	 * not to a hole in the chassis, and a second brain brick would want its own.
	 */
	const ART: Record<string, string> = {
		'starter/llm': 'llm',
		'starter/memory': 'memory',
		'starter/tools': 'tools',
		'starter/sense': 'sense',
		'starter/actions': 'actions',
		'starter/safety': 'safety'
	};

	/** width × height in stud units, per 11 §2.1. */
	const FOOTPRINTS: Record<string, [number, number]> = {
		llm: [3, 2.5],
		memory: [2, 2],
		tools: [3, 1.5],
		sense: [3, 1],
		actions: [4, 1.5],
		safety: [2, 2],
		/** The generic brick: a plain 3×2 block, the most ordinary thing in the box. */
		generic: [3, 2]
	};

	const art = $derived(ART[kindId] ?? 'generic');
	const size = $derived(FOOTPRINTS[art] ?? FOOTPRINTS.generic);
	const viewWidth = $derived((size?.[0] ?? 3) * 24);
	const viewHeight = $derived((size?.[1] ?? 2) * 24);
	/** Unique per instance: two bricks on screen must not share a gradient id. */
	const sheenId = $props.id();
</script>

<svg
	class="brick brick--{slot}"
	class:brick--fitted={fitted}
	viewBox="0 0 {viewWidth} {viewHeight}"
	role="presentation"
	aria-hidden="true"
>
	<defs>
		<linearGradient id="sheen-{sheenId}" x1="0" y1="0" x2="0.6" y2="1">
			<stop offset="0%" stop-color="var(--cab-plastic-hi)" />
			<stop offset="55%" stop-color="transparent" />
		</linearGradient>
	</defs>

	{#if art === 'llm'}
		<!-- Head block with antenna -->
		<line x1={viewWidth / 2} y1="2" x2={viewWidth / 2} y2="16" class="wire" />
		<circle cx={viewWidth / 2} cy="5" r="4" class="fill" />
		<rect x="4" y="14" width={viewWidth - 8} height={viewHeight - 18} rx="12" class="fill" />
		<circle cx={viewWidth / 2 - 14} cy={viewHeight - 22} r="4" class="eye" />
		<circle cx={viewWidth / 2 + 14} cy={viewHeight - 22} r="4" class="eye" />
	{:else if art === 'memory'}
		<!-- Satchel with a flap -->
		<rect x="3" y="12" width={viewWidth - 6} height={viewHeight - 15} rx="12" class="fill" />
		<path
			d="M3 20 h{viewWidth - 6} v-6 a12 12 0 0 0 -12 -8 h-{viewWidth - 30} a12 12 0 0 0 -12 8 z"
			class="fill"
		/>
		<rect x={viewWidth / 2 - 6} y="18" width="12" height="9" rx="3" class="detail" />
	{:else if art === 'tools'}
		<!-- Belt with hanging loops -->
		<rect x="2" y="4" width={viewWidth - 4} height="16" rx="8" class="fill" />
		{#each [0.25, 0.5, 0.75] as at (at)}
			<rect x={viewWidth * at - 4} y="18" width="8" height={viewHeight - 22} rx="4" class="fill" />
		{/each}
	{:else if art === 'sense'}
		<!-- Visor strip with lens bumps -->
		<rect x="2" y="4" width={viewWidth - 4} height={viewHeight - 8} rx="9" class="fill" />
		{#each [0.3, 0.5, 0.7] as at (at)}
			<circle cx={viewWidth * at} cy={viewHeight / 2} r="4" class="eye" />
		{/each}
	{:else if art === 'actions'}
		<!-- Wheeled base, wheels overhanging -->
		<rect x="8" y="2" width={viewWidth - 16} height={viewHeight - 14} rx="10" class="fill" />
		<circle cx="14" cy={viewHeight - 9} r="8" class="wheel" />
		<circle cx={viewWidth - 14} cy={viewHeight - 9} r="8" class="wheel" />
	{:else if art === 'safety'}
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
	{:else}
		<!-- A brick this app has no art for: a plain block with studs on top. -->
		<rect x="3" y="8" width={viewWidth - 6} height={viewHeight - 11} rx="8" class="fill" />
		{#each [0.25, 0.5, 0.75] as at (at)}
			<rect x={viewWidth * at - 7} y="3" width="14" height="9" rx="4" class="fill" />
		{/each}
	{/if}

	<rect
		x="0"
		y="0"
		width={viewWidth}
		height={viewHeight}
		fill="url(#sheen-{sheenId})"
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

	.brick--brain {
		--brick-colour: var(--cab-brick-slot-brain);
	}
	.brick--planner {
		--brick-colour: var(--cab-brick-slot-planner);
	}
	.brick--reflexes {
		--brick-colour: var(--cab-brick-slot-reflexes);
	}
	.brick--memory {
		--brick-colour: var(--cab-brick-slot-memory);
	}
	.brick--equipment {
		--brick-colour: var(--cab-brick-slot-equipment);
	}
	.brick--perception {
		--brick-colour: var(--cab-brick-slot-perception);
	}
	.brick--mobility {
		--brick-colour: var(--cab-brick-slot-mobility);
	}
	.brick--safety {
		--brick-colour: var(--cab-brick-slot-safety);
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
