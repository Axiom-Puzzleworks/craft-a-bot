<script lang="ts">
	import type {
		BoundaryMap,
		BoundaryOutside,
		BoundaryWorkflowStage
	} from '@craftabot/governance/reports';
	import { litEdgesAt } from '@craftabot/governance/reports';
	import { layoutBoundary, type PlacedLabel } from '$lib/control-room/boundary-layout.js';

	/**
	 * **Boundary** (WP57 stage C, `44-CONTROL-ROOM.md` §4.5; rewritten WP86,
	 * `77-PIPELINE-AND-BOUNDARY.md` §5): the map, drawn as concentric regions
	 * on graph paper. The chassis at the centre with its bricks in the colour
	 * law; the ring made of the safety stack, the egress gate and the approval
	 * gate; the world and each counterpart inside; the workflow's stages on a
	 * second ring outside the first, each drawn as its actor — a cog for a
	 * rule, a person at the ring, a line's socket, the bot's own mark — and
	 * lit by the run; providers, guard services, evaluators, sinks and lines
	 * outside, each edge labelled with its hosts and what it sends. Every
	 * label is placed by `layoutBoundary` — a radial layout with collision
	 * resolution — and leader-lined outward when it had to move (UX-7).
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

	const lit = $derived(tick === undefined ? new Set<string>() : litEdgesAt(map, tick));
	const layout = $derived(layoutBoundary(map, lit));
	const W = $derived(layout.width);
	const H = $derived(layout.height);
	const CX = $derived(layout.centre.x);
	const CY = $derived(layout.centre.y);
	const RING = $derived(layout.ring);
	const INSIDE = $derived(layout.inside);

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

	const ACTOR_GLYPH: Record<BoundaryWorkflowStage['executor'], string> = {
		agent: '◉',
		rule: '⚙',
		human: '🙋',
		line: '⌁'
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
		for (const workflow of map.workflows ?? []) {
			parts.push(
				`The ${workflow.name} ring: ${workflow.stages.map((stage) => `${stage.name} (${stage.executor}${stage.status ? `, ${stage.status}` : ''})`).join(', ')}.`
			);
		}
		if (tick !== undefined)
			parts.push(`At turn ${tick}, lit: ${[...lit].join(', ') || 'nothing'}.`);
		return parts.join(' ');
	});

	const hostsLabel = (entry: BoundaryOutside): string =>
		entry.hosts.length === 0 ? 'local' : entry.hosts.join(', ');
	const leader = (label: PlacedLabel) =>
		label.moved ? { x1: label.anchor.x, y1: label.anchor.y, x2: label.x, y2: label.y } : undefined;
</script>

<figure class="boundary" data-testid={testId} data-tick={tick}>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={sentence}>
		<!-- edges first, under everything -->
		{#each layout.outside as node (node.edge)}
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
		{#each layout.rings as ring (ring.workflowId)}
			<circle
				cx={CX}
				cy={CY}
				r={ring.radius}
				class="workflow-ring"
				data-testid="{testId}-ring-{ring.workflowId}"
			/>
		{/each}

		<!-- leader lines for every label that had to move -->
		{#each layout.labels as label (label.id)}
			{@const line = leader(label)}
			{#if line}
				<line
					x1={line.x1}
					y1={line.y1}
					x2={line.x2}
					y2={line.y2}
					class="leader"
					data-leader={label.id}
				/>
			{/if}
		{/each}

		<!-- the egress gate -->
		<rect
			x={layout.gate.x - 6}
			y={layout.gate.y - 6}
			width="12"
			height="12"
			class="gate"
			class:gate--closed={map.boundary.egress.mode === 'none'}
			data-testid="{testId}-egress"
		/>

		<!-- the human on the ring -->
		<circle
			cx={layout.human.x}
			cy={layout.human.y}
			r="14"
			class="node"
			class:node--lit={lit.has('human')}
			data-testid="{testId}-edge-human"
			data-lit={lit.has('human')}
		/>
		<text x={layout.human.x} y={layout.human.y + 5} text-anchor="middle" class="glyph">🙋</text>

		<!-- inside: the world and the counterparts -->
		{#if map.inside.world}
			<rect
				x={layout.world.x - 52}
				y={layout.world.y - 14}
				width="104"
				height="28"
				rx="4"
				class="node"
				class:node--lit={lit.has('world')}
				data-testid="{testId}-edge-world"
				data-lit={lit.has('world')}
			/>
		{/if}
		{#each layout.counterparts as counterpart (counterpart.agentId)}
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
		{/each}

		<!-- the chassis -->
		<rect x={CX - 34} y={CY - 76} width="68" height="86" rx="10" class="chassis" />
		<!-- Keyed by position: a stack may hold two of a kind (two Monitor Judges), and slot + kind threw on the duplicate (`12-…` D23). -->
		{#each map.agent.bricks as brick, index (index)}
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

		<!-- the workflow ring(s): each stage as its actor, lit by the run -->
		{#each layout.stages as stage (stage.id)}
			<g
				data-testid="{testId}-stage-{stage.workflowId}-{stage.stageId}"
				data-executor={stage.executor}
				data-status={stage.status}
				transform="translate({stage.at.x} {stage.at.y})"
			>
				<circle
					r="9"
					class="stage stage--{stage.executor}"
					class:stage--lit={stage.status !== undefined}
					class:stage--failed={stage.status === 'blocked' || stage.status === 'error'}
					class:stage--escalated={stage.status === 'escalated'}
				/>
				<text y="4" text-anchor="middle" class="actor">{ACTOR_GLYPH[stage.executor]}</text>
			</g>
		{/each}

		<!-- outside nodes -->
		{#each layout.outside as node (node.edge)}
			<g
				data-testid="{testId}-node-{node.entry.kind}-{node.entry.id}"
				transform="translate({node.at.x} {node.at.y})"
			>
				<rect
					x={-node.width / 2}
					y={-node.height / 2}
					width={node.width}
					height={node.height}
					rx="5"
					class="node"
					class:node--lit={node.lit}
					class:node--flagged={node.flagged}
				/>
				<!-- The node's own lines, inside its group so a reader (and a test) finds them with the node. -->
				{#each layout.labels.filter((label) => label.id === `node:${node.edge}` || label.id === `host:${node.edge}`) as label (label.id)}
					<text
						x={label.x - node.at.x}
						y={label.y - node.at.y}
						text-anchor={label.align}
						class="lbl lbl--{label.kind}"
						data-label={label.id}
					>
						{#each label.lines as line, index (index)}
							<tspan x={label.x - node.at.x} dy={index === 0 ? 0 : 12}>{line}</tspan>
						{/each}
					</text>
				{/each}
			</g>
		{/each}

		<!-- every other label, placed by the layout -->
		{#each layout.labels.filter((label) => label.kind !== 'node' && label.kind !== 'host') as label (label.id)}
			<text
				x={label.x}
				y={label.y}
				text-anchor={label.align}
				class="lbl lbl--{label.kind}"
				data-label={label.id}
				data-moved={label.moved}
			>
				{#if label.lines.length > 1}
					{#each label.lines as line, index (index)}
						<tspan x={label.x} dy={index === 0 ? 0 : 12}>{line}</tspan>
					{/each}
				{:else}
					{label.lines[0]}
				{/if}
			</text>
		{/each}
	</svg>
	<figcaption>
		<ol class="edges" aria-label="Every edge">
			{#each layout.outside as node (node.edge)}
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
			{#each map.workflows ?? [] as workflow (workflow.id)}
				<li data-testid="{testId}-list-workflow-{workflow.id}">
					<b>workflow</b>
					{workflow.name} — {workflow.stages
						.map(
							(stage) =>
								`${stage.name} (${stage.executor}${stage.status ? `, ${stage.status}` : ''})`
						)
						.join(' → ')}
				</li>
			{/each}
		</ol>
	</figcaption>
</figure>

<style>
	.boundary {
		margin: 0;
		padding: var(--cab-space-2);
		background-color: var(--cab-graph);
		/* The finish seam (WP73, `62-…` §4.2). */
		background-image: var(
			--cab-finish-graph,
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px)
		);
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

	.lbl--host {
		font-family: var(--cab-font-mono);
		font-size: 9.5px;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
		fill: var(--cab-ink-muted);
	}

	.lbl--stage {
		font-size: 9px;
	}

	.glyph {
		font-size: 14px;
	}

	.actor {
		font-size: 10px;
		fill: var(--cab-ink);
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

	.leader {
		stroke: var(--cab-ink-muted);
		stroke-width: 1;
		stroke-dasharray: 2 2;
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

	.workflow-ring {
		fill: none;
		stroke: var(--cab-ink-muted);
		stroke-width: 1;
		stroke-dasharray: 6 4;
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

	.stage {
		fill: var(--cab-cream);
		stroke: var(--cab-ink-muted);
		stroke-width: 1.5;
	}

	.stage--lit {
		stroke: var(--cab-scope);
		stroke-width: 2.5;
		fill: var(--cab-metal);
	}

	.stage--escalated {
		stroke: var(--cab-inconclusive, var(--cab-ink));
	}

	.stage--failed {
		stroke: var(--cab-fail);
		stroke-width: 2.5;
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
