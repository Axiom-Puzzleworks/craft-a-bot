import {
	parseTraceBundle,
	verifyBundleDigest,
	type AgentRecord,
	type Storage
} from '@craftabot/core';
import { persistRunSummary } from '$lib/state/run-summaries.js';

/**
 * **Opening a bundle** (WP128, `107-THE-GATE.md` §4): a `craftabot-bundle` — a
 * Gate's day, or any exported episode — verified against its digest and its
 * runs stored, so the Audit Centre, the Runs page and the assurance pack read
 * them as they read a session's. A bundle that fails verification is stored
 * anyway and said so, as a trace is (`17-…` §4.3): examining an artefact that
 * does not match its digest is what a forensic tool is for. A run a Gate
 * carried (`run.started.gate`) brings its agent — the Gate — with it, so the
 * assurance pack has a bot to be about.
 */
export interface BundleImport {
	verified: boolean;
	runs: number;
	/** The Gates the runs came through: `stack in mode`. */
	gates: string[];
	agentIds: string[];
	/** The runs stored, in the bundle's order. */
	runIds: string[];
}

export async function importBundle(
	storage: Storage,
	value: unknown,
	now: string
): Promise<BundleImport> {
	const bundle = parseTraceBundle(value);
	const verified = await verifyBundleDigest(bundle);
	const gates = new Set<string>();
	const agentIds = new Set<string>();
	for (const trace of bundle.runs) {
		await storage.putRun(trace.run);
		await storage.deleteEvents(trace.run.id);
		await storage.appendEvents(trace.run.id, trace.events);
		await persistRunSummary(storage, trace.run.id, trace.events);
		agentIds.add(trace.run.agentId);
		const started = trace.events.find((event) => event.type === 'run.started');
		const gate = started?.type === 'run.started' ? started.payload.gate : undefined;
		if (gate) gates.add(`${gate.stackId} in ${gate.mode}`);
		const spec = trace.run.specSnapshot;
		if (
			gate &&
			'schemaVersion' in spec &&
			spec.schemaVersion === 2 &&
			!(await storage.getAgent(spec.id))
		) {
			const record: AgentRecord = {
				id: spec.id,
				spec,
				lastValidation: [],
				lastRunId: trace.run.id,
				createdAt: now,
				updatedAt: now,
				schemaVersion: 2
			};
			await storage.putAgent(record);
		}
	}
	return {
		verified,
		runs: bundle.runs.length,
		gates: [...gates].sort(),
		agentIds: [...agentIds].sort(),
		runIds: bundle.runs.map((trace) => trace.run.id)
	};
}

/** What the page says after opening one. */
export function describeImport(result: BundleImport): string {
	const through = result.gates.length > 0 ? ` through the Gate (${result.gates.join('; ')})` : '';
	return result.verified
		? `Opened a bundle of ${result.runs} run(s)${through} — digest verified.`
		: `Opened a bundle of ${result.runs} run(s)${through}, but its digest does not match its runs. Treat its contents as unverified.`;
}
