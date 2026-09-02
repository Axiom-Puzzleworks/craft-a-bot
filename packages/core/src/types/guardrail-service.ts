import { z } from 'zod';
import type { ExternalCallRecord, ExternalOutcomeKind } from '../schemas/shared.js';
import type { BrickKindDefinition } from './brick.js';
import type { GuardrailContext, GuardrailHook } from './guardrail.js';

/**
 * **The hosted-guardrail contract** (`29-GUARD-SHELL.md` §4.3, WP39 stage B;
 * `26-TARGET-DESIGN-V3.md` §6.1). A vendor pack ships one of these — a
 * client, a reading, some strings, some fixtures — and nothing else; the
 * shell in `@craftabot/governance` (`createHostedGuardrails`) turns it into
 * ordinary `Guardrail`s at whichever hooks it supports, and the trace's
 * `guardrail.external` row is assembled by the shell from what the service
 * returns. The disposition ladder, the per-hook clamp, fail-closed, the
 * timeout and the record are the shell's; the service only *screens* and
 * *reports*.
 *
 * Vendor words survive beside neutral ones (`29-…` §3 principle 3): a
 * finding carries a `FindingCategory` the safety case can quote *and* the
 * vendor's own label and confidence string, which are what the trace
 * records — so the Armour Brick's golden trace reads the same through the
 * shell as it did before it.
 */

export const findingCategorySchema = z.enum([
	'injection',
	'jailbreak',
	'harmful',
	'sensitive-data',
	'malicious-link',
	'policy-violation',
	'other'
]);
export type FindingCategory = z.infer<typeof findingCategorySchema>;

export const findingConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type FindingConfidence = z.infer<typeof findingConfidenceSchema>;

/** One check a service ran (or skipped), in both vocabularies. */
export interface ScreenFinding {
	category: FindingCategory;
	/** The vendor's own name for the check — the key it appears under in `guardrail.external.filters`. */
	vendorLabel: string;
	ran: boolean;
	matched: boolean;
	confidence?: FindingConfidence;
	/** The vendor's own confidence string, when it has one — what the trace records (`29-…` §8 D-b). */
	vendorConfidence?: string;
}

export interface ScreenReading {
	outcome: 'ok' | 'partial' | 'failure';
	matched: boolean;
	findings: ScreenFinding[];
	/** Noted only, never substituted (`25-…` §4.4). */
	redactedText?: string;
}

export interface ScreenRequest {
	hook: GuardrailHook;
	text: string;
	/** Extra context a vendor may take — the observation for a response screen. */
	context?: string;
	/** The proposed call, for a service that gates actions rather than content (a policy decision point). */
	proposed?: GuardrailContext['proposed'];
	/** Pointers a service may forward, never the whole trace. */
	envelope: { runId?: string; agentId: string; tick: number };
	/**
	 * The policy decision point's input document (WP45, `33-POLICY-V2-PDP.md`
	 * §4.3): spec identity, the proposed call, usage and the world's
	 * predicates, built by governance's `pdpRequestFor` and attached by the
	 * shell at every hook — so a PDP service reads this and nothing else.
	 * Opaque here; `governance` owns the shape.
	 */
	policyInput?: unknown;
}

/**
 * What the service knows about the call it made — its record name, the
 * endpoint, the reference words it has (`template`/`policyRef`/`method`).
 * The shell measures `latencyMs` and `charsScreened`, writes `outcome`, and
 * derives `filters` from the findings, so every vendor's row has the same
 * cells (`29-…` §8 D-d).
 */
export type ScreenRecord = Omit<
	ExternalCallRecord,
	'latencyMs' | 'charsScreened' | 'filters' | 'outcome'
>;

export type ScreenResult =
	| { reading: ScreenReading; record: ScreenRecord }
	| { error: { kind: ExternalOutcomeKind; message: string }; record: ScreenRecord };

export interface GuardrailServiceClient {
	/** Never throws: a transport failure is a `{ error }` result for the shell's `onFailure` dial. */
	screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult>;
}

/**
 * Where a component sends data (`26-…` §6.6, `29-…` §4.9). Declared here,
 * enforced by WP41; `pack-testkit`'s `checkGuardrailService` is the first
 * reader.
 */
export const egressDeclarationSchema = z.object({
	/** A host pattern — exact, or with a single-label wildcard: `modelarmor.*.rep.googleapis.com`. */
	host: z.string().min(1),
	purpose: z.string().min(1),
	/** What leaves, in a fixed vocabulary a safety case can quote. */
	sends: z
		.array(z.enum(['prompt', 'observation', 'decision', 'result', 'trace', 'credential-header']))
		.min(1)
});
export type EgressDeclaration = z.infer<typeof egressDeclarationSchema>;

export interface GuardrailService {
	/** Qualified like every other pack contribution: `geap/model-armor`. */
	id: string;
	name: string;
	description: string;
	/** Which hooks this service can screen — a policy decision point is `['pre-act']`; a content filter is all three. */
	hooks: GuardrailHook[];
	/** The credential it reads, if any — the same shape a brick kind declares. */
	credential?: BrickKindDefinition['credential'];
	egress: EgressDeclaration[];
	/** Vendor labels that stop the run regardless of any dial — `csam` for Model Armor (`29-…` §8 D-c). */
	alwaysStop?: string[];
	/**
	 * Whether a browser can call this service directly (`30-…` stage B): set
	 * from a live CORS checkpoint, `false` until one has been taken. When
	 * `false`, the harness is the host that runs it live; the browser runs it
	 * offline. Omitted means unknown.
	 */
	browserCapable?: boolean;
	/** Zod for the service block of a fitted brick's config (project/region/template; guardrail id/version; policy path …). */
	configSchema: z.ZodType<unknown>;
	/** A live client. `fetch` and `getCredential` come from `BrickRuntimeContext`; `config` has already passed `configSchema`. */
	create(options: {
		config: unknown;
		fetch: typeof globalThis.fetch;
		getCredential(id: string): string | undefined;
		timeoutMs: number;
	}): GuardrailServiceClient;
	/** The canned client every service must provide (`26-…` tenet 10): answers with no key and no network, `outcome: 'offline'` on the trace. */
	createOffline(config: unknown): GuardrailServiceClient;
}

/**
 * What can be checked about a service as data — its function-valued fields
 * are checked for presence, not behaviour (that is `pack-testkit`'s job).
 */
export function describeGuardrailServiceProblems(service: GuardrailService): string[] {
	const problems: string[] = [];
	if (typeof service.id !== 'string' || service.id.length === 0) problems.push('has no id');
	if (!Array.isArray(service.hooks) || service.hooks.length === 0)
		problems.push('declares no hooks');
	if (!Array.isArray(service.egress)) problems.push('declares no egress list');
	else {
		for (const declaration of service.egress) {
			if (!egressDeclarationSchema.safeParse(declaration).success)
				problems.push(`has a malformed egress declaration: ${JSON.stringify(declaration)}`);
		}
	}
	if (service.configSchema === undefined || typeof service.configSchema.safeParse !== 'function')
		problems.push('has no configSchema');
	if (typeof service.create !== 'function') problems.push('has no create()');
	if (typeof service.createOffline !== 'function') problems.push('has no createOffline()');
	return problems;
}
