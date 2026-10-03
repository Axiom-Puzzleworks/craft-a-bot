import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Story } from '@craftabot/governance/reports';
import StoryView from './StoryView.svelte';

/** The story view (WP161): the fold's chapters and ending as text — and the truth only at the end. */
const STORY: Story = {
	version: 1,
	subject: { kind: 'run', id: 'r1', title: 'A run' },
	facts: [
		{ label: 'Model', value: 'Qwen through dgx-spark' },
		{ label: 'Answers', value: 'replayed from a.json — not a live call' }
	],
	chapters: [
		{
			heading: 'Turn 1',
			beats: [
				{ kind: 'saw', text: 'It saw: a case.' },
				{
					kind: 'planted',
					text: 'A fault was planted.',
					detail: ['The roll was 0.0412 against a rate of 0.1.']
				}
			]
		},
		{
			heading: 'Stage triage — the bot',
			note: 'ok; ticks 0–1',
			beats: [{ kind: 'told', text: 'Given: {}' }],
			children: [{ heading: 'Turn 1', beats: [{ kind: 'did', text: 'It did say.' }] }]
		}
	],
	ending: {
		outcome: 'SUCCESS',
		truth: { shouldHave: 'approve' },
		truthNote: 'The world’s own account of the case.',
		marks: [{ evaluator: 'alert-decision', verdict: 'fail', explanation: 'Declined.' }]
	}
};

describe('StoryView', () => {
	it('draws the facts, each chapter with its beats and nested run, and the ending last', () => {
		render(StoryView, { props: { story: STORY } });
		const facts = screen.getByTestId('story-facts');
		expect(within(facts).getByText('replayed from a.json — not a live call')).toBeTruthy();
		expect(screen.getByText(/It saw: a case\./)).toBeTruthy();
		expect(screen.getByText(/A fault was planted\./)).toBeTruthy();
		expect(screen.getByText('The roll was 0.0412 against a rate of 0.1.')).toBeTruthy();
		expect(screen.getByText('ok; ticks 0–1')).toBeTruthy();
		expect(screen.getByText(/It did say\./)).toBeTruthy();
		const ending = screen.getByTestId('story-ending');
		expect(within(ending).getByText(/SUCCESS/)).toBeTruthy();
		expect(within(ending).getByText(/alert-decision:/)).toBeTruthy();
		expect(screen.getByTestId('story-truth').textContent).toContain('"shouldHave": "approve"');
		// The truth is in the ending alone.
		const text = screen.getByTestId('story').textContent ?? '';
		expect(text.indexOf('shouldHave')).toBeGreaterThan(text.indexOf('It did say.'));
	});

	it('says so when nothing was recorded as truth', () => {
		render(StoryView, {
			props: {
				story: {
					...STORY,
					ending: { outcome: 'SUCCESS', truthNote: 'No truth was recorded.', marks: [] }
				}
			}
		});
		expect(screen.getByText(/No truth was recorded\./)).toBeTruthy();
		expect(screen.queryByTestId('story-truth')).toBeNull();
	});
});
