import type { WebStorageLike } from './keys.js';

/**
 * **What the last real call said about a credential** (UX-2,
 * `docs/manual/UX-AND-GAPS.md`, 2026-09-07).
 *
 * The vault knows a token is *present* and, for a timed one, when it lapses;
 * it does not know whether the service still accepts it. A run finds that
 * out — a hosted guard's `guardrail.external` record comes back `bad-token`
 * or `no-permission` — and until now the finding stayed in the trace while
 * the battery compartment went on saying *Charged*. This is the note the run
 * leaves for the compartment: which credential, what the service said, when.
 *
 * Never the credential itself, never anything derived from it (hard rule 2):
 * the id is the credential's slot name, the kind is the closed transport
 * vocabulary, the time is the event's own timestamp. Cleared by a fresh
 * insert, an eject, or a real check that passes.
 */
export const CREDENTIAL_STATUS_KEY = 'cab.credential-status.v1';

export type CredentialRejectionKind = 'bad-token' | 'no-permission';

export interface CredentialRejection {
	kind: CredentialRejectionKind;
	/** ISO time of the call the service rejected. */
	at: string;
	/** The guardrail (or evaluator) whose call it was, for the compartment's small print. */
	by: string;
}

type Stored = Record<string, CredentialRejection>;

const REJECTION_KINDS: readonly string[] = ['bad-token', 'no-permission'];

/** Whether a hosted call's outcome is the service refusing the credential, as opposed to any other failure. */
export function isCredentialRejection(outcome: string): outcome is CredentialRejectionKind {
	return REJECTION_KINDS.includes(outcome);
}

/**
 * The credential slot a guardrail's calls draw on. Every hosted pack names its
 * credential after its own pack id (`geap/armor:observation` → `geap`,
 * `azure-content-safety/…` → `azure-content-safety`), which is the convention
 * the registry's `credential.id` follows; this is that convention read back.
 */
export function credentialIdFor(guardrailId: string): string {
	return guardrailId.split('/')[0] ?? guardrailId;
}

function defaultStore(): WebStorageLike | undefined {
	return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function read(store: WebStorageLike | undefined): Stored {
	try {
		const raw = store?.getItem(CREDENTIAL_STATUS_KEY);
		if (raw === null || raw === undefined) return {};
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? (parsed as Stored) : {};
	} catch {
		return {};
	}
}

function write(store: WebStorageLike | undefined, value: Stored): void {
	try {
		store?.setItem(CREDENTIAL_STATUS_KEY, JSON.stringify(value));
	} catch {
		// A store that refuses the write loses the note, never the run.
	}
}

/** The last rejection recorded against a credential, if any. */
export function rejectionOf(
	credentialId: string,
	store: WebStorageLike | undefined = defaultStore()
): CredentialRejection | undefined {
	const entry = read(store)[credentialId];
	return entry && isCredentialRejection(entry.kind) && typeof entry.at === 'string'
		? entry
		: undefined;
}

/** Record that a service refused this credential. */
export function markRejected(
	credentialId: string,
	rejection: CredentialRejection,
	store: WebStorageLike | undefined = defaultStore()
): void {
	write(store, { ...read(store), [credentialId]: rejection });
}

/** Forget a recorded rejection — on a fresh insert, an eject, or a check that passed. */
export function clearRejection(
	credentialId: string,
	store: WebStorageLike | undefined = defaultStore()
): void {
	const current = read(store);
	if (!(credentialId in current)) return;
	const { [credentialId]: _gone, ...rest } = current;
	void _gone;
	write(store, rest);
}
