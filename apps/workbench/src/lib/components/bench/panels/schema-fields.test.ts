import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import monitorPack from '@craftabot/pack-monitor';
import { bandLabel, describeFields, humanise } from './schema-fields.js';

/**
 * **What a brick with no hand-written panel gets** (WP14 slice 4a).
 *
 * The contract's open-ness, stated as a unit test: every schema here belongs to
 * a brick invented in this file, and the assertion is that the bench can offer
 * controls for it anyway.
 */

describe('inferring controls from a schema alone', () => {
	it('gives a boolean a rocker switch', () => {
		const [field] = describeFields(z.object({ chatty: z.boolean() }));
		expect(field?.control).toEqual({ kind: 'switch' });
	});

	it('gives a string a text field', () => {
		const [field] = describeFields(z.object({ motto: z.string() }));
		expect(field?.control.kind).toBe('text');
	});

	it('gives a bounded number its bounds', () => {
		const [field] = describeFields(z.object({ heat: z.number().min(0).max(2) }));
		expect(field?.control).toMatchObject({ kind: 'number', min: 0, max: 2 });
	});

	it('enumerates a union of literals into a choice', () => {
		const [field] = describeFields(
			z.object({ span: z.union([z.literal(3), z.literal(10), z.literal(30)]) })
		);
		expect(field?.control).toEqual({
			kind: 'choice',
			options: [
				{ value: 3, label: '3' },
				{ value: 10, label: '10' },
				{ value: 30, label: '30' }
			]
		});
	});

	/**
	 * `z.enum(...)`'s own internal shape keys its values under `entries`, not
	 * `values` — every other test above reaches 'choice' through a
	 * `z.union([z.literal(...)])`, which does carry `values`, so a reader that
	 * only ever looked for `values` passed every test here while rendering a
	 * real `z.enum(...)` field (`pack-geap`'s own `screenObservation` et al.)
	 * as an empty, unselectable dropdown on the actual bench.
	 */
	it('enumerates a real z.enum into a choice, not an empty one', () => {
		const [field] = describeFields(z.object({ mode: z.enum(['off', 'note', 'stop']) }));
		expect(field?.control).toEqual({
			kind: 'choice',
			options: [
				{ value: 'off', label: 'off' },
				{ value: 'note', label: 'note' },
				{ value: 'stop', label: 'stop' }
			]
		});
	});

	it('enumerates a z.enum(...).default(...) into a choice too', () => {
		const [field] = describeFields(
			z.object({ mode: z.enum(['off', 'note', 'stop']).default('off') })
		);
		expect(field?.control.kind).toBe('choice');
		expect(field?.control.kind === 'choice' ? (field.control.options?.length ?? 0) : 0).toBe(3);
	});

	/** WP39 stage E (`29-…` §4.6): a choice drawn from a catalogue, and a nested object with dotted hints. */
	it('draws a hinted choice from a catalogue source, and a nested object as its own fields', () => {
		const fields = describeFields(
			z.object({
				serviceId: z.string().default(''),
				screening: z
					.object({
						screenDecision: z.enum(['off', 'ask']).default('ask'),
						offline: z.boolean().default(false)
					})
					.prefault({})
			}),
			{
				serviceId: { control: 'choice', source: 'guardrailServices', label: 'Guard' },
				screening: { label: 'Screens' },
				'screening.screenDecision': { label: 'Screen what it decides' }
			}
		);
		expect(fields[0]?.control).toEqual({ kind: 'choice', source: 'guardrailServices' });
		expect(fields[0]?.label).toBe('Guard');
		const nested = fields[1]?.control;
		expect(nested?.kind).toBe('object');
		if (nested?.kind !== 'object') throw new Error('expected an object control');
		expect(fields[1]?.label).toBe('Screens');
		expect(nested.fields.map((f) => [f.name, f.label, f.control.kind])).toEqual([
			['screenDecision', 'Screen what it decides', 'choice'],
			['offline', 'Offline', 'switch']
		]);
	});

	it('marks an optional field optional, and still reads its shape', () => {
		const [field] = describeFields(z.object({ limit: z.number().min(2).max(10).optional() }));
		expect(field?.optional).toBe(true);
		expect(field?.control).toMatchObject({ kind: 'number', min: 2, max: 10 });
	});

	it('labels a field from its name when the kind offers nothing better', () => {
		const [field] = describeFields(z.object({ maxTicks: z.number() }));
		expect(field?.label).toBe('Max ticks');
	});

	it('keeps schema order, so a half-hinted kind still shows everything', () => {
		const fields = describeFields(
			z.object({ first: z.string(), second: z.boolean(), third: z.number() }),
			{ third: { label: 'The third one' } }
		);
		expect(fields.map((field) => field.name)).toEqual(['first', 'second', 'third']);
	});

	/**
	 * The honest bad control. An array of strings with no `source` is a field
	 * nothing can enumerate — which is exactly the case `source` exists to
	 * prevent, and worth pinning so the difference is visible.
	 */
	it('falls back to a typed list for an array with no source', () => {
		const [field] = describeFields(z.object({ watchFor: z.array(z.string()) }));
		expect(field?.control).toEqual({ kind: 'idList' });
	});
});

