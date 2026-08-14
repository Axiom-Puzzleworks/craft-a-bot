import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchema,
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
	safety: safetyBrickSchema
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

describe('the leaflet covers the kit', () => {
	it('teaches every control a builder can set', () => {
		const untaught = configurableControls().filter((control) => !taughtControls().has(control));

		// A new field lands here. Point a chapter at it, or add it to that
		// chapter's `controls` with the step that covers it — but decide.
		expect(untaught).toEqual([]);
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
