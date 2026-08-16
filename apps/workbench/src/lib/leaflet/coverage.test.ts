import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchemaV2,
	senseBrickSchema,
	toolsBrickSchema
} from '@craftabot/core';
import { CHAPTERS } from './chapters.js';

/**
 * **Every dial gets taught** (`16-…` §2.2 acceptance: "every configurable
 * control referenced by at least one chapter/side-quest").
 *
 * The leaflet review found the dials were the gap: a child can set a
 * temperature, a memory span and a notebook, and no chapter ever mentions any
 * of them. A control nobody explains is a control nobody turns — and the
 * settings that most change how an agent behaves were the ones with no lesson.
 *
 * Enumerated from the schemas rather than a hand-kept list, so a brick that
 * grows a new field fails here until somebody decides where it is taught. That
 * is the same trick as WP12's dead-config audit, and for the same reason:
 * deciding is the point, not passing.
 */
const BRICK_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
	llm: llmBrickSchema,
	memory: memoryBrickSchema,
	tools: toolsBrickSchema,
	sense: senseBrickSchema,
	actions: actionsBrickSchema,
	// v2 (WP24): the schema the panel actually edits — `brick.config` is always
	// shown post-migration (`BrickPanel.svelte`) — not v1's frozen, historical shape.
	safety: safetyBrickSchemaV2
};

/** Every `brick.field` a builder can set. */
function configurableControls(): string[] {
	return Object.entries(BRICK_SCHEMAS).flatMap(([brick, schema]) =>
		Object.keys(schema.shape).map((field) => `${brick}.${field}`)
	);
}

/** Every control any chapter claims to teach. */
function taughtControls(): Set<string> {
	return new Set(CHAPTERS.flatMap((chapter) => chapter.controls ?? []));
}

/**
 * **Controls the kit bench never offers**, each with the reason (WP15).
 *
 * A leaflet cannot teach a dial a child has no way to reach, and pretending
 * otherwise would put a chapter in front of a control that is not on the
 * screen. So an entry here is a claim — *the Kit does not show this* — and the
 * test below holds it to that claim rather than taking it on trust. An
 * exemption nobody checks is how a list like this rots into a place to put
 * inconvenient fields.
 */
const WORKSHOP_ONLY: Record<string, string> = {
	'memory.strategy':
		'Realism mode (E7): `transcript` sends the model a real function-calling conversation instead of the prose history. A Workshop control — the comparison it exists for is one a professional makes, and the kit bench renders the Scrapbook panel by hand without it.',
	'safety.autonomy':
		'The Levels-of-Autonomy preset dial (`19-…` §8.1, WP24) — a Workshop shortcut that writes concrete values into `approval` (and suggested budgets) when picked. The engine never reads it, and the kit bench renders the Safety panel by hand without it, teaching `approval` directly instead.'
};

describe('the leaflet covers the kit', () => {
	it('teaches every control a builder can set', () => {
		const untaught = configurableControls().filter(
			(control) => !taughtControls().has(control) && !(control in WORKSHOP_ONLY)
		);

		// A new field lands here. Point a chapter at it, or add it to that
		// chapter's `controls` with the step that covers it — but decide.
		expect(untaught).toEqual([]);
	});

	/**
	 * The exemption, enforced by opening the panel and looking.
	 *
	 * What keeps `strategy` off the kit bench is that `starter/memory` has a
	 * hand-written panel which does not mention it. Asserting merely that the
	 * override *exists* would pass just as happily if somebody added the control
	 * to it — so this renders the panel a builder actually gets and holds it to
	 * offering nothing but the two dials the leaflet teaches.
	 */
	it('offers no Workshop-only control on the kit bench', async () => {
		const { render } = await import('@testing-library/svelte');
		const MemoryPanel = (await import('$lib/components/bench/panels/MemoryPanel.svelte')).default;

		const { container } = render(MemoryPanel, {
			props: {
				config: { windowSize: 10, notebook: false },
				onupdate: () => {}
			} as never
		});

		/*
		 * Everything the panel puts on the screen — legends, labels, hints and the
		 * inputs' own names. Read from the rendered markup rather than from the
		 * inputs alone: a `Rocker`'s label is a sibling of its checkbox, so
		 * collecting control elements and reading their text sees a switch with no
		 * words next to it and passes whatever it is called.
		 */
		const offered = (
			container.textContent +
			' ' +
			[...container.querySelectorAll('input')].map((input) => input.name).join(' ')
		).toLowerCase();

		for (const control of Object.keys(WORKSHOP_ONLY)) {
			const field = control.split('.')[1] as string;
			expect(offered, `the kit bench offers ${control}`).not.toContain(field.toLowerCase());
		}
		expect(offered).not.toContain('transcript');
		// The panel really did render, so the assertions above had something to see.
		expect(offered).toContain('notebook');
	});

	/** A reason nobody wrote is an exemption nobody decided. */
	it('gives a reason for every exemption, and exempts nothing invented', () => {
		const real = new Set(configurableControls());
		for (const [control, reason] of Object.entries(WORKSHOP_ONLY)) {
			expect(real.has(control), `${control} is not a real control`).toBe(true);
			expect(reason.length).toBeGreaterThan(40);
		}
	});

	/** A chapter claiming to teach a control that no longer exists is a stale promise. */
	it('claims nothing that is not a real control', () => {
		const real = new Set(configurableControls());
		const invented = [...taughtControls()].filter((control) => !real.has(control));

		expect(invented).toEqual([]);
	});

	it('gives every chapter a badge nobody else has', () => {
		const badges = CHAPTERS.map((chapter) => chapter.badge.id);

		expect(new Set(badges).size).toBe(badges.length);
	});
});