describe('what hints add on top', () => {
	it('turns an array into a checklist over a named catalogue', () => {
		const [field] = describeFields(z.object({ watchFor: z.array(z.string()) }), {
			watchFor: { control: 'checklist', source: 'actions', label: 'Watch for' }
		});
		expect(field?.control).toEqual({ kind: 'checklist', source: 'actions' });
		expect(field?.label).toBe('Watch for');
	});

	it('turns a bounded number into a dial with word bands', () => {
		const [field] = describeFields(z.object({ twitch: z.number().min(0).max(2) }), {
			twitch: {
				control: 'dial',
				label: 'How twitchy?',
				options: [
					{ value: 0.5, label: 'relaxed' },
					{ value: 1.5, label: 'normal' },
					{ value: 2, label: 'hair-trigger' }
				]
			}
		});
		expect(field?.control).toMatchObject({
			kind: 'dial',
			min: 0,
			max: 2,
			bands: [
				{ upTo: 0.5, label: 'relaxed' },
				{ upTo: 1.5, label: 'normal' },
				{ upTo: 2, label: 'hair-trigger' }
			]
		});
	});

	/**
	 * The gap the Watchbot prototype found (WP14 DoD).
	 *
	 * `source` names one of core's four catalogues, and a Monitor's watch rules
	 * are in none of them — they are the pack's own content. Without this the
	 * field fell back to a text box for typing ids into, which is a poor control
	 * and, on a brick whose whole subject is oversight, an embarrassing one.
	 */
	it('ticks a kind’s own options when no catalogue has them', () => {
		const [field] = describeFields(z.object({ watchFor: z.array(z.string()) }), {
			watchFor: {
				control: 'checklist',
				label: 'Watch out for',
				options: [
					{ value: 'monitor/going-in-circles', label: 'Going in circles' },
					{ value: 'monitor/all-talk', label: 'All talk, no doing' }
				]
			}
		});
		expect(field?.control).toEqual({
			kind: 'checklist',
			entries: [
				{ id: 'monitor/going-in-circles', name: 'Going in circles' },
				{ id: 'monitor/all-talk', name: 'All talk, no doing' }
			]
		});
	});

	/**
	 * 270° of travel between unknown ends is a guess, not a control. A kind that
	 * asks for a dial without bounding its number gets a number field, rather
	 * than a dial that lies about where the ends are.
	 */
	it('refuses a dial for a number with no bounds', () => {
		const [field] = describeFields(z.object({ twitch: z.number() }), {
			twitch: { control: 'dial', label: 'How twitchy?' }
		});
		expect(field?.control.kind).toBe('number');
	});

	it('puts kit words on the values a schema only knows as numbers', () => {
		const [field] = describeFields(z.object({ span: z.union([z.literal(3), z.literal(30)]) }), {
			span: { options: [{ value: 3, label: 'Goldfish (3 turns)' }] }
		});
		expect(field?.control).toEqual({
			kind: 'choice',
			options: [
				{ value: 3, label: 'Goldfish (3 turns)' },
				// Unlabelled values keep their own, rather than disappearing.
				{ value: 30, label: '30' }
			]
		});
	});
});

describe('dial bands', () => {
	const bands = [
		{ upTo: 0.5, label: 'relaxed' },
		{ upTo: 1.5, label: 'normal' },
		{ upTo: 2, label: 'hair-trigger' }
	];

	it('takes the first band the value has not passed', () => {
		expect(bandLabel(0.2, bands)).toBe('relaxed');
		expect(bandLabel(0.5, bands)).toBe('relaxed');
		expect(bandLabel(0.6, bands)).toBe('normal');
		expect(bandLabel(2, bands)).toBe('hair-trigger');
	});

	it('holds the top band above the last bound', () => {
		expect(bandLabel(99, bands)).toBe('hair-trigger');
	});

	it('says nothing when a dial has no bands', () => {
		expect(bandLabel(1, undefined)).toBeUndefined();
		expect(bandLabel(1, [])).toBeUndefined();
	});
});

describe('humanise', () => {
	it('splits camel case and sentence-cases the result', () => {
		expect(humanise('maxTicks')).toBe('Max ticks');
		expect(humanise('blocked_actions')).toBe('Blocked actions');
		expect(humanise('watchFor')).toBe('Watch for');
	});
});

describe('the Watchbot prototype, through the real pack', () => {
	/**
	 * **The WP14 definition of done, from the bench's side.**
	 *
	 * `@craftabot/pack-monitor` is a real workspace package that depends on core
	 * and zod. Nothing in the workbench is written for it — no panel, no art, no
	 * entry in any table — and it still gets a working, kit-shaped control.
	 */
	it('gets a checklist of its own rules, with no workbench code written for it', () => {
		const kind = (monitorPack.brickKinds ?? [])[0];
		if (!kind) throw new Error('the monitor pack registers no brick kinds');

		const [field] = describeFields(kind.configSchema, kind.controlHints);
		expect(field?.label).toBe('Watch out for');
		expect(field?.control.kind).toBe('checklist');
		expect(
			field?.control.kind === 'checklist'
				? field.control.entries?.map((entry) => entry.name)
				: undefined
		).toEqual(['Going in circles', 'All talk, no doing', 'Keeps trying what it may not do']);
	});
});
