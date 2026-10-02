import type { EngineEvent, EvaluationRecord, RunRecord } from '@craftabot/core';
import { renderStoryMarkdown, storyForRun, type Story } from '@craftabot/governance/reports';

/**
 * **The story, for the Workshop** (WP161, `112-REAL-ENOUGH-PLAN.md` §5, D12):
 * the same fold `craftabot story` calls, over a run this browser stores. A
 * render, never a store — nothing here is saved. Every figure and sentence is
 * the fold's; this module only hands it the run.
 */
export function storyOfStoredRun(
	run: RunRecord,
	events: readonly EngineEvent[],
	evaluations: readonly EvaluationRecord[]
): Story {
	return storyForRun({ events, record: run, evaluations });
}

/** The story as the markdown file the Audit Centre offers and the CLI writes — byte for byte the same text. */
export function storyMarkdownOf(story: Story): string {
	return renderStoryMarkdown(story);
}

/** The file name a story is saved under. */
export function storyFileName(runId: string): string {
	return `story-${runId}.md`;
}

/** The cassette's file name alone, for a chip that names where a replayed run's answers came from. */
export function cassetteName(path: string): string {
	return path.split(/[\\/]/).at(-1) ?? path;
}
