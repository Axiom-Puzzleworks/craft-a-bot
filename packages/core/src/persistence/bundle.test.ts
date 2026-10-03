import { describe, expect, it } from 'vitest';
import { makeEvaluation, makeEvent, makeGroupRun, makeRun } from '../testing/storage-fixtures.js';
import { buildTraceBundle, bundleProvenance, verifyBundleDigest } from './bundle.js';
import { parseTraceBundle } from '../schemas/trace-bundle.js';

describe('the trace bundle (WP48)', () => {
	const group = makeGroupRun();
	const [aId, bId] = group.memberRunIds as [string, string];
	const a = makeRun({ id: aId, agentName: 'Robo' });
	const b = makeRun({ id: bId, agentName: 'Bolt' });
	const input = () => ({
		runs: [
			{ run: a, events: [makeEvent(a.id, 1, 1), makeEvent(a.id, 2, 2)] },
			{ run: b, events: [makeEvent(b.id, 1, 3)] }
		],
		group: {
			record: group,
			events: [makeEvent(a.id, 1, 1), makeEvent(b.id, 1, 3), makeEvent(a.id, 2, 2)]
		},
		evaluations: [makeEvaluation({ id: 'e1', runId: a.id })],
		exportedBy: 'test',
		exportedAt: '2026-09-02T12:00:00.000Z'
	});

	it('builds one bundle over a group episode and verifies after a JSON round trip', async () => {
		const bundle = await buildTraceBundle(input());
		expect(bundle.runs.map((trace) => trace.run.agentName)).toEqual(['Robo', 'Bolt']);
		expect(bundle.group?.record.id).toBe(group.id);
		expect(bundle.evaluations).toHaveLength(1);
		const again = parseTraceBundle(JSON.parse(JSON.stringify(bundle)));
		expect(await verifyBundleDigest(again)).toBe(true);
		// The same input builds the same digest — a bundle is reproducible.
		expect((await buildTraceBundle(input())).bundleDigest).toBe(bundle.bundleDigest);
	});

	it('fails after one byte changes — in a member trace, the merged stream, or the evaluations', async () => {
		const bundle = await buildTraceBundle(input());
		const copy = () => parseTraceBundle(JSON.parse(JSON.stringify(bundle)));

		const memberTouched = copy();
		(memberTouched.runs[0]!.events[0] as { tick: number }).tick += 1;
		expect(await verifyBundleDigest(memberTouched)).toBe(false);

		const groupTouched = copy();
		(groupTouched.group!.events[1] as { tick: number }).tick += 1;
		expect(await verifyBundleDigest(groupTouched)).toBe(false);

		const evaluationTouched = copy();
		evaluationTouched.evaluations[0]!.id = 'e2';
		expect(await verifyBundleDigest(evaluationTouched)).toBe(false);

		const digestTouched = copy();
		digestTouched.bundleDigest = digestTouched.bundleDigest.replace(/^./, (c) =>
			c === 'a' ? 'b' : 'a'
		);
		expect(await verifyBundleDigest(digestTouched)).toBe(false);
	});

	it('says a run was replayed beside its digest, never in the trace (WP160, D13)', async () => {
		const live = await buildTraceBundle(input());
		expect(live.replayedFrom).toBeUndefined();
		expect(bundleProvenance(live)).toBeUndefined();

		const from = {
			cassette: 'docs/evidence/lending-stack/lending-stack.provider-cassette.json',
			model: 'Qwen3.5-122B-A10B-NVFP4',
			recorded: '2026-10-02T09:00:00.000Z'
		};
		const replayed = await buildTraceBundle({
			...input(),
			runs: [
				{
					run: { ...a, replayedFrom: from },
					events: [makeEvent(a.id, 1, 1), makeEvent(a.id, 2, 2)]
				},
				{ run: b, events: [makeEvent(b.id, 1, 3)] }
			]
		});
		expect(replayed.replayedFrom).toEqual(from);
		expect(bundleProvenance(replayed)).toBe(
			'replayed from docs/evidence/lending-stack/lending-stack.provider-cassette.json (Qwen3.5-122B-A10B-NVFP4, recorded 2026-10-02T09:00:00.000Z)'
		);
		// The traces are the recording's own; the bundle digest differs by that field alone.
		expect(replayed.runs.map((trace) => trace.traceDigest)).toEqual(
			live.runs.map((trace) => trace.traceDigest)
		);
		expect(replayed.bundleDigest).not.toBe(live.bundleDigest);
		const again = parseTraceBundle(JSON.parse(JSON.stringify(replayed)));
		expect(await verifyBundleDigest(again)).toBe(true);

		// Stripping it, or changing it, is caught: the digest covers it.
		const stripped = parseTraceBundle(JSON.parse(JSON.stringify(replayed)));
		delete stripped.replayedFrom;
		expect(await verifyBundleDigest(stripped)).toBe(false);
		const altered = parseTraceBundle(JSON.parse(JSON.stringify(replayed)));
		altered.replayedFrom = { ...from, model: 'another' };
		expect(await verifyBundleDigest(altered)).toBe(false);
	});

	it('a solo run bundles without a group section, and redacts secrets everywhere', async () => {
		const secret = 'sk-planted-secret';
		const run = makeRun({ agentName: secret });
		const bundle = await buildTraceBundle({
			runs: [{ run, events: [makeEvent(run.id, 1, 1)] }],
			secrets: [secret],
			exportedBy: 'test',
			campaign: { id: 'c', cellId: 'cell-1' }
		});
		expect(bundle.group).toBeUndefined();
		expect(bundle.campaign).toEqual({ id: 'c', cellId: 'cell-1' });
		expect(JSON.stringify(bundle)).not.toContain(secret);
		expect(await verifyBundleDigest(bundle)).toBe(true);
	});
});
