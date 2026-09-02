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
		secrets: () =>
			Object.entries(env)
				.filter(
					([name, value]) =>
						name.startsWith(CREDENTIAL_PREFIX) && value !== undefined && value !== ''
				)
				.map(([, value]) => value as string)
	};
}
