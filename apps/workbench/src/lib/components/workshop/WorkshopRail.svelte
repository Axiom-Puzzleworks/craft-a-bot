<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * The Workshop's persistent left rail (`17-…` §2).
	 *
	 * Built from a list rather than hand-written links because the information
	 * architecture grew, screen by screen, from one built entry to every one
	 * of them (`17-…` §4.7–§4.9's own retrofits) — a rail that silently
	 * omitted an unbuilt screen would misrepresent the product, and one that
	 * linked to it early would be lying about what is there. `spec` is the
	 * one entry that stays a non-link permanently by design, not because it
	 * is unbuilt: the Spec Lab has no screen of its own, it is always about a
	 * particular bot, so the rail says how to reach it rather than pretending
	 * it is missing.
	 */
	interface Props {
		current:
			| 'runs'
			| 'dashboard'
			| 'spec'
			| 'evals'
			| 'policies'
			| 'bench'
			| 'telemetry'
			| 'incidents'
			| 'safety-case'
			| 'export'
			| 'armour'
			| 'guards'
			| 'evaluators'
			| 'scenarios'
			| 'campaigns';
	}

	let { current }: Props = $props();

	const DESTINATIONS = [
		{ id: 'dashboard', label: 'Bench', href: '/workshop' },
		{ id: 'runs', label: 'Runs', href: '/workshop/runs' },
		{ id: 'spec', label: 'Spec Lab', hint: 'per bot' },
		{ id: 'evals', label: 'Evals', href: '/workshop/evals' },
		// WP38 (`28-CAMPAIGNS.md` §4.9) — the guardrail regression suite as a file.
		{ id: 'campaigns', label: 'Campaigns', href: '/workshop/campaigns' },
		// WP43 (`31-EVALUATORS.md` §4.3) — every evaluator, run over a stored run.
		{ id: 'evaluators', label: 'Evaluators', href: '/workshop/evaluators' },
		// WP44 (`32-SCENARIOS.md` §4.5) — every scenario a pack ships, and a corpus imported over a card.
		{ id: 'scenarios', label: 'Scenarios', href: '/workshop/scenarios' },
		{ id: 'policies', label: 'Policies', href: '/workshop/policies' },
		{ id: 'bench', label: 'Test Bench', href: '/workshop/bench' },
		{ id: 'telemetry', label: 'Telemetry', href: '/workshop/telemetry' },
		{ id: 'incidents', label: 'Incidents', href: '/workshop/incidents' },
		{ id: 'safety-case', label: 'Safety case', href: '/workshop/safety-case' },
		{ id: 'export', label: 'Audit', href: '/workshop/export' },
		// WP42 (`30-SECOND-VENDORS.md` §5) — the Guard Rack, grown from WP35's
		// Armour Studio, which now redirects here.
		{ id: 'guards', label: 'Guards', href: '/workshop/guards' }
	] as const;
</script>

<nav class="rail" aria-label="Workshop">
	<span class="mark">CRAFT A BOT<em>workshop</em></span>
	<ul>
		{#each DESTINATIONS as destination (destination.id)}
			<li>
				{#if 'href' in destination}
					<a
						href={resolve(
							destination.href as
								| '/workshop'
								| '/workshop/runs'
								| '/workshop/evals'
								| '/workshop/policies'
								| '/workshop/bench'
								| '/workshop/telemetry'
								| '/workshop/incidents'
								| '/workshop/safety-case'
								| '/workshop/export'
								| '/workshop/armour'
								| '/workshop/guards'
								| '/workshop/evaluators'
								| '/workshop/scenarios'
								| '/workshop/campaigns'
						)}
						aria-current={current === destination.id ? 'page' : undefined}
						data-testid="rail-{destination.id}">{destination.label}</a
					>
				{:else}
					<!-- Not a link, and it says why: `17-…` §2's IA is eight screens and
					     most of them are later work packages. -->
					<span class="pending" data-testid="rail-{destination.id}"
						>{destination.label}<em>{destination.hint}</em></span
					>
				{/if}
			</li>
		{/each}
	</ul>
	<a class="back" href={resolve('/')}>← The Kit</a>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--cab-space-4);
		padding: var(--cab-space-4) var(--cab-space-3);
		min-width: 152px;
		background: var(--cab-panel);
		border-right: var(--cab-border-panel) solid var(--cab-ink);
	}

	.mark {
		display: grid;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--cab-cream);
	}

	.mark em {
		font-style: normal;
		font-weight: 400;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--cab-cream-muted);
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a,
	.pending {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		font-size: var(--cab-text-sm);
		border-radius: var(--cab-radius-part);
		text-decoration: none;
	}

	a {
		color: var(--cab-cream);
	}

	a[aria-current='page'] {
		background: var(--cab-cream);
		color: var(--cab-ink);
		font-weight: 600;
	}

	a:hover:not([aria-current='page']) {
		background: color-mix(in srgb, var(--cab-cream) 20%, transparent);
	}

	a:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	/*
	 * A muted token, not a dimmed one (`04-…` §2.3). The label still has to be
	 * readable — it is telling you what the product will be.
	 */
	.pending {
		color: var(--cab-cream-muted);
	}

	.pending em {
		font-style: normal;
		font-size: var(--cab-text-xs);
		letter-spacing: 0.06em;
	}

	.back {
		margin-top: auto;
		font-size: var(--cab-text-xs);
	}
</style>
