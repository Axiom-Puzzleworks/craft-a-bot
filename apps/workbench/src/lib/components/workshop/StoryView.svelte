<script lang="ts">
	import type { Story, StoryChapter } from '@craftabot/governance/reports';

	/**
	 * **A story, read** (WP161, `112-REAL-ENOUGH-PLAN.md` §5): the fold's
	 * chapters as headings and lists, the facts above and the ending below —
	 * the truth only there. Text only, from the fold; nothing here decides what
	 * a beat says.
	 */
	interface Props {
		story: Story;
		testId?: string | undefined;
	}
	let { story, testId = 'story' }: Props = $props();
</script>

{#snippet chapter(item: StoryChapter, depth: number)}
	<section class="chapter" data-depth={depth}>
		{#if depth <= 1}<h3>{item.heading}</h3>{:else}<h4>{item.heading}</h4>{/if}
		{#if item.note}<p class="note">{item.note}</p>{/if}
		{#if item.beats.length > 0}
			<ul class="beats">
				{#each item.beats as beat, index (index)}
					<li class="beat" data-kind={beat.kind}>
						<span class="kind">{beat.kind}</span>
						{beat.text}
						{#if beat.detail && beat.detail.length > 0}
							<ul class="detail">
								{#each beat.detail as line, at (at)}<li>{line}</li>{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#each item.children ?? [] as child, at (at)}
			{@render chapter(child, depth + 1)}
		{/each}
	</section>
{/snippet}

<article class="story" data-testid={testId} aria-label="The story of this run">
	<dl class="facts" data-testid="{testId}-facts">
		{#each story.facts as fact (fact.label)}
			<dt>{fact.label}</dt>
			<dd>{fact.value}</dd>
		{/each}
	</dl>
	{#each story.chapters as item, index (index)}
		{@render chapter(item, 1)}
	{/each}
	<section class="chapter ending" data-testid="{testId}-ending">
		<h3>How it ended</h3>
		<p>
			<strong>Outcome:</strong>
			{story.ending.outcome}{story.ending.reason ? ` — ${story.ending.reason}` : ''}
		</p>
		<p><strong>The truth:</strong> {story.ending.truthNote}</p>
		{#if story.ending.truth !== undefined}
			<pre data-testid="{testId}-truth">{JSON.stringify(story.ending.truth, null, 2)}</pre>
		{/if}
		{#if story.ending.marks.length > 0}
			<h4>The evaluators</h4>
			<ul>
				{#each story.ending.marks as mark (mark.evaluator)}
					<li><strong>{mark.evaluator}:</strong> {mark.verdict} — {mark.explanation}</li>
				{/each}
			</ul>
		{/if}
	</section>
</article>

<style>
	.story {
		max-width: 62rem;
		margin-top: var(--cab-space-3);
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--cab-space-1) var(--cab-space-3);
		padding: var(--cab-space-2) var(--cab-space-3);
		background-color: var(--cab-graph);
	}
	.facts dt {
		font-weight: 600;
	}
	.facts dd {
		margin: 0;
	}
	.chapter {
		margin-top: var(--cab-space-3);
	}
	.chapter .chapter {
		margin-left: var(--cab-space-3);
		padding-left: var(--cab-space-3);
		border-left: 3px solid var(--cab-ink-muted);
	}
	.note {
		color: var(--cab-ink-muted);
	}
	.beats {
		list-style: none;
		padding-left: 0;
	}
	.beat {
		padding: var(--cab-space-1) 0;
		border-bottom: 1px solid var(--cab-paper);
	}
	.kind {
		display: inline-block;
		min-width: 6rem;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 700;
	}
	.detail {
		margin: var(--cab-space-1) 0 0 6rem;
		color: var(--cab-ink-muted);
		font-size: var(--cab-text-sm);
	}
	pre {
		overflow: auto;
		background-color: var(--cab-graph);
		padding: var(--cab-space-2);
	}
</style>
