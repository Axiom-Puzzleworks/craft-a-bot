<script lang="ts">
	import type { EngineEvent } from '@craftabot/core';
	import { currentTick, narrate, type Beat } from '$lib/narration/narrate.js';
	import { createNarrator, type Narrator } from '$lib/narration/speech.js';

	/**
	 * **The story strip** (`16-…` §1.3): the current turn as picture beats —
	 * 👀 saw → 💭 thought → 🚗 did → ✨ what happened — under the world view.
	 *
	 * The strip *is* a child's trace. Between STEP presses nothing else explains
	 * *why*, and the causal chain otherwise lives in the Flight Recorder as JSON;
	 * reading load is the ceiling for the five-to-eight age band this is for. So
	 * the beats carry pictures first and one child-voice line each, past turns
	 * scroll away to the left, and "see more" opens the real trace at exactly the
	 * moment being looked at — which is the bridge from this to that, and the
	 * whole reason the toy claims nothing is hidden.
	 *
	 * **It doubles as the play route's live region**, closing `12-…` D16: this
	 * screen had no announcer at all, so a screen-reader user got a silent bot.
	 * One region per screen — several competing is worse than none, because
	 * readers interleave them unpredictably — so the strip is it.
	 */
	interface Props {
		events: EngineEvent[];
		/** Open the Flight Recorder at an event. Absent while there is nothing to open. */
		onseemore?: ((eventIndex: number) => void) | undefined;
		/** Read the captions aloud (`16-…` §1.3). Off unless a grown-up says otherwise. */
		readAloud?: boolean;
		/** Injectable so tests can hear what would be said without a speech engine. */
		narrator?: Narrator;
		/**
		 * agentId → display name, for a duo run's merged trace (WP31, `24-…`
		 * §4.4). Absent for a solo run, where there is only one bot and naming
		 * it would say nothing the caption doesn't.
		 */
		actors?: ReadonlyMap<string, string>;
	}

	let { events, onseemore, readAloud = false, narrator, actors }: Props = $props();

	/*
	 * Derived, not captured. A prop read once at setup keeps the value it had
	 * then — fine in the app, where the narrator never changes, and wrong in a
	 * test that swaps one in.
	 */
	const voice = $derived(narrator ?? createNarrator());

	const ticks = $derived(narrate(events, actors));
	const latest = $derived(currentTick(ticks));
	/** Older turns, oldest first, so the newest sits at the right-hand end. */
	const earlier = $derived(ticks.slice(0, -1));

	/** Which beat the reader has tapped open, as `tick:index`. */
	let opened = $state<string | undefined>(undefined);

	const keyFor = (tick: number, index: number) => `${tick}:${index}`;

	/** A beat's caption, named when it has an actor — the one phrase every reading of a beat shares. */
	const textFor = (beat: Beat) => (beat.actor ? `${beat.actor}: ${beat.caption}` : beat.caption);

	/**
	 * Everything the current turn amounts to, in one sentence.
	 *
	 * This is what the live region announces and what the voice reads. Beat by
	 * beat would be worse for both: a screen reader would interrupt itself four
	 * times a turn, and a listener would lose the thread between them.
	 */
	const story = $derived(latest?.beats.map(textFor).join(' ') ?? '');

	/*
	 * Speak when the story changes, never on a re-render. `$effect` re-runs on any
	 * read of a rune it touched, and `say` cancels whatever is in progress, so
	 * without the guard a stray update mid-sentence would clip the voice.
	 */
	let spoken = $state('');
	$effect(() => {
		if (!readAloud) {
			voice.hush();
			spoken = '';
			return;
		}
		if (story !== '' && story !== spoken) {
			spoken = story;
			voice.say(story);
		}
	});
</script>

