<script lang="ts">
	import { resolve } from '$app/paths';

	/**
	 * The persistent kit header (`16-…` §1.5, closing `12-…` D16's first half:
	 * Settings was unreachable from the Shelf, so a child who wanted the sound
	 * off had to already be on the bench to find it).
	 *
	 * Styled as the strip of studs along the top of a box lid rather than a web
	 * nav bar — it is the one piece of chrome present on every screen, so it is
	 * also the strongest signal of what the whole thing *is*.
	 *
	 * **Instructions is not a route.** The leaflet is an overlay owned by the
	 * layout (it spans bench and Playroom, and a tutorial that reset itself on
	 * navigation would be no tutorial at all), so this emits `oninstructions`
	 * and lets the layout call `show()` on the controller it already holds.
	 *
	 * **Scrapbook is deliberately absent until WP16 slice e** builds
	 * `/scrapbook/[agentId]`. `16-…` §1.5 lists it in this header, and it will
	 * join here the moment the page exists; shipping a dimmed button that does
	 * nothing would be a worse lie to a five-year-old than a header that grows.
	 */
	interface Props {
		/** Which entry is the current screen — `undefined` on routes with no entry. */
		current?: 'shelf' | 'settings' | undefined;
		oninstructions: () => void;
	}

	let { current, oninstructions }: Props = $props();
</script>

<header class="bar" data-testid="nav-header">
	<a class="mark" href={resolve('/')} data-testid="nav-mark">
		<span class="studs" aria-hidden="true">
			<span class="stud"></span><span class="stud"></span><span class="stud"></span>
		</span>
		<span class="wordmark">Craft A Bot</span>
	</a>

	<nav aria-label="Main">
		<ul>
			<li>
				<a
					href={resolve('/')}
					data-testid="nav-shelf"
					aria-current={current === 'shelf' ? 'page' : undefined}
				>
					Shelf
				</a>
			</li>
			<li>
				<button type="button" data-testid="nav-instructions" onclick={oninstructions}>
					Instructions
				</button>
			</li>
			<li>
				<a
					href={resolve('/settings')}
					data-testid="nav-settings"
					aria-current={current === 'settings' ? 'page' : undefined}
				>
					Settings
				</a>
			</li>
		</ul>
	</nav>
</header>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cab-space-4);
		flex-wrap: wrap;
		padding: var(--cab-space-2) var(--cab-space-4);
		background: var(--cab-blue);
		/*
		 * Cream, not `--cab-blue-text`: that token is the *darker* blue for blue
		 * text on paper, and putting it on a blue ground gives 1.35:1 — legible
		 * to nobody. Every other blue-ground surface in the kit (EndCard,
		 * RunControls, the battery compartment) uses cream, and so does this.
		 */
		color: var(--cab-cream);
		border-bottom: 3px solid var(--cab-border-panel);
		box-shadow: var(--cab-shadow);
	}

	.mark {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
		color: inherit;
		text-decoration: none;
		font-weight: 700;
		font-size: var(--cab-text-lg);
	}

	/* The three studs read as "this is a brick" at a glance (04-… §3). */
	.studs {
		display: flex;
		gap: 3px;
	}

	.stud {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--cab-plastic-hi);
		box-shadow: inset 0 -1px 0 var(--cab-border-part);
	}

	nav ul {
		display: flex;
		align-items: center;
		gap: var(--cab-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	nav a,
	nav button {
		display: block;
		padding: var(--cab-space-1) var(--cab-space-3);
		border: 2px solid transparent;
		border-radius: var(--cab-radius-pill);
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--cab-text-sm);
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	nav a:hover,
	nav button:hover {
		background: color-mix(in srgb, var(--cab-plastic-hi) 22%, transparent);
	}

	nav a[aria-current='page'] {
		background: var(--cab-plastic-hi);
		color: var(--cab-ink);
	}

	nav a:focus-visible,
	nav button:focus-visible,
	.mark:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}
</style>
