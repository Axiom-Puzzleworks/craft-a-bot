/**
 * **Credentials, the harness's half of hard rule 2** (WP37, `26-…` §6.8).
 *
 * The browser keeps secrets in its vault (`cab.keys.v1`) and hands the engine
 * a lookup, never the store. The harness has no vault; it has the process
 * environment, and it reads exactly one shape from it — `CRAFTABOT_CREDENTIAL_<ID>`,
 * where `<ID>` is the credential id a provider factory or brick kind declared
 * (`openai`, `geap`, …), upper-cased with anything that is not a letter or
 * digit folded to `_`. Nothing is read from a file in the repo, nothing is
 * ever printed, and the same lookup serves both `ProviderFactory.create` and
 * `CreateSessionDeps.getCredential`.
 *
 * `secrets()` exists for the same reason the vault's does: so the key-leak
 * sweep can plant one per declared credential and check every file the
 * harness wrote for it.
 */
export interface CredentialSource {
	get(id: string): string | undefined;
	has(id: string): boolean;
	/** Every secret currently set, for the leak sweep — never for display. */
	secrets(): string[];
}

export const CREDENTIAL_PREFIX = 'CRAFTABOT_CREDENTIAL_';

/**
 * The variables the live smoke checkpoints read their secret from, beside
 * `CRAFTABOT_CREDENTIAL_<ID>` (WP162, `112-REAL-ENOUGH-PLAN.md` §5). They are
 * secrets as much as the harness's own, so they are scrubbed and refused the
 * same way: a key held in `OPENAI_API_KEY` must not survive into a cassette
 * because the harness reads `CRAFTABOT_CREDENTIAL_OPENAI`. The non-secret
 * smoke variables (regions, ids, endpoints) are not here.
 */
export const SMOKE_SECRET_VARIABLES = [
	'OPENAI_API_KEY',
	'GEAP_ACCESS_TOKEN',
	'AZURE_CONTENT_SAFETY_KEY',
	'LAKERA_GUARD_KEY'
] as const;

/** A secret shorter than this is not scrubbed by part: a short fragment would blank ordinary words. */
const MIN_PART_LENGTH = 8;

export function credentialVariable(id: string): string {
	return `${CREDENTIAL_PREFIX}${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): CredentialSource {
	const get = (id: string): string | undefined => {
		const value = env[credentialVariable(id)];
		return value === undefined || value.trim() === '' ? undefined : value;
	};
	return {
		get,
		has: (id) => get(id) !== undefined,
		secrets: () => {
			const held = Object.entries(env).filter(
				([name, value]) =>
					(name.startsWith(CREDENTIAL_PREFIX) ||
						(SMOKE_SECRET_VARIABLES as readonly string[]).includes(name)) &&
					value !== undefined &&
					value.trim() !== ''
			) as Array<[string, string]>;
			const secrets = held.map(([, value]) => value);
			// A key pair is `accessKeyId:secretAccessKey` (AWS, SigV4): either half alone is a secret too.
			for (const [name, value] of held)
				if (name.startsWith(`${CREDENTIAL_PREFIX}AWS_`) && value.includes(':'))
					for (const part of value.split(':'))
						if (part.length >= MIN_PART_LENGTH && !secrets.includes(part)) secrets.push(part);
			return secrets;
		}
	};
}
