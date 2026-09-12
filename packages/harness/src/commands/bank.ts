import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	localPackFrom,
	type AnyAgentSpec,
	type BankRun,
	type Book,
	type EgressMode,
	type WorkItemKind
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { scriptedNoisy, scriptedOptimal, specFor } from '@craftabot/evals';
import { stageBoundaryGuardrails } from '@craftabot/governance';
import {
	adviceRequestBook,
	alertBook,
	bankClock,
	complaintBook,
	defaultArrivalRates,
	population
} from '@craftabot/pack-fs-bank';
import { runBank, type DeskAssignment, type MonitorSink } from '@craftabot/workflow';
import { z } from 'zod';
import { createAgentRunWriter } from '../agent-runs.js';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { harnessPlans } from '../plans.js';
import { createFileStorage } from '../storage/file-storage.js';
import { loadSpecFrom, type BrainTier } from './run.js';

/**
 * **`craftabot bank run`** (WP83, `71-THE-CLOCK.md` §5): a day at the bank —
 * the population at a seed and size, the books drawn for the day (the
 * loan book through each desk workflow's own `book`, the alert book, the
 * complaint and advice-request registers), the clock over them, the desks
 * from a file working their kinds through `runWorkflow` up to their
 * concurrency, every agent run written as `run` writes one, every workflow
 * run under `<out>/workflows/`, and the `BankRun` under
 * `<out>/bank-runs/<id>/bank-run.json` with the wall time on it.
 */
export const deskFileSchema = z.array(
	z.object({
		id: z.string().min(1),
		workflowId: z.string().min(1),
		kinds: z
			.array(
				z.enum(['application', 'alert', 'complaint', 'advice-request', 'onboarding', 'dispute'])
			)
			.min(1),
		configuration: z.string().min(1).optional(),
		knobs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
		concurrency: z.number().int().positive().default(1),
		build: z.string().min(1).optional(),
		/** A kit file for this desk's bot; the world's default senses and actions without one. */
		kit: z.string().min(1).optional()
	})
);
export type DeskFile = z.infer<typeof deskFileSchema>;

export interface BankRunOptions {
	/** The day, ISO; `from`/`to` for a window. */
	day?: string;
	from?: string;
	to?: string;
	desksPath: string;
	seed: number;
	size: number;
	/** Simulated seconds per wall second; Infinity by default. */
	acceleration?: number;
	brain: BrainTier;
	stopAfter?: number;
	out: string;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	egress?: EgressMode;
}

export interface BankRunReport {
	bankRun: BankRun;
	file: string;
	directory: string;
	wallMs: number;
}

