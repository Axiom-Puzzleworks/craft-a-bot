<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * The Workshop's persistent left rail (`17-…` §2).
	 *
	 * Built from a list rather than seven hand-written links because the
	 * information architecture in §2 is eight screens and only one of them exists
	 * yet. A rail that silently omitted the rest would misrepresent the product;
	 * one that linked to them would be lying about what is there. Unbuilt screens
	 * are shown, disabled, with the work package that brings them — the same
	 * honesty the Kit's "Coming soon" expansion box already uses.
	 */
	interface Props {
		current:
			'runs' | 'dashboard' | 'spec' | 'evals' | 'policies' | 'bench' | 'telemetry' | 'export';
	}

	let { current }: Props = $props();

	const DESTINATIONS = [
		{ id: 'dashboard', label: 'Bench', href: '/workshop' },
		{ id: 'runs', label: 'Runs', href: '/workshop/runs' },
		{ id: 'spec', label: 'Spec Lab', hint: 'per bot' },
		{ id: 'evals', label: 'Evals', href: '/workshop/evals' },
		{ id: 'policies', label: 'Policies', href: '/workshop/policies' },
		{ id: 'bench', label: 'Test Bench', href: '/workshop/bench' },
		{ id: 'telemetry', label: 'Telemetry', href: '/workshop/telemetry' },
		{ id: 'export', label: 'Audit', hint: 'WP34' }
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
