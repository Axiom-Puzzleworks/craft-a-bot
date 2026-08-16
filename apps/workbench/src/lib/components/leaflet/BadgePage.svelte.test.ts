import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '$lib/leaflet/chapters.js';
import { SIDE_QUESTS } from '$lib/leaflet/side-quests.js';
import BadgePage from './BadgePage.svelte';

/**
 * The sticker sheet, once it is drawn (WP18).
 *
 * `20-…` §5.5 delivers **one** rosette for **seven** chapters and says in as
 * many words: do not bake a count. That only holds if the app really does put
 * the number in — an eighth chapter with no eighth artefact is the thing being
 * bought here, and it is cheap to lose by drawing the badge some other way.
 */
describe('the rosettes', () => {
	it('moulds each chapter number into its own badge', () => {
		render(BadgePage, { props: { earned: [] } });

		for (const chapter of CHAPTERS) {
			const badge = screen.getByTestId(`badge-${chapter.badge.id}`);
			expect(badge.querySelector('[data-part="emboss"]')?.textContent).toBe(String(chapter.number));
		}
	});

	it('draws seven badges from one template', () => {
		render(BadgePage, { props: { earned: [] } });
		expect(screen.getByTestId('badge-page').querySelectorAll('svg')).toHaveLength(CHAPTERS.length);
		// Seven inlined copies and not one id between them — see `assets/inline.ts`.
		expect(screen.getByTestId('badge-page').innerHTML).not.toMatch(/\bid="/);
	});

	it('shows the earned treatment only on the ones earned', () => {
		const first = CHAPTERS[0]!;
		const second = CHAPTERS[1]!;
		render(BadgePage, { props: { earned: [first.badge.id] } });

		const earnedLayer = (badgeId: string) =>
			screen
				.getByTestId(`badge-${badgeId}`)
				.querySelector('[data-part="state-earned"]')
				?.getAttribute('display');

		expect(earnedLayer(first.badge.id)).toBeNull();
		expect(earnedLayer(second.badge.id)).toBe('none');
	});

	it('says which is which in words as well as in gold', () => {
		// Never colour alone (03 §8) — and never a dimmed one either (`04-…` §2.3).
		render(BadgePage, { props: { earned: [CHAPTERS[0]!.badge.id] } });
		expect(screen.getByTestId('badge-page').textContent).toContain('Earned');
		expect(screen.getByTestId('badge-page').textContent).toContain('Not yet');
	});
});

/**
 * Side quests (`18-…` WP25): a reference, not a second progression system —
 * so there is nothing here to earn, only something to read.
 */
describe('the side quests', () => {
	it('names every scenario, with no tracking or earned state to render', () => {
		render(BadgePage, { props: { earned: [] } });

		for (const quest of SIDE_QUESTS) {
			const entry = screen.getByTestId(`side-quest-${quest.id}`);
			expect(entry.textContent).toContain(quest.title);
			expect(entry.textContent).toContain(quest.teaches);
		}
	});

	it('sits apart from the merit badges, in its own page', () => {
		render(BadgePage, { props: { earned: [] } });
		const questPage = screen.getByTestId('side-quest-page');
		expect(questPage.querySelectorAll('svg')).toHaveLength(0);
		for (const chapter of CHAPTERS) {
			expect(questPage.textContent).not.toContain(chapter.badge.name);
		}
	});
});
