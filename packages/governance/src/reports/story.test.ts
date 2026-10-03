import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineEvent, StoredWorkflowRun } from '@craftabot/core';
import {
	renderStoryHtml,
	renderStoryMarkdown,
	runChapters,
	storyForJourney,
	storyForRun
} from './story.js';

/**
 * The story (WP161, `112-REAL-ENOUGH-PLAN.md` §5, D12): a render over the
 * trace, deterministic, with the truth last. Read here over the committed
 * golden traces and the committed complaints journey, and over a crafted run
 * that carries every beat the goldens do not (a planted fault and its roll, a
 * visitor's line, a reviewer's draw, a hosted guard, an approval).
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
const SAY_HELLO = read<EngineEvent[]>(
	'packages/packs/starter/src/fixtures/trace.say-hello.v1.json'
);
const COMPLAINTS = read<StoredWorkflowRun>(
	'packages/packs/fs-advice/src/fixtures/complaints-workflow-run.v1.json'
);

let counter = 0;
function ev(tick: number, type: EngineEvent['type'], payload: unknown): EngineEvent {
	counter += 1;
	return {
		id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		tick,
		timestamp: '2026-10-02T10:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const CRAFTED: EngineEvent[] = [
	ev(0, 'run.started', {
		mode: 'step',
		budgets: { maxTicks: 8, maxTokens: 4000, requestTimeoutMs: 30000 },
		providerId: 'dgx-spark',
		wireModel: 'Qwen3.5-122B-A10B-NVFP4',
		cartridgeId: 'dgx-spark/giant-qwen',
		principal: { kind: 'service', id: 'craftabot-harness', name: 'ci' },
		egress: { mode: 'none', hosts: [] }
	}),
	ev(1, 'sense', {
		channels: ['case-file'],
		observation: { channels: ['case-file'], text: 'A dispute for £40.' }
	}),
	ev(1, 'prompt.composed', {
		messages: [
			{ role: 'system', content: 'You are a clerk.' },
			{ role: 'user', content: 'Right now: a dispute for £40. <script>alert(1)</script>' }
		],
		estimatedTokens: 120
	}),
	ev(1, 'think.started', {
		wireModel: 'Qwen3.5-122B-A10B-NVFP4',
		providerId: 'dgx-spark',
		cartridgeId: 'dgx-spark/giant-qwen',
		parameters: { temperature: 0.7, maxTokens: 300 }
	}),
	ev(1, 'think.completed', {
		response: {
			text: 'Decline.',
			usage: { inputTokens: 100, outputTokens: 20 },
			raw: null,
			finishReason: 'tool_call'
		},
		durationMs: 2400
	}),
	ev(1, 'decision', {
		thought: 'Decline it.',
		call: { kind: 'action', name: 'decide', arguments: { outcome: 'decline' } },
		source: 'brain'
	}),
	ev(1, 'decision.fault', {
		action: 'decide',
		field: 'outcome',
		chose: 'decline',
		shouldHave: 'approve',
		planted: true,
		errorModel: 'fs-disputes/errors',
		draw: { rate: 0.1, roll: 0.0412 }
	}),
	ev(1, 'guardrail.checked', {
		guardrailId: 'safety/no-fire',
		hook: 'pre-act',
		verdict: { allow: true }
	}),
	ev(1, 'guardrail.checked', {
		guardrailId: 'geap/armor',
		hook: 'pre-act',
		verdict: {
			allow: false,
			reason: 'Prompt injection.',
			disposition: 'block-action',
			cause: 'could-not-check'
		}
	}),
	ev(1, 'guardrail.external', {
		guardrailId: 'geap/armor',
		hook: 'pre-act',
		service: 'model-armor',
		endpoint: 'https://modelarmor.example',
		latencyMs: 80,
		charsScreened: 100,
		outcome: 'ok'
	}),
	ev(1, 'approval.requested', {
		proposed: { kind: 'action', name: 'decide', arguments: {} },
		reason: 'Over the limit.'
	}),
	ev(1, 'approval.resolved', {
		approved: false,
		by: { kind: 'person', id: 'p1', name: 'R. Viewer' },
		override: true,
		reason: 'The file supports an approval.'
	}),
	ev(2, 'action.performed', {
		name: 'say',
		arguments: { text: 'Hello' },
		result: { ok: true, narration: 'You said it.' },
		redacted: { guardrailId: 'geap/sdp' }
	}),
	ev(2, 'seat.said', {
		persona: 'Mrs Okafor',
		cue: { kind: 'acted', detail: 'say' },
		ruleId: 'push',
		text: 'I really do not have time.',
		then: 'continue',
		pressure: 0.9,
		tags: ['social-engineering']
	}),
	ev(2, 'reviewer.drew', {
		workflowRunId: 'w1',
		stageId: 'review',
		model: 'fs-bank/case-handler',
		rates: { accuracy: 0.95, automationBias: 0.3 },
		path: 'took-recommendation',
		rolls: [0.12, 0.5]
	}),
	ev(3, 'run.finished', {
		outcome: 'SUCCESS',
		ticks: 3,
		usage: { inputTokens: 100, outputTokens: 20 },
		truth: { shouldHave: 'approve', secretOnlyInTruth: 'cohort-7' }
	})
];

describe('the story of one run', () => {
	it('tells the golden say-hello run turn by turn and ends on its outcome', () => {
		const story = storyForRun({ events: SAY_HELLO });
		expect(story.subject.kind).toBe('run');
		expect(story.chapters.length).toBeGreaterThan(2);
		const text = renderStoryMarkdown(story);
		expect(text).toContain('# Run ');
		expect(text).toContain('**saw**');
		expect(text).toContain('**thought** — It decided');
		expect(text).toContain('**did** — It did say');
		expect(story.ending.outcome).toBe('SUCCESS');
		// A world with no hidden state records no truth, and the story says so.
		expect(story.ending.truth).toBeUndefined();
		expect(story.ending.truthNote).toContain('no truth');
		// Chapters are in turn order.
		const headings = story.chapters.map((chapter) => chapter.heading);
		expect(headings).toEqual(
			[...headings].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		);
	});

	it('is deterministic: the same events, the same bytes, in both renderings', () => {
		const a = storyForRun({ events: CRAFTED });
		const b = storyForRun({ events: CRAFTED });
		expect(renderStoryMarkdown(a)).toBe(renderStoryMarkdown(b));
		expect(renderStoryHtml(a)).toBe(renderStoryHtml(b));
	});

	it('names the dials, the model, the principal and — when replayed — the cassette', () => {
		const live = renderStoryMarkdown(storyForRun({ events: CRAFTED }));
		expect(live).toContain('Qwen3.5-122B-A10B-NVFP4 through dgx-spark');
		expect(live).toContain('temperature 0.7, up to 300 tokens a turn');
		expect(live).toContain('ci (service)');
		expect(live).toContain('as the provider gave them');
		const replayed = renderStoryMarkdown(
			storyForRun({
				events: CRAFTED,
				record: {
					id: '11111111-1111-4111-8111-111111111111',
					agentName: 'Clerkbot',
					goalCardId: 'fs-disputes/clear-dispute',
					startedAt: '2026-10-02T10:00:00.000Z',
					replayedFrom: {
						cassette: 'docs/evidence/x/x.provider-cassette.json',
						model: 'Qwen3.5-122B-A10B-NVFP4',
						recorded: '2026-10-02T09:00:00.000Z'
					}
				}
			})
		);
		expect(replayed).toContain('replayed from docs/evidence/x/x.provider-cassette.json');
		expect(replayed).toContain('not a live call');
		expect(replayed).toContain('# Clerkbot on fs-disputes/clear-dispute');
	});

	it('tells every beat the goldens do not: the planted fault and its roll, the visitor, the draw, the checks, the approval', () => {
		const text = renderStoryMarkdown(storyForRun({ events: CRAFTED }));
		expect(text).toContain(
			'A fault was planted on that decision: it chose "decline" where the plan had "approve"'
		);
		expect(text).toContain('The roll was 0.0412 against a rate of 0.1.');
		expect(text).toContain('Mrs Okafor said: “I really do not have time.”');
		expect(text).toContain('rule push');
		expect(text).toContain('Pressure 0.9, tags social-engineering.');
		expect(text).toContain('The modelled person (fs-bank/case-handler) drew: took recommendation.');
		expect(text).toContain('Rolls: 0.1200, 0.5000.');
		expect(text).toContain(
			'geap/armor (pre-act) blocked the act — Prompt injection. (could-not-check).'
		);
		expect(text).toContain('geap/armor asked a hosted service (model-armor): ok.');
		expect(text).toContain('1 other check allowed it.');
		expect(text).toContain('R. Viewer (person) declined, overruling what the case recommended');
		expect(text).toContain('The words were rewritten by geap/sdp before they went out.');
		expect(text).toContain('2.4 s at the provider');
	});

	it('puts the truth last — in the ending, never in the chapters', () => {
		const story = storyForRun({ events: CRAFTED });
		expect(JSON.stringify(story.chapters)).not.toContain('cohort-7');
		expect(JSON.stringify(story.facts)).not.toContain('cohort-7');
		const text = renderStoryMarkdown(story);
		expect(text.indexOf('cohort-7')).toBeGreaterThan(text.indexOf('## How it ended'));
		expect(story.ending.truth).toEqual({ shouldHave: 'approve', secretOnlyInTruth: 'cohort-7' });
	});

	it('carries the evaluators’ marks at the end', () => {
		const story = storyForRun({
			events: CRAFTED,
			evaluations: [
				{
					id: 'e1',
					runId: '11111111-1111-4111-8111-111111111111',
					evaluatorId: 'fs-disputes/alert-decision',
					result: {
						evaluatorId: 'fs-disputes/alert-decision',
						verdict: 'fail',
						explanation: 'Declined where it should approve.',
						evidence: []
					},
					evaluatedAt: '2026-10-02T10:00:00.000Z',
					schemaVersion: 1
				}
			]
		});
		expect(renderStoryMarkdown(story)).toContain(
			'- **fs-disputes/alert-decision:** fail — Declined where it should approve.'
		);
	});

	it('escapes everything it prints into the HTML', () => {
		const html = renderStoryHtml(storyForRun({ events: CRAFTED }));
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('<!doctype html>');
		expect(html).not.toMatch(/<script/i);
	});

	it('skips what a story would drown in: plain allowed checks are counted, never listed', () => {
		const chapters = runChapters(CRAFTED);
		const text = JSON.stringify(chapters);
		expect(text).not.toContain('safety/no-fire');
	});
});

describe('the story of one work item through its journey', () => {
	const stored = COMPLAINTS;

	it('tells what arrived without its truth, each stage in order, and the truth last', () => {
		const story = storyForJourney({ run: stored.run, item: stored.item });
		expect(story.subject.kind).toBe('journey');
		const headings = story.chapters.map((chapter) => chapter.heading);
		expect(headings[0]).toBe('What arrived');
		expect(headings.slice(1).map((heading) => heading.split(' — ')[0])).toEqual(
			stored.run.stages.map((stage) => `Stage ${stage.stageId}`)
		);
		const truth = (stored.item as { truth?: unknown }).truth;
		expect(truth).toBeDefined();
		expect(story.ending.truth).toEqual(truth);
		expect(JSON.stringify(story.chapters)).not.toContain(JSON.stringify(truth));
		expect(story.ending.outcome).toBe(stored.run.outcome);
	});

	it('hands a value over the record’s cap to the host’s keeper, or says it is a digest alone', () => {
		const capped = structuredClone(stored.run);
		const digest = 'f'.repeat(64);
		capped.stages[0]!.output = { digest };
		const alone = renderStoryMarkdown(storyForJourney({ run: capped, item: stored.item }));
		expect(alone).toContain(`over the record’s cap — digest ${digest.slice(0, 12)}…`);
		const kept = renderStoryMarkdown(
			storyForJourney({
				run: capped,
				item: stored.item,
				values: (wanted) => (wanted === digest ? { everything: 'kept' } : undefined)
			})
		);
		expect(kept).toContain('{"everything":"kept"} (kept whole, digest ffffffffffff…)');
	});

	it('tells a bot stage’s own run inside the stage', () => {
		const withAgent = storyForJourney({
			run: stored.run,
			item: stored.item,
			agentRuns: new Map([[stored.run.stages[0]!.runId as string, { events: CRAFTED }]])
		});
		const stage = withAgent.chapters.find((chapter) =>
			chapter.heading.startsWith('Stage acknowledge')
		);
		expect(stage?.children?.length).toBeGreaterThan(0);
		expect(renderStoryMarkdown(withAgent)).toContain('### Turn 1');
	});

	it('follows a handoff as its own journey and ends on the last outcome', () => {
		const handing = structuredClone(stored.run);
		handing.outcome = 'handed-off';
		handing.handoff = {
			to: 'fs-fraud/fraud',
			itemId: 'item-2',
			item: { ...(stored.item as object), id: 'item-2' } as never
		};
		const story = storyForJourney({
			run: handing,
			item: stored.item,
			followed: [{ run: stored.run, item: stored.item }]
		});
		const headings = story.chapters.map((chapter) => chapter.heading);
		expect(headings).toContain('Handed off to fs-fraud/fraud');
		expect(headings.at(-1)).toBe(`Then, at ${stored.run.workflowId}`);
		expect(story.ending.outcome).toBe(stored.run.outcome);
	});
});
