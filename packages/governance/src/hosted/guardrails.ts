import type {
	BrickRuntimeContext,
	ExternalCallRecord,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailService,
	GuardrailServiceClient,
	GuardrailVerdict,
	ScreenReading,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import type { HostedScreenConfig } from './config.js';
import { defaultSelectors, type TextSelector } from './selectors.js';
import { defaultHostedStrings, type HostedStrings } from './strings.js';
import { verdictForReading } from './verdict.js';

/**
 * **The shell** (`29-GUARD-SHELL.md` §4.4, WP39 stage C): one `Guardrail`
 * per hook the service supports whose dial is not `off`, each doing what
 * the Armour Brick's `runArmorCheck` did — selector → "nothing to check"
 * short-circuit → the call, timed and bounded → `verdictForReading` → the
 * `guardrail.external` record. The record is assembled **in the order the
 * golden trace fixed**: the service's own record first (`service`,
 * `endpoint`, its reference words), then `latencyMs`, `charsScreened`,
 * `outcome`, `filters` — so the Armour Brick on the shell writes the same
 * bytes it wrote before it.
 *
 * Guardrails stay pure (`25-…` D3): the record is *returned* through
 * `checkWithRecord` and core emits it; `check` delegates and drops the
 * record so a host that has not been updated for the seam still runs the
 * rule correctly.
 */

export interface HostedGuardrailNames {
	name: string;
	description: string;
}

export interface CreateHostedGuardrailsOptions {
	/** `'geap/armor'` → `'geap/armor:observation'` | `':decision'` | `':result'`. */
	idPrefix: string;
	names?: Partial<Record<GuardrailHook, HostedGuardrailNames>>;
	service: GuardrailService;
	/** Already parsed by `service.configSchema`. */
	serviceConfig: unknown;
	screening: HostedScreenConfig;
	ctx: Pick<BrickRuntimeContext, 'fetch' | 'getCredential'>;
	envelope: (ctx: GuardrailContext) => ScreenRequest['envelope'];
	selectors?: Partial<Record<GuardrailHook, TextSelector>>;
	strings?: HostedStrings;
	/** The clock the latency is measured on — injected so a test can hold it still. */
	now?: () => number;
}

const HOOK_SUFFIX: Record<GuardrailHook, string> = {
	'pre-think': 'observation',
	'pre-act': 'decision',
	'post-act': 'result'
};

const DEFAULT_NAMES: Record<GuardrailHook, HostedGuardrailNames> = {
	'pre-think': {
		name: 'Guard Brick (observation)',
		description: 'Sends what the bot can currently see to the guard before it thinks.'
	},
	'pre-act': {
		name: 'Guard Brick (decision)',
		description: 'Sends what the bot is about to do to the guard before it acts.'
	},
	'post-act': {
		name: 'Guard Brick (result)',
		description: 'Sends what just happened to the guard after it acts.'
	}
};

function dialFor(hook: GuardrailHook, screening: HostedScreenConfig): string {
	if (hook === 'pre-think') return screening.screenObservation;
	if (hook === 'post-act') return screening.screenResult;
	return screening.screenDecision;
}

/** `reading.findings` reshaped for the trace — keyed by the vendor's label, the vendor's confidence string when it has one. */
export function filtersForRecord(reading: ScreenReading): ExternalCallRecord['filters'] {
	return Object.fromEntries(
		reading.findings.map((finding) => {
			const confidence = finding.vendorConfidence ?? finding.confidence;
			return [
				finding.vendorLabel,
				confidence !== undefined
					? { ran: finding.ran, matched: finding.matched, confidence }
					: { ran: finding.ran, matched: finding.matched }
			];
		})
	);
}

/** The record's closed outcome set: `'offline'` when no call was made, the transport kind, or the reading's own outcome. */
function outcomeFor(result: ScreenResult, offline: boolean): ExternalCallRecord['outcome'] {
	if (offline) return 'offline';
	return 'error' in result ? result.error.kind : result.reading.outcome;
}

export function createHostedGuardrails(options: CreateHostedGuardrailsOptions): Guardrail[] {
	const { service, screening } = options;
	const strings = options.strings ?? defaultHostedStrings;
	const alwaysStop = service.alwaysStop ?? [];
	const now = options.now ?? (() => Date.now());

	// One client for every hook, built once — a live client may hold a
	// connection; an offline one holds nothing but its canned answer.
	const client: GuardrailServiceClient = screening.offline
		? service.createOffline(options.serviceConfig)
		: service.create({
				config: options.serviceConfig,
				fetch: options.ctx.fetch,
				getCredential: options.ctx.getCredential,
				timeoutMs: screening.timeoutMs
			});

	async function screenAt(
		hook: GuardrailHook,
		selector: TextSelector,
		ctx: GuardrailContext
	): Promise<{ verdict: GuardrailVerdict; external?: ExternalCallRecord }> {
		const screen = selector(ctx);
		if (screen === undefined) return { verdict: { allow: true, note: strings.nothingToCheck } };

		const request: ScreenRequest = {
			hook,
			text: screen.text,
			...(screen.context !== undefined ? { context: screen.context } : {}),
			...(ctx.proposed ? { proposed: ctx.proposed } : {}),
			envelope: options.envelope(ctx)
		};

		const startedAt = now();
		const result = await client.screen(request, AbortSignal.timeout(screening.timeoutMs));
		const latencyMs = Math.max(0, now() - startedAt);

		const verdict = verdictForReading(result, hook, screening, alwaysStop, strings);
		const external: ExternalCallRecord = {
			...result.record,
			latencyMs,
			charsScreened: screen.text.length,
			outcome: outcomeFor(result, screening.offline),
			...('reading' in result ? { filters: filtersForRecord(result.reading) } : {})
		};
		return { verdict, external };
	}

	return service.hooks
		.filter((hook) => dialFor(hook, screening) !== 'off')
		.map((hook) => {
			const selector = options.selectors?.[hook] ?? defaultSelectors[hook];
			const names = options.names?.[hook] ?? DEFAULT_NAMES[hook];
			const checkWithRecord = (ctx: GuardrailContext) => screenAt(hook, selector, ctx);
			return {
				id: `${options.idPrefix}:${HOOK_SUFFIX[hook]}`,
				name: names.name,
				description: names.description,
				hooks: [hook],
				check: async (ctx: GuardrailContext): Promise<GuardrailVerdict> =>
					(await checkWithRecord(ctx)).verdict,
				checkWithRecord
			};
		});
}