export async function bankRun(options: BankRunOptions): Promise<BankRunReport> {
	const from = options.from ?? options.day;
	const to = options.to ?? options.day;
	if (from === undefined || to === undefined)
		throw new Error('bank run needs --day <date>, or --from and --to');
	const registry = createRegistry(options.config);
	const desksFile = deskFileSchema.parse(JSON.parse(await readFile(options.desksPath, 'utf8')));
	if (desksFile.length === 0) throw new Error('the desks file names no desk');
	const packs = [...options.config.packs, localPackFrom(options.config.content ?? [])];
	const workflows = registry.listWorkflows();
	for (const desk of desksFile) {
		if (!registry.getWorkflow(desk.workflowId)) {
			throw new Error(
				`desk '${desk.id}' names workflow '${desk.workflowId}' — the installed packs ship ${workflows.map((w) => w.id).join(', ') || 'none'}`
			);
		}
	}

	const pop = population(options.seed, { size: options.size });
	const first = pop.transactions.dateOf(0);
	const last = pop.transactions.dateOf(pop.options.periodDays - 1);
	if (from < first || to > last) {
		throw new Error(`the day must fall inside the population's period, ${first} to ${last}`);
	}
	// The books for the day: applications through each desk workflow's own book, the alerts, the registers.
	const books: Book[] = [];
	const wanted = new Set<WorkItemKind>(desksFile.flatMap((desk) => desk.kinds));
	for (const desk of desksFile) {
		const workflow = registry.getWorkflow(desk.workflowId);
		if (
			workflow?.book &&
			desk.kinds.includes('application') &&
			!books.some((book) => book.kind === 'application')
		) {
			books.push(workflow.book({ seed: options.seed, size: options.size }));
		}
	}
	if (wanted.has('alert')) books.push(alertBook(pop, { from, to }).book);
	if (wanted.has('complaint')) books.push(complaintBook(pop, { from, to }));
	if (wanted.has('advice-request')) books.push(adviceRequestBook(pop, { from, to }));
	// A kind the bank keeps no register for (WP103's `onboarding`): the desk's own workflow draws it.
	for (const desk of desksFile) {
		const workflow = registry.getWorkflow(desk.workflowId);
		for (const kind of desk.kinds) {
			if (books.some((book) => book.kind === kind)) continue;
			if (workflow?.book && workflow.kinds?.includes(kind))
				books.push(workflow.book({ seed: options.seed, size: options.size }));
		}
	}

	const acceleration = options.acceleration ?? Infinity;
	const clock = bankClock({ population: pop, from, to, books, acceleration, seed: options.seed });
	const rates = defaultArrivalRates(pop);

	const desks: DeskAssignment[] = desksFile.map((desk) => ({
		id: desk.id,
		workflowId: desk.workflowId,
		kinds: [...desk.kinds],
		...(desk.configuration !== undefined ? { configuration: desk.configuration } : {}),
		...(desk.knobs ? { config: { knobs: desk.knobs } } : {}),
		concurrency: desk.concurrency,
		build: desk.build ?? desk.configuration ?? 'default'
	}));
	const specs = new Map<string, AnyAgentSpec>();
	for (const desk of desksFile) {
		if (desk.kit) {
			specs.set(desk.id, await loadSpecFrom(desk.kit, options.config, registry));
			continue;
		}
		const workflow = registry.getWorkflow(desk.workflowId);
		const world = registry.getWorld(workflow?.worldId ?? '');
		specs.set(
			desk.id,
			specFor({
				scenario: { id: desk.id, goalCardId: desk.workflowId, tags: [], injections: [], fit: [] },
				build: {
					id: desk.build ?? 'default',
					base: { kind: 'starter-default' },
					overrides: {
						senses: (world?.senses ?? []).map((sense) => sense.id),
						actions: (world?.actions ?? []).map((action) => action.id)
					}
				},
				guard: { id: 'none', fit: [] }
			})
		);
	}

	const storage = await createFileStorage(options.out);
	const now = options.now ?? (() => new Date().toISOString());
	const writer = createAgentRunWriter({
		storage,
		out: options.out,
		packVersions: packVersions(options.config),
		secrets: options.credentials.secrets(),
		now
	});
	const written: string[] = [];
	const sink: MonitorSink = {
		agentRun: (entry) => writer.write(entry.runId, entry.spec, entry.events),
		workflowRun: async (entry) => {
			const directory = join(options.out, 'workflows', entry.run.id);
			await mkdir(directory, { recursive: true });
			const file = join(directory, 'workflow-run.json');
			await writeFile(file, `${JSON.stringify(entry.run, null, '\t')}\n`, 'utf8');
			written.push(file);
		},
		bankRun: () => undefined
	};
	const started = Date.now();
	const record = await runBank(clock, desks, sink, {
		packs,
		workflows,
		specFor: (desk) => specs.get(desk.id) as AnyAgentSpec,
		providerFor: (_desk, _stage, goalCardId) => {
			const plan = harnessPlans.planFor(goalCardId);
			return createMockProvider({
				script:
					options.brain === 'scripted-noisy'
						? scriptedNoisy(plan, { seed: options.seed })
						: scriptedOptimal(plan),
				id: options.brain
			});
		},
		// Each stage's boundary chain (WP95): its cards and components against the host's registry.
		boundaryGuardrailsFor: stageBoundaryGuardrails(registry),
		seed: options.seed,
		clock: {
			from,
			to,
			seed: options.seed,
			acceleration: Number.isFinite(acceleration) ? acceleration : 'Infinity',
			rates: Object.fromEntries(
				Object.entries(rates).map(([kind, rate]) => [
					kind,
					{ profile: [...rate.profile], scale: rate.scale }
				])
			),
			books: books.map((book) => ({
				kind: book.kind,
				items: book.items.length,
				populationDigest: book.source.populationDigest
			}))
		},
		populationDigest: pop.digest,
		newId: () => `bank-${options.seed}-${from}${to !== from ? `-${to}` : ''}`,
		...(options.stopAfter !== undefined ? { stopAfter: options.stopAfter } : {})
	});
	await writer.done();
	const wallMs = Date.now() - started;
	const bankRunRecord: BankRun = { ...record, wallMs };
	const directory = join(options.out, 'bank-runs', bankRunRecord.id);
	await mkdir(directory, { recursive: true });
	const file = join(directory, 'bank-run.json');
	await writeFile(file, `${JSON.stringify(bankRunRecord, null, '\t')}\n`, 'utf8');
	return { bankRun: bankRunRecord, file, directory, wallMs };
}
