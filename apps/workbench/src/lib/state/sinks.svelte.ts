import {
	createEgressGuard,
	type EventBus,
	type SinkInstance,
	type SinkStatus,
	type TraceExport,
	type TraceSink,
	type Unsubscribe
} from '@craftabot/core';
import { browserSinks } from '@craftabot/telemetry';
import { z } from 'zod';
import { createBrowserKeyVault } from './keys.js';

/**
 * **Configured sinks** (`35-TELEMETRY.md` §4.5, WP47): the Workshop's Sinks
 * screen is one of the two places a sink is configured (the harness is the
 * other; the Kit never attaches one). Each configuration is a sink id, its
 * config and an enabled flag, kept in `localStorage`; an instance is built
 * behind an egress guard from the sink's own declaration, with the vault
 * answering for its credential, and its failures land in `statuses`, never
 * on the run.
 */

export const SINKS_STORAGE_KEY = 'cab.sinks.v1';

export const sinkStatusSchema = z.object({
	attached: z.boolean(),
	buffered: z.number(),
	sent: z.number(),
	failed: z.number(),
	lastError: z.string().optional()
});

export const sinkConfigurationSchema = z.object({
	sinkId: z.string().min(1),
	config: z.unknown(),
	enabled: z.boolean().default(true),
	/** What the sink last reported — kept with the configuration, so a reload still shows it. */
	lastStatus: sinkStatusSchema.optional()
});
export type SinkConfiguration = z.infer<typeof sinkConfigurationSchema>;

const fileSchema = z.object({
	schemaVersion: z.literal(1),
	sinks: z.array(sinkConfigurationSchema)
});

export interface WebStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface SinksStore {
	readonly configurations: readonly SinkConfiguration[];
	readonly available: readonly TraceSink[];
	readonly statuses: Readonly<Record<string, SinkStatus & { lastError?: string }>>;
	sinkById(id: string): TraceSink | undefined;
	set(configuration: SinkConfiguration): void;
	remove(sinkId: string): void;
	/** Every enabled sink, built fresh behind its egress guard. */
	instances(): Array<{ sink: TraceSink; instance: SinkInstance }>;
	/** Attach every enabled sink to a live bus; the returned function detaches and flushes. */
	attach(events: EventBus, run: { runId?: string; agentId: string }): Unsubscribe;
	/** Send a stored run to one configured sink. */
	send(
		sinkId: string,
		input: TraceExport
	): Promise<{ ok: true; sent: number } | { ok: false; error: string }>;
}

export function createSinksStore(
	options: { storage?: WebStorageLike; sinks?: TraceSink[]; fetch?: typeof globalThis.fetch } = {}
): SinksStore {
	const storage =
		options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
	const available = options.sinks ?? browserSinks;
	const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

	function load(): SinkConfiguration[] {
		try {
			const raw = storage?.getItem(SINKS_STORAGE_KEY);
			if (!raw) return [];
			const parsed = fileSchema.safeParse(JSON.parse(raw));
			return parsed.success ? parsed.data.sinks : [];
		} catch {
			return [];
		}
	}

	let configurations = $state<SinkConfiguration[]>(load());
	const statuses = $derived(
		Object.fromEntries(
			configurations
				.filter((entry) => entry.lastStatus !== undefined)
				.map((entry) => [entry.sinkId, entry.lastStatus as SinkStatus])
		)
	);

	function persist(): void {
		storage?.setItem(
			SINKS_STORAGE_KEY,
			JSON.stringify({ schemaVersion: 1, sinks: $state.snapshot(configurations) })
		);
	}

	function build(sink: TraceSink, config: unknown): SinkInstance {
		// The sink says where it will call for this config; the guard allows exactly that (WP41's seam, applied to a consumer).
		const guard = createEgressGuard({ mode: 'declared', fetch: baseFetch });
		guard.allow(sink.egress(config));
		return sink.create({
			config,
			fetch: guard.fetch,
			getCredential: (id) => createBrowserKeyVault().get(id),
			onError: () => undefined
		});
	}

	function note(sinkId: string, instance: SinkInstance): void {
		const status = instance.status();
		configurations = configurations.map((entry) =>
			entry.sinkId === sinkId ? { ...entry, lastStatus: status } : entry
		);
		persist();
	}

	return {
		get configurations() {
			return configurations;
		},
		available,
		get statuses() {
			return statuses;
		},
		sinkById: (id) => available.find((sink) => sink.id === id),
		set(configuration) {
			const previous = configurations.find((entry) => entry.sinkId === configuration.sinkId);
			configurations = [
				...configurations.filter((entry) => entry.sinkId !== configuration.sinkId),
				{ ...configuration, ...(previous?.lastStatus ? { lastStatus: previous.lastStatus } : {}) }
			];
			persist();
		},
		remove(sinkId) {
			configurations = configurations.filter((entry) => entry.sinkId !== sinkId);
			persist();
		},
		instances() {
			const built: Array<{ sink: TraceSink; instance: SinkInstance }> = [];
			for (const entry of configurations) {
				if (!entry.enabled) continue;
				const sink = available.find((candidate) => candidate.id === entry.sinkId);
				if (!sink || !sink.configSchema.safeParse(entry.config).success) continue;
				built.push({ sink, instance: build(sink, entry.config) });
			}
			return built;
		},
		attach(events, run) {
			const attached = this.instances().map(({ sink, instance }) => {
				const off = instance.attach(events, run);
				const watch = events.onAny(() => note(sink.id, instance));
				return { sink, instance, off, watch };
			});
			return () => {
				for (const { sink, instance, off, watch } of attached) {
					watch();
					off();
					void instance.flush().then(() => note(sink.id, instance));
				}
			};
		},
		async send(sinkId, input) {
			const entry = configurations.find((candidate) => candidate.sinkId === sinkId);
			const sink = available.find((candidate) => candidate.id === sinkId);
			if (!entry || !sink) return { ok: false, error: 'that sink is not configured' };
			const instance = build(sink, entry.config);
			const result = await instance.export(input);
			note(sinkId, instance);
			return result;
		}
	};
}

/** The app-wide store. Components import this; tests build their own. */
export const sinksStore = createSinksStore();
