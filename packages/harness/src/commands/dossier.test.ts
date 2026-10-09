import { describe, expect, it } from 'vitest';
import { dossierFiles, dossiersFor, deskOf } from './dossier.js';

/**
 * **`craftabot dossier`** (plan 114 WP214): a dossier for every live design in the committed evidence, folded from the results alone, the
 * same bytes every time (the folding time is the newest result's own), and the committed files are exactly what it folds to.
 */
const EVIDENCE = 'docs/evidence';

describe('craftabot dossier', () => {
	it('names the desk of a live design', () => {
		expect(deskOf('lending-stack-live')).toBe('lending');
		expect(deskOf('lending-grey-live')).toBe('lending');
		expect(deskOf('advice-context-live')).toBe('advice');
		expect(deskOf('disputes-escalate-live')).toBe('disputes');
		expect(deskOf('lending-oversight-live')).toBe('lending');
	});

	it('folds a dossier for every live design under each model, leaving the companions out of the subjects', async () => {
		const runs = await dossiersFor({ evidenceDir: EVIDENCE });
		const ids = runs.map((run) => run.dossier.id);
		expect(ids.some((id) => id.startsWith('controls-live'))).toBe(false);
		expect(ids.some((id) => id.includes('-oversight-live'))).toBe(false);
		expect(ids.filter((id) => id.startsWith('lending-stack-live')).length).toBe(2);
		for (const { dossier } of runs) {
			expect(dossier.measures).toHaveLength(8);
			// A model is a sample of its tier: the dossier says whose it is and never ranks.
			expect(dossier.model).toMatch(/Qwen/);
		}
		// The 122B's lending dossier uses the oversight design and the attack scenarios of the same model.
		const lending = runs.find((run) => run.dossier.id.startsWith('lending-stack-live@Qwen3.5'))!;
		const sources = lending.dossier.measures.flatMap((m) =>
			m.source ? [m.source.experimentId] : []
		);
		expect(sources).toContain('controls-live');
		expect(sources).toContain('lending-oversight-live');
	}, 60_000);

	it('is deterministic, and the committed files are what the evidence folds to', async () => {
		const a = dossierFiles(await dossiersFor({ evidenceDir: EVIDENCE }), 'out');
		const b = dossierFiles(await dossiersFor({ evidenceDir: EVIDENCE }), 'out');
		expect([...a]).toEqual([...b]);
	}, 60_000);
});
