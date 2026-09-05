<script lang="ts">
	import type { BoundaryMap, BoundaryOutside } from '@craftabot/governance/reports';
	import { litEdgesAt } from '@craftabot/governance/reports';

	/**
	 * **Boundary** (WP57 stage C, `44-CONTROL-ROOM.md` §4.5): the map, drawn
	 * as concentric regions on graph paper. The chassis at the centre with
	 * its bricks in the colour law; the ring made of the safety stack, the
	 * egress gate and the approval gate; the world and each counterpart
	 * inside; providers, guard services, evaluators, sinks and lines
	 * outside, each edge labelled with its hosts and what it sends, a
	 * credential drawn as a key. With `tick` given, the edges whose activity
	 * is at that tick are lit — the scrubber's own question.
	 *
	 * One of the three components allowed an `<svg>`. Every node and edge
	 * carries a test id and a text label; the whole is an image with a
	 * sentence, and the list beneath it is the complete truth for a reader.
	 */
	interface Props {
		map: BoundaryMap;
		tick?: number | undefined;
		testId?: string;
	}

	let { map, tick, testId = 'boundary' }: Props = $props();

	const W = 760;
	const H = 520;
	const CX = W / 2;
	const CY = 260;
	const RING = 128;
	const INSIDE = 104;
	const OUTER = 226;

	/** Where each kind lives around the ring, in degrees (0 = right, 90 = up). */
	const ANGLE: Record<BoundaryOutside['kind'], number> = {
		provider: 90,
		'guard-service': 20,
		pdp: -10,
		evaluator: -50,
		sink: -90,
		'evidence-store': -130,
		'service-line': 180
	};

	const polar = (deg: number, r: number) => ({
		x: CX + r * Math.cos((deg * Math.PI) / 180),
		y: CY - r * Math.sin((deg * Math.PI) / 180)
	});

	const lit = $derived(tick === undefined ? new Set<string>() : litEdgesAt(map, tick));
	const edgeFor = (entry: BoundaryOutside): string =>
		entry.kind === 'provider' ? 'provider' : `${entry.kind}:${entry.id}`;

	/** Outside nodes fanned around their kind's angle, siblings 22° apart. */
	const nodes = $derived.by(() => {
		const byKind: Array<[BoundaryOutside['kind'], BoundaryOutside[]]> = [];
		for (const entry of map.outside) {
			const found = byKind.find(([kind]) => kind === entry.kind);
			if (found) found[1].push(entry);
			else byKind.push([entry.kind, [entry]]);
		}
		const placed: Array<{
			entry: BoundaryOutside;
			edge: string;
			at: { x: number; y: number };
			ring: { x: number; y: number };
			lit: boolean;
			flagged: boolean;
		}> = [];
		for (const [kind, list] of byKind) {
			const base = ANGLE[kind];
			list.forEach((entry, index) => {
				const deg = base + (index - (list.length - 1) / 2) * 22;
				const edge = edgeFor(entry);
				placed.push({
					entry,
					edge,
					at: polar(deg, OUTER),
					ring: polar(deg, RING),
					lit: lit.has(edge),
					flagged: (map.activity ?? []).some(
						(a) => a.edge === edge && a.verdict === 'outside-egress'
					)
				});
			});
		}
		return placed;
	});

	const human = polar(225, RING);
	const worldAt = { x: CX, y: CY + 62 };
	const counterpartsAt = $derived(
		map.inside.counterparts.map((c, index) => ({
			...c,
			at: { x: CX + 70 + index * 10, y: CY + 30 + index * 26 }
		}))
	);

	const SLOT_TOKEN: Record<string, string> = {
		brain: 'var(--cab-brick-slot-brain)',
		planner: 'var(--cab-brick-slot-planner)',
		memory: 'var(--cab-brick-slot-memory)',
		equipment: 'var(--cab-brick-slot-equipment)',
		perception: 'var(--cab-brick-slot-perception)',
		mobility: 'var(--cab-brick-slot-mobility)',
		reflexes: 'var(--cab-brick-slot-reflexes)',
		safety: 'var(--cab-brick-slot-safety)'
	};

	const sentence = $derived.by(() => {
		const parts = [
			`${map.agent.name} at the centre of its boundary.`,
			`On the ring: ${map.boundary.safetyStack.length} safety brick${map.boundary.safetyStack.length === 1 ? '' : 's'}, an egress gate ${map.boundary.egress.mode ? `set to ${map.boundary.egress.mode}` : 'not yet named'} with ${map.boundary.egress.hosts.length} host${map.boundary.egress.hosts.length === 1 ? '' : 's'}, and approval ${map.boundary.approval.mode}.`,
			map.inside.world
				? `Inside: the ${map.inside.world.view === 'desk' ? 'desk' : 'room'} ${map.inside.world.name}` +
					(map.inside.counterparts.length > 0
						? ` and ${map.inside.counterparts.length} counterpart${map.inside.counterparts.length === 1 ? '' : 's'}.`
						: '.')
				: 'Inside: no world.',
			`Outside: ${map.outside.length === 0 ? 'nothing' : map.outside.map((o) => `${o.kind} ${o.name}`).join(', ')}.`,
			`${map.human.approvals} approval${map.human.approvals === 1 ? '' : 's'} crossed to a person.`
		];
		if (tick !== undefined)
			parts.push(`At turn ${tick}, lit: ${[...lit].join(', ') || 'nothing'}.`);
		return parts.join(' ');
	});

	const hostsLabel = (entry: BoundaryOutside): string =>
		entry.hosts.length === 0 ? 'local' : entry.hosts.join(', ');
