import type { EgressDeclaration } from './types/guardrail-service.js';

/**
 * **Egress** (`26-TARGET-DESIGN-V3.md` §6.6, WP41): hard rule 2 extended
 * from "keys never leave the vault" to "bytes leave the browser only for
 * hosts a fitted component declared". Every component that talks to a
 * network declares where (`EgressDeclaration`); the session wraps the
 * `fetch` it hands out so a call to anywhere else is refused — a typed
 * error and an `error` event on the trace, never a silent failure. Under
 * `'none'` every call is refused, which is what CI runs.
 */

export type EgressMode = 'declared' | 'none';

/** An egress `host` pattern against a real host: exact, or `*` standing for one label. */
export function hostMatches(pattern: string, host: string): boolean {
	const patternLabels = pattern.toLowerCase().split('.');
	const hostLabels = host.toLowerCase().split('.');
	if (patternLabels.length !== hostLabels.length) return false;
	return patternLabels.every((label, i) => label === '*' || label === hostLabels[i]);
}

/** The host a `fetch` input names — `hostname`, so a port never disguises a destination. */
export function hostOf(input: string | URL | Request): string {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

export class EgressRefusedError extends Error {
	readonly kind = 'egress-refused';
	constructor(
		readonly host: string,
		readonly mode: EgressMode
	) {
		super(
			mode === 'none'
				? `Refused a call to "${host}": this run allows no network at all (egress: none).`
				: `Refused a call to "${host}": no fitted component declared it (egress: declared).`
		);
		this.name = 'EgressRefusedError';
	}
}

export interface EgressGuard {
	/** The wrapped `fetch` — hand this out in place of the platform one. */
	fetch: typeof globalThis.fetch;
	/** Add what a fitted component declared. Called as runtimes are built, before any call is made. */
	allow(declarations: readonly EgressDeclaration[]): void;
	/** Every host pattern allowed so far, sorted and unique — what `run.started` records. */
	hosts(): string[];
}

export function createEgressGuard(options: {
	mode: EgressMode;
	fetch: typeof globalThis.fetch;
	/** Told before the throw, so a host can put the refusal on the trace. */
	onRefused?: (error: EgressRefusedError) => void;
}): EgressGuard {
	const patterns = new Set<string>();
	const guarded: typeof globalThis.fetch = (input, init) => {
		const host = hostOf(input);
		const allowed =
			options.mode === 'declared' && [...patterns].some((pattern) => hostMatches(pattern, host));
		if (!allowed) {
			const error = new EgressRefusedError(host, options.mode);
			options.onRefused?.(error);
			return Promise.reject(error);
		}
		return options.fetch(input, init);
	};
	return {
		fetch: guarded,
		allow(declarations) {
			for (const declaration of declarations) patterns.add(declaration.host);
		},
		hosts: () => [...patterns].sort()
	};
}
