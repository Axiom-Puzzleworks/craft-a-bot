import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	buildTraceBundle,
	evidenceIdFor,
	evidenceItemFor,
	parseContentRecord,
	verifyBundleDigest,
	verifyEvidenceItem,
	type EvidenceItem,
	type EvidenceKind,
	type EvidenceQuery,
	type EvidenceReceipt,
	type EvidenceStoreInstance,
	type PackRegistry,
	stackSchema
} from '@craftabot/core';
import type { FileStorage } from '../storage/file-storage.js';
import { bundleGroup } from './bundle.js';
import { reportAssurance } from './assurance.js';

/**
 * **`craftabot evidence push|pull`** (`58-EVIDENCE-STORE.md` §4.4, WP70):
 * the harness half of the shared evidence store. `push` builds one item
 * from the file store — a run as its bundle (redacted against every secret
 * the process holds, as `bundle` is), a group as its bundle, a campaign
 * report as the store keeps it, the assurance pack for a bot, a content
 * record from its file — and hands it to the store. `pull` takes every
 * item the query matches, verifies its digest (and a bundle's own), refuses
 * one that fails, and writes the rest under a directory as files the
 * Workshop imports. The store is never on a run's path; a failure is the
 * command's exit code, never a run's.
 */

export interface PushEvidenceOptions {
	storage: FileStorage;
	registry: PackRegistry;
	instance: EvidenceStoreInstance;
	secrets: readonly string[];
	what:
		| { kind: 'run'; runId: string }
		| { kind: 'group'; groupRunId: string }
		| { kind: 'campaign-report'; reportId: string }
		| { kind: 'assurance-pack'; agentId?: string }
		| { kind: 'content'; file: string }
		| { kind: 'stack'; file: string };
	principal?: string;
	now?: () => number;
}

export async function itemToPush(
	options: Omit<PushEvidenceOptions, 'instance'>
): Promise<EvidenceItem> {
	const { storage, what } = options;
	const itemOptions = {
		...(options.now ? { now: options.now } : {}),
		...(options.principal ? { principal: options.principal } : {})
	};
	switch (what.kind) {
		case 'run': {
			const run = await storage.getRun(what.runId);
			if (!run) throw new Error(`no run '${what.runId}' in ${storage.root}`);
			const events = (await storage.getEvents(what.runId)).map((row) => row.event);
			const evaluations = await storage.listEvaluations(what.runId);
			const bundle = await buildTraceBundle({
				runs: [{ run, events }],
				evaluations,
				secrets: options.secrets,
				exportedBy: 'craftabot-harness/0.0.1'
			});
			return evidenceItemFor('bundle', evidenceIdFor('bundle', bundle), bundle, itemOptions);
		}
		case 'group': {
			const bundle = await bundleGroup(storage, what.groupRunId, options.secrets);
			return evidenceItemFor('bundle', evidenceIdFor('bundle', bundle), bundle, itemOptions);
		}
		case 'campaign-report': {
			const report = await storage.getCampaignReport(what.reportId);
			if (!report) throw new Error(`no campaign report '${what.reportId}' in ${storage.root}`);
			return evidenceItemFor('campaign-report', report.id, report, itemOptions);
		}
		case 'assurance-pack': {
			const { pack } = await reportAssurance(storage, options.registry, what.agentId);
			const payload = pack as unknown as Record<string, unknown>;
			return evidenceItemFor(
				'assurance-pack',
				evidenceIdFor('assurance-pack', payload),
				payload,
				itemOptions
			);
		}
		case 'content': {
			const record = parseContentRecord(JSON.parse(await readFile(what.file, 'utf8')));
			return evidenceItemFor('content', record.id, record, itemOptions);
		}
		case 'stack': {
			// WP97 (`89-…` §6): a stack file, parsed by its schema, under its own id.
			const stack = stackSchema.parse(JSON.parse(await readFile(what.file, 'utf8')));
			return evidenceItemFor('stack', stack.id, stack, itemOptions);
		}
	}
}

export async function pushEvidence(options: PushEvidenceOptions): Promise<EvidenceReceipt> {
	const item = await itemToPush(options);
	return options.instance.push(item);
}

export interface PullEvidenceOptions {
	instance: EvidenceStoreInstance;
	query: EvidenceQuery;
	/** Where the files go: `<dir>/<kind>/<id as a path>.json` (a bundle as `.craftabot-bundle.json`). */
	dir: string;
}

export interface PulledItem {
	kind: EvidenceKind;
	id: string;
	digest: string;
	verified: boolean;
	file?: string;
}

/** The file an item lands in; the id's slashes become directories, so a `local/…` id keeps its shape. */
export function pulledPathFor(dir: string, item: Pick<EvidenceItem, 'kind' | 'id'>): string {
	const safe = item.id.replace(/[^A-Za-z0-9._\-/]/g, '_').replace(/\.\.+/g, '_');
	return join(
		dir,
		item.kind,
		item.kind === 'bundle' ? `${safe}.craftabot-bundle.json` : `${safe}.json`
	);
}

export async function pullEvidence(options: PullEvidenceOptions): Promise<PulledItem[]> {
	const pulled: PulledItem[] = [];
	for await (const item of options.instance.pull(options.query)) {
		let verified = await verifyEvidenceItem(item);
		if (verified && item.kind === 'bundle') verified = await verifyBundleDigest(item.payload);
		const line: PulledItem = { kind: item.kind, id: item.id, digest: item.digest, verified };
		if (verified) {
			const file = pulledPathFor(options.dir, item);
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, `${JSON.stringify(item.payload, null, '\t')}\n`, 'utf8');
			line.file = file;
		}
		pulled.push(line);
	}
	return pulled;
}

export function renderPulled(pulled: readonly PulledItem[]): string {
	if (pulled.length === 0) return 'nothing to pull\n';
	return (
		pulled
			.map(
				(line) =>
					`${line.verified ? 'verified' : 'REFUSED '} ${line.kind.padEnd(15)} ${line.id}  ${line.digest.slice(0, 12)}${line.file ? `  → ${line.file}` : ''}`
			)
			.join('\n') + '\n'
	);
}
