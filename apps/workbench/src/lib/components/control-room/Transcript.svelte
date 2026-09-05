<script lang="ts">
	import type { DeskTranscriptLine } from '@craftabot/core';
	import { lane, type LaneId } from '$lib/control-room/dataviz.js';

	/**
	 * **Transcript** (WP57, `44-CONTROL-ROOM.md` §4.4): the Desk's transcript
	 * pane — the agent's lines in the action lane (what a bot *does*), the
	 * counterpart's in the counterpart lane, the desk's own in the system
	 * lane, each with the lane's glyph and a label so no line is colour
	 * alone. A live region wrapping the list (a list with another role has
	 * no items, as far as a reader is concerned). The `desk-line-{seq}` ids
	 * are the contract WP53's e2e reads.
	 */
	interface Props {
		lines: readonly DeskTranscriptLine[];
		/** Who speaks when a line names nobody. */
		fallbackNames?: Partial<Record<DeskTranscriptLine['speaker'], string>>;
		testId?: string;
	}

	let { lines, fallbackNames = {}, testId = 'desk-transcript' }: Props = $props();

	const LANE_FOR: Record<DeskTranscriptLine['speaker'], LaneId> = {
		agent: 'action',
		counterpart: 'counterpart',
		system: 'system'
	};
	const FALLBACK: Record<DeskTranscriptLine['speaker'], string> = {
		agent: 'Bot',
		counterpart: 'Visitor',
		system: 'Desk'
	};
</script>

<section class="transcript" aria-label="Transcript" data-testid={testId}>
	<h3>Transcript</h3>
	{#if lines.length === 0}
		<p class="empty">Nothing has been said yet.</p>
	{:else}
		<div role="log" aria-live="polite" aria-relevant="additions">
			<ol>
				{#each lines as line (line.seq)}
					{@const l = lane(LANE_FOR[line.speaker])}
					<li
						data-testid="desk-line-{line.seq}"
						data-speaker={line.speaker}
						style="--lane: {l.token}; --lane-text: {l.text}"
					>
						<span class="speaker">
							<span class="glyph" aria-hidden="true">{l.glyph}</span>
							{line.speakerName || fallbackNames[line.speaker] || FALLBACK[line.speaker]}
							{#if line.channel}
								<span class="channel">on {line.channel}</span>
							{/if}
						</span>
						<span class="text">{line.text}</span>
						{#if line.pressure !== undefined || (line.tags && line.tags.length > 0)}
							<span class="push" data-testid="desk-line-{line.seq}-push">
								{#if line.pressure !== undefined}
									<span class="pressure" title="How hard this line pushed"
										>pressure {Math.round(line.pressure * 100)}%</span
									>
								{/if}
								{#each line.tags ?? [] as tag (tag)}
									<span class="tag">{tag}</span>
								{/each}
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		</div>
	{/if}
</section>

<style>
	.transcript {
		min-width: 0;
		padding: var(--cab-space-3);
		background-color: var(--cab-graph);
		background-image:
			linear-gradient(rgba(36, 86, 166, 0.06) 1px, transparent 1px),
			linear-gradient(90deg, rgba(36, 86, 166, 0.06) 1px, transparent 1px);
		background-size: 12px 12px;
		border-radius: var(--cab-radius-part);
		color: var(--cab-ink);
	}

	h3 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cab-engrave);
	}

	.empty {
		margin: 0;
		color: var(--cab-ink-muted);
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-2);
	}

	li {
		display: grid;
		gap: var(--cab-space-1);
		padding: var(--cab-space-2);
		border-radius: var(--cab-radius-part);
		border-left: 4px solid var(--lane);
		background: var(--cab-cream);
	}

	li[data-speaker='agent'] {
		margin-left: var(--cab-space-4);
	}

	li[data-speaker='counterpart'] {
		margin-right: var(--cab-space-4);
	}

	li[data-speaker='system'] {
		text-align: center;
		color: var(--cab-ink-muted);
	}

	.speaker {
		font-size: var(--cab-text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--lane-text);
	}

	.glyph {
		margin-right: var(--cab-space-1);
	}

	.push {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-xs);
	}

	.pressure,
	.tag {
		padding: 0 var(--cab-space-1);
		border: 1px solid var(--cab-counterpart);
		border-radius: var(--cab-radius-pill);
		color: var(--cab-counterpart);
	}

	.channel {
		margin-left: var(--cab-space-2);
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--cab-ink-muted);
	}
</style>