</script>

<figure class="boundary" data-testid={testId} data-tick={tick}>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={sentence}>
		<!-- edges first, under everything -->
		{#each nodes as node (node.edge)}
			<line
				x1={node.at.x}
				y1={node.at.y}
				x2={node.ring.x}
				y2={node.ring.y}
				class="edge"
				class:edge--local={node.entry.hosts.length === 0}
				class:edge--flagged={node.flagged}
				data-testid="{testId}-edge-{node.edge}"
				data-lit={node.lit}
			/>
		{/each}

		<!-- the ring: the boundary -->
		<circle cx={CX} cy={CY} r={RING} class="ring" />
		<circle cx={CX} cy={CY} r={INSIDE} class="inside" />
		<text x={CX} y={CY - RING - 8} text-anchor="middle" class="lbl">
			safety stack · {map.boundary.safetyStack.map((b) => b.name).join(' · ') || 'none'}
		</text>
		{#each [polar(-30, RING)] as gate (gate.x)}
			<rect
				x={gate.x - 6}
				y={gate.y - 6}
				width="12"
				height="12"
				class="gate"
				class:gate--closed={map.boundary.egress.mode === 'none'}
				data-testid="{testId}-egress"
			/>
			<text x={gate.x + 12} y={gate.y + 4} class="lbl"
				>egress {map.boundary.egress.mode ?? 'declared by the build'} · {map.boundary.egress.hosts
					.length} host{map.boundary.egress.hosts.length === 1 ? '' : 's'}</text
			>
		{/each}

		<!-- the human on the ring -->
		<circle
			cx={human.x}
			cy={human.y}
			r="14"
			class="node"
			class:node--lit={lit.has('human')}
			data-testid="{testId}-edge-human"
			data-lit={lit.has('human')}
		/>
		<text x={human.x} y={human.y + 5} text-anchor="middle" class="glyph">🙋</text>
		<text x={human.x} y={human.y + 30} text-anchor="middle" class="lbl"
			>approval {map.boundary.approval.mode} · {map.human.approvals}</text
		>

		<!-- inside: the world and the counterparts -->
		{#if map.inside.world}
			<rect
				x={worldAt.x - 52}
				y={worldAt.y - 14}
				width="104"
				height="28"
				rx="4"
				class="node"
				class:node--lit={lit.has('world')}
				data-testid="{testId}-edge-world"
				data-lit={lit.has('world')}
			/>
			<text x={worldAt.x} y={worldAt.y + 4} text-anchor="middle" class="lbl"
				>{map.inside.world.view === 'desk' ? 'desk' : 'room'} · {map.inside.world.name}</text
			>
		{/if}
		{#each counterpartsAt as counterpart (counterpart.agentId)}
			<rect
				x={counterpart.at.x - 40}
				y={counterpart.at.y - 12}
				width="80"
				height="24"
				rx="12"
				class="node node--counterpart"
				class:node--lit={lit.has(`counterpart:${counterpart.agentId}`)}
				data-testid="{testId}-edge-counterpart:{counterpart.agentId}"
				data-lit={lit.has(`counterpart:${counterpart.agentId}`)}
			/>
			<text
				x={counterpart.at.x}
				y={counterpart.at.y + 4}
				text-anchor="middle"
				class="lbl lbl--counterpart">◀ {counterpart.name}</text
			>
		{/each}

		<!-- the chassis -->
		<rect x={CX - 34} y={CY - 76} width="68" height="86" rx="10" class="chassis" />
		{#each map.agent.bricks as brick, index (brick.slot + brick.kindId)}
			<rect
				x={CX - 22}
				y={CY - 70 + index * 11}
				width="44"
				height="8"
				rx="2"
				style="fill: {SLOT_TOKEN[brick.slot] ?? 'var(--cab-ink)'}"
				data-slot={brick.slot}
			>
				<title>{brick.name}</title>
			</rect>
		{/each}
		<text x={CX} y={CY + 26} text-anchor="middle" class="lbl">{map.agent.name}</text>

		<!-- outside nodes -->
		{#each nodes as node (node.edge)}
			<g
				data-testid="{testId}-node-{node.entry.kind}-{node.entry.id}"
				transform="translate({node.at.x} {node.at.y})"
			>
				<rect
					x="-78"
					y="-20"
					width="156"
					height="40"
					rx="5"
					class="node"
					class:node--lit={node.lit}
					class:node--flagged={node.flagged}
				/>
				<text y="-4" text-anchor="middle" class="lbl">{node.entry.kind} · {node.entry.name}</text>
				<text y="12" text-anchor="middle" class="host"
					>{hostsLabel(node.entry)}{node.entry.credential ? ' 🔑' : ''}</text
				>
			</g>
		{/each}
	</svg>
	<figcaption>
		<ol class="edges" aria-label="Every edge">
			{#each nodes as node (node.edge)}
				<li data-testid="{testId}-list-{node.edge}" data-lit={node.lit}>
					<b>{node.entry.kind}</b>
					{node.entry.name} — {hostsLabel(node.entry)}
					{#if node.entry.sends.length > 0}· sends {node.entry.sends.join(', ')}{/if}
					{#if node.entry.credential}· credential {node.entry.credential}{/if}
					{#if node.flagged}· <span class="flag">reached a host the run never declared</span>{/if}
					{#if node.lit}· <span class="lit-word">lit</span>{/if}
				</li>
			{/each}
			<li>
				<b>human</b> — approval {map.boundary.approval.mode}{map.boundary.approval.autonomy
					? ` (${map.boundary.approval.autonomy})`
					: ''} · {map.human.approvals} crossed
			</li>
			<li>
				<b>egress</b> — {map.boundary.egress.mode ?? 'not yet named'} · {map.boundary.egress.hosts.join(
					', '
				) || 'no hosts'}
			</li>
			<li><b>rules</b> — {map.boundary.guardrailIds.join(', ') || 'none'}</li>
		</ol>
	</figcaption>
</figure>

<style>
	.boundary {
		margin: 0;
		padding: var(--cab-space-2);
		background-color: var(--cab-graph);
		background-image:
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px);
		background-size: 16px 16px;
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	svg {
		width: 100%;
		max-width: 60rem;
		display: block;
		margin: 0 auto;
		font-family: var(--cab-font-ui);
	}

	.lbl {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		fill: var(--cab-engrave);
	}

	.lbl--counterpart {
		fill: var(--cab-counterpart);
	}

	.host {
		font-family: var(--cab-font-mono);
		font-size: 9.5px;
		fill: var(--cab-ink-muted);
	}

	.glyph {
		font-size: 14px;
	}

	.edge {
		stroke: var(--cab-ink);
		stroke-width: 1.5;
	}

	.edge--local {
		stroke-dasharray: 4 3;
	}

	.edge[data-lit='true'] {
		stroke: var(--cab-scope);
		stroke-width: 3;
	}

	.edge--flagged {
		stroke: var(--cab-fail);
		stroke-width: 3;
	}

	.ring {
		fill: var(--cab-metal);
		stroke: var(--cab-ink);
		stroke-width: 2;
	}

	.inside {
		fill: var(--cab-cream);
		stroke: var(--cab-ink);
		stroke-width: 1.5;
		stroke-dasharray: 3 3;
	}

	.gate {
		fill: var(--cab-pass);
		stroke: var(--cab-ink);
	}

	.gate--closed {
		fill: var(--cab-fail);
	}

	.node {
		fill: var(--cab-cream);
		stroke: var(--cab-ink);
		stroke-width: 1.5;
	}

	.node--counterpart {
		stroke: var(--cab-counterpart);
	}

	.node--lit {
		stroke: var(--cab-scope);
		stroke-width: 3;
	}

	.node--flagged {
		stroke: var(--cab-fail);
		stroke-width: 3;
	}

	.chassis {
		fill: var(--cab-cream);
		stroke: var(--cab-ink);
		stroke-width: 2;
	}

	.edges {
		margin: var(--cab-space-2) 0 0;
		padding-left: var(--cab-space-4);
		columns: 2;
		font-size: var(--cab-text-xs);
	}

	.flag {
		color: var(--cab-fail);
		font-weight: 700;
	}

	.lit-word {
		color: var(--cab-scope);
		font-weight: 700;
	}

	@media (prefers-reduced-motion: no-preference) {
		.edge[data-lit='true'],
		.node--lit {
			transition: stroke 150ms;
		}
	}
</style>
