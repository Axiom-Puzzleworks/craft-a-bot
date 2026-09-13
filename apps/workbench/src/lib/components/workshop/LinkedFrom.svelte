<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Referrer } from '$lib/workshop/referrers.js';

	/**
	 * **Linked from** (WP109, `96-CONTROL-ROOM-V3.md` §2.4): what links to
	 * this artefact — every id a link — or a plain sentence that nothing does
	 * yet. The fold is `referrersOf`; this only draws it.
	 */
	interface Props {
		links: readonly Referrer[];
		testId?: string | undefined;
	}

	let { links, testId = 'linked-from' }: Props = $props();

	/** `resolve` puts the base on the path and drops a search; the search goes back on. */
	const hrefOf = (href: string): string => {
		const at = href.indexOf('?');
		const path = at === -1 ? href : href.slice(0, at);
		return `${resolve(path as '/workshop')}${at === -1 ? '' : href.slice(at)}`;
	};

	const WORD: Record<Referrer['kind'], string> = {
		run: 'run',
		'campaign-report': 'campaign report',
		'workflow-run': 'workflow run',
		'experiment-result': 'experiment',
		stack: 'stack'
	};
</script>

<section class="linked" aria-label="Linked from" data-testid={testId}>
	<h2>Linked from</h2>
	{#if links.length === 0}
		<p class="none" data-testid="{testId}-none">Nothing links here yet.</p>
	{:else}
		<ul>
			{#each links as link (`${link.kind}:${link.id}:${link.via}`)}
				<li data-testid="{testId}-row">
					<span class="kind">{WORD[link.kind]}</span>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() builds the base path in hrefOf; its typed surface has no way to attach a referrer's query the rule can verify statically (the Pipeline's exception). -->
					<a href={hrefOf(link.href)} data-testid="{testId}-link">{link.title}</a>
					<code>{link.id}</code>
					<span class="via">{link.via}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.linked {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2) var(--cab-space-3);
		border: 1.5px solid var(--cab-ink);
		border-radius: var(--cab-radius-part);
		background: var(--cab-graph);
	}

	h2 {
		margin: 0;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-2);
		align-items: baseline;
		font-size: var(--cab-text-sm);
	}

	.kind,
	.via {
		font-size: var(--cab-text-xs);
	}

	.kind {
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	code {
		font-size: var(--cab-text-xs);
	}

	.none {
		margin: 0;
		font-size: var(--cab-text-sm);
	}
</style>
