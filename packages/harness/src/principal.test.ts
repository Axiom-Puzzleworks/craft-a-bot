import { describe, expect, it } from 'vitest';
import { HARNESS_PRINCIPAL_ID, principalFromEnv } from './principal.js';

/**
 * The harness's principal (WP65, `55-…` §4.2): a service, named from the
 * flag, else the environment, else the hostname — never verified, never
 * read from a file.
 */
describe('principalFromEnv', () => {
	const hostname = () => 'bench-7';

	it('is a service named from CRAFTABOT_PRINCIPAL', () => {
		expect(principalFromEnv({ CRAFTABOT_PRINCIPAL: 'ci-runner' }, { hostname })).toEqual({
			kind: 'service',
			id: HARNESS_PRINCIPAL_ID,
			name: 'ci-runner'
		});
	});

	it('falls back to the hostname when the environment is silent or blank', () => {
		expect(principalFromEnv({}, { hostname }).name).toBe('bench-7');
		expect(principalFromEnv({ CRAFTABOT_PRINCIPAL: '  ' }, { hostname }).name).toBe('bench-7');
	});

	it('a --principal name wins over both', () => {
		expect(
			principalFromEnv({ CRAFTABOT_PRINCIPAL: 'ci-runner' }, { name: 'Sam', hostname }).name
		).toBe('Sam');
	});
});
