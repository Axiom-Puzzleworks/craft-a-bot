import { hostname } from 'node:os';
import type { Principal } from '@craftabot/core';

/**
 * The harness's principal (WP65, `55-PRINCIPAL.md` §4.2): a service, named
 * from `CRAFTABOT_PRINCIPAL` when the environment sets it, else the
 * machine's hostname — which a person running their own harness on their
 * own disk already knows. `--principal <name>` on the CLI overrides both.
 * Written to every run the harness starts, and given as `by` to every
 * approval it answers.
 */
export const HARNESS_PRINCIPAL_ID = 'craftabot-harness';

export function principalFromEnv(
	env: NodeJS.ProcessEnv = process.env,
	options: { name?: string; hostname?: () => string } = {}
): Principal {
	const fromEnv = env['CRAFTABOT_PRINCIPAL'];
	const name =
		options.name?.trim() ||
		(fromEnv !== undefined && fromEnv.trim() !== '' ? fromEnv.trim() : undefined) ||
		(options.hostname ?? hostname)();
	return { kind: 'service', id: HARNESS_PRINCIPAL_ID, name };
}