<section class="strip" data-testid="story-strip" aria-label="What your bot is doing">
	<!--
		`aria-live` on a wrapper the beats render *inside* would announce each beat
		as it arrives. This announces the finished sentence instead — see `story`.
	-->
	<p class="visually-hidden" role="status" aria-live="polite" data-testid="story-announcer">
		{story}
	</p>

	<ol class="turns">
		{#each earlier as turn (turn.tick)}
			<li class="turn turn--past" data-testid="story-turn-{turn.tick}">
				<span class="turn-number" aria-hidden="true">{turn.tick}</span>
				<span class="beats beats--small">
					{#each turn.beats as beat (beat.eventIndex)}
						<span class="beat-icon" title={textFor(beat)} aria-hidden="true">{beat.icon}</span>
					{/each}
				</span>
			</li>
		{/each}

		{#if latest}
			<li class="turn turn--now" data-testid="story-turn-current">
				<span class="turn-number" aria-hidden="true">
					{latest.tick === 0 ? 'Before we start' : `Turn ${latest.tick}`}
				</span>
				<span class="beats">
					{#each latest.beats as beat, index (beat.eventIndex)}
						{@const key = keyFor(latest.tick, index)}
						<button
							type="button"
							class="beat beat--{beat.kind}"
							class:beat--open={opened === key}
							data-testid="beat-{beat.kind}"
							aria-expanded={opened === key}
							onclick={() => (opened = opened === key ? undefined : key)}
						>
							<span class="beat-icon" aria-hidden="true">{beat.icon}</span>
							<span class="beat-caption"
								>{#if beat.actor}<strong class="beat-actor" data-testid="beat-actor"
										>{beat.actor}:</strong
									>&nbsp;{/if}{beat.caption}</span
							>
						</button>

						{#if opened === key && onseemore}
							<button
								type="button"
								class="see-more"
								data-testid="see-more"
								onclick={() => onseemore?.(beat.eventIndex)}
							>
								See more →
							</button>
						{/if}
					{/each}
				</span>
			</li>
		{:else}
			<li class="turn turn--now">
				<p class="waiting" data-testid="story-waiting">
					Press STEP and your bot's story starts here.
				</p>
			</li>
		{/if}
	</ol>
</section>

<style>
	.strip {
		background: color-mix(in srgb, var(--cab-ink) 5%, var(--cab-paper));
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-2);
		box-shadow: inset 0 2px 6px var(--cab-shadow);
		overflow-x: auto;
	}

	.turns {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		align-items: stretch;
		gap: var(--cab-space-2);
		min-height: calc(var(--cab-sub) * 4);
	}

	.turn {
		display: grid;
		gap: 2px;
		align-content: start;
		padding: var(--cab-space-1) var(--cab-space-2);
		border-radius: var(--cab-radius-part);
		flex: 0 0 auto;
	}

	/* Past turns shrink to their pictures — the story so far, at a glance. */
	.turn--past {
		opacity: 0.55;
		background: color-mix(in srgb, var(--cab-ink) 4%, transparent);
	}

	.turn--now {
		background: var(--cab-cream);
		box-shadow: var(--cab-drop-shadow);
		flex: 1 1 auto;
		min-width: calc(var(--cab-sub) * 12);
	}

	.turn-number {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.7;
	}

	.beats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-1);
	}

	.beats--small {
		gap: 2px;
	}

	.beat {
		display: inline-flex;
		align-items: center;
		gap: var(--cab-space-1);
		padding: 2px var(--cab-space-2);
		font: inherit;
		font-size: var(--cab-text-sm);
		text-align: left;
		background: var(--cab-paper);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 15%, transparent);
		border-radius: var(--cab-radius-pill);
		cursor: pointer;
	}

	.beat--open {
		border-color: var(--cab-blue);
	}

	.beat:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	/*
	 * A refusal is the beat that matters most (`16-…` §1.2) — the thing players
	 * could not see before. Colour is not carrying it alone: the caption says
	 * what happened and the icon is a distinct 😕.
	 */
	.beat--refused {
		background: color-mix(in srgb, var(--cab-red) 12%, var(--cab-paper));
		border-color: color-mix(in srgb, var(--cab-red) 45%, transparent);
	}

	.beat--stopped {
		background: color-mix(in srgb, var(--cab-yellow) 20%, var(--cab-paper));
		border-color: color-mix(in srgb, var(--cab-yellow) 60%, transparent);
	}

	.beat--ended {
		font-weight: 700;
	}

	.beat-icon {
		font-size: var(--cab-text-md);
		line-height: 1;
	}

	.beat-caption {
		max-width: calc(var(--cab-sub) * 14);
	}

	.see-more {
		font: inherit;
		font-size: var(--cab-text-xs);
		font-weight: 700;
		background: none;
		border: none;
		color: var(--cab-blue);
		cursor: pointer;
		text-decoration: underline;
	}

	.see-more:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.waiting {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.75;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
