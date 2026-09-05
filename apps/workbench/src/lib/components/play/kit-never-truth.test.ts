import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Kit never opens the flap (WP54, `45-TRUTH-SYNTHETIC.md` §3 principle 7,
 * §4.4): not "closed by default" — *never handed the prop*. The Workshop's
 * Run Lab and Compare pass `truth` to `WorldStage`; the Kit's Play, Duo and
 * Replay routes must not, and this reads their source to say so, the way the
 * engine/UI separation is held by reading imports rather than by trust.
 */
const ROUTES = resolve(import.meta.dirname, '../../../routes');
const KIT_MOUNTS = [
	'play/[agentId]/+page.svelte',
	'play/duo/+page.svelte',
	'replay/[runId]/+page.svelte'
];
const WORKSHOP_MOUNTS = ['workshop/runs/[runId]/+page.svelte', 'workshop/compare/+page.svelte'];

const source = (route: string) => readFileSync(resolve(ROUTES, route), 'utf8');

describe('who may hand WorldStage a truth', () => {
	it('no Kit route passes `truth` to WorldStage', () => {
		for (const route of KIT_MOUNTS) {
			const text = source(route);
			expect(text, route).toContain('<WorldStage');
			expect(text, route).not.toMatch(/\btruth\s*=/);
		}
	});

	it('every Workshop route that mounts WorldStage does', () => {
		for (const route of WORKSHOP_MOUNTS) {
			expect(source(route), route).toMatch(/truth=\{shown\.truth\}/);
		}
	});
});
