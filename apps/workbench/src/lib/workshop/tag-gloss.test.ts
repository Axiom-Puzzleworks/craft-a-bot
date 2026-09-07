import { describe, expect, it } from 'vitest';
import { glossTag, glossTags } from './tag-gloss.js';

/** A catalogue reference reads as the control's name (UX-16); everything else reads as itself. */
describe('glossTag', () => {
	it('names a catalogue reference the pack tags', () => {
		expect(glossTag('19/#25')).toEqual({
			raw: '19/#25',
			label: 'policy compliance under pressure',
			title: 'control 25 in the governance reference (19/#25)'
		});
	});

	it('still says which control an unlisted reference is', () => {
		expect(glossTag('19/#7').label).toBe('control 7');
	});

	it('leaves an obligation tag exactly as written', () => {
		expect(glossTag('fca:cobs-9:suitability')).toEqual({
			raw: 'fca:cobs-9:suitability',
			label: 'fca:cobs-9:suitability'
		});
	});

	it('joins a row of tags for a text cell', () => {
		expect(glossTags(['fca:cd:support', '19/#25'])).toBe(
			'fca:cd:support · policy compliance under pressure'
		);
	});
});
