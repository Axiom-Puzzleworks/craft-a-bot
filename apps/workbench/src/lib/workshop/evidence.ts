import {
	evidenceIdFor,
	evidenceItemFor,
	verifyBundleDigest,
	verifyEvidenceItem,
	type ContentRecord,
	type EvidenceItem,
	type ExperimentResult,
	type GroupRunRecord,
	type RunRecord,
	type Storage,
	type StoredCampaignReport,
	stackSchema,
	localContentId,
	slugOf,
	type Stack
} from '@craftabot/core';
import { bundleForGroup, bundleForRun } from './bundles.js';

/**
 * **Evidence items from the Workshop's store, and back into it** (`58-…`
 * §4.5, WP70). Building an item is the Audit Centre's download with a
 * digest stamped; importing one is the Run Browser's import with the
 * file arriving over the network — the item's digest checked first, and a
 * bundle's own digest checked besides, exactly as an imported file's is.
 * An item that fails either is refused and nothing is written.
 */

export interface ItemOptions {
	principal?: string;
	now?: () => number;
}

export async function itemForRun(
	storage: Storage,
	run: RunRecord,
	secrets: readonly string[],
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	const bundle = await bundleForRun(storage, run, secrets);
	return evidenceItemFor('bundle', evidenceIdFor('bundle', bundle), bundle, options);
}

export async function itemForGroup(
	storage: Storage,
	group: GroupRunRecord,
	secrets: readonly string[],
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	const bundle = await bundleForGroup(storage, group, secrets);
	return evidenceItemFor('bundle', evidenceIdFor('bundle', bundle), bundle, options);
}

export function itemForReport(
	report: StoredCampaignReport,
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	return evidenceItemFor('campaign-report', report.id, report, options);
}

/** WP89: an experiment's result, under its own id (`<experimentId>@<ranAt>`). */
export function itemForExperimentResult(
	result: ExperimentResult,
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	return evidenceItemFor('experiment-result', result.id, result, options);
}

export function itemForAssurance(
	pack: Record<string, unknown>,
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	return evidenceItemFor('assurance-pack', evidenceIdFor('assurance-pack', pack), pack, options);
}

export function itemForContent(
	record: ContentRecord,
	options: ItemOptions = {}
): Promise<EvidenceItem> {
	return evidenceItemFor('content', record.id, record, options);
}

/** WP97 (`89-…` §6): a stack under its own id, with its digest. */
export function itemForStack(stack: Stack, options: ItemOptions = {}): Promise<EvidenceItem> {
	return evidenceItemFor('stack', stack.id, stack, options);
}

/** Both checks a pulled item must pass before it is stored (`58-…` §2 item 2). */
export async function verifyPulled(item: EvidenceItem): Promise<boolean> {
	if (!(await verifyEvidenceItem(item))) return false;
	if (item.kind === 'bundle') return verifyBundleDigest(item.payload);
	return true;
}

export type Imported =
	| { kind: 'bundle'; runIds: string[]; groupId?: string }
	| { kind: 'campaign-report'; id: string }
	| { kind: 'content'; id: string }
	| { kind: 'assurance-pack'; id: string }
	// WP84 (`75-THE-MONITOR.md` §6): the Monitor's artefacts have no local store either — offered as a download, read by the Monitor's seam.
	| { kind: 'workflow-run'; id: string }
	| { kind: 'bank-run'; id: string }
	// WP89 (`72-EXPERIMENTS.md` §4): a result lands in the experiment-results store; a design has no local store.
	| { kind: 'experiment'; id: string }
	| { kind: 'experiment-result'; id: string }
	// WP97 (`89-STACKS.md` §6): a stack lands in the content store as a local record.
	| { kind: 'stack'; id: string };

/**
 * Store a verified item locally: a bundle as its runs (records, events,
 * evaluations) and its group record, a report into the campaign reports,
 * content through the caller's content store. An assurance pack has no
 * local store — the caller offers it as a download. Refuses an item that
 * does not verify.
 */
export async function importPulled(
	storage: Storage,
	item: EvidenceItem,
	deps: { saveContent(record: ContentRecord): Promise<void> }
): Promise<Imported> {
	if (!(await verifyPulled(item))) {
		throw new Error(`${item.kind} "${item.id}" does not verify — refused`);
	}
	switch (item.kind) {
		case 'bundle': {
			const runIds: string[] = [];
			for (const trace of item.payload.runs) {
				await storage.deleteEvents(trace.run.id);
				await storage.putRun(trace.run);
				await storage.appendEvents(trace.run.id, trace.events);
				for (const evaluation of trace.evaluations ?? []) await storage.putEvaluation(evaluation);
				runIds.push(trace.run.id);
			}
			if (item.payload.group) {
				await storage.deleteEvents(item.payload.group.record.id);
				await storage.putGroupRun(item.payload.group.record);
				await storage.appendEvents(item.payload.group.record.id, item.payload.group.events);
				return { kind: 'bundle', runIds, groupId: item.payload.group.record.id };
			}
			return { kind: 'bundle', runIds };
		}
		case 'campaign-report':
			await storage.putCampaignReport(item.payload);
			return { kind: 'campaign-report', id: item.id };
		case 'content':
			await deps.saveContent(item.payload);
			return { kind: 'content', id: item.id };
		case 'assurance-pack':
			return { kind: 'assurance-pack', id: item.id };
		case 'workflow-run':
			return { kind: 'workflow-run', id: item.id };
		case 'bank-run':
			return { kind: 'bank-run', id: item.id };
		case 'experiment':
			return { kind: 'experiment', id: item.id };
		case 'experiment-result':
			await storage.putExperimentResult(item.payload);
			return { kind: 'experiment-result', id: item.id };
		case 'stack': {
			// A pulled stack lands in the content store as a local record (WP97), so the Spec Lab can fit it.
			const stack = stackSchema.parse(item.payload);
			await deps.saveContent({
				id: localContentId('stack', slugOf(stack.name)),
				kind: 'stack',
				title: stack.name,
				record: stack,
				savedAt: new Date().toISOString(),
				schemaVersion: 1
			});
			return { kind: 'stack', id: item.id };
		}
	}
}
