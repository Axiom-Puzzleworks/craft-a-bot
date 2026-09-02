import { describe, expect, it } from 'vitest';
import { credentialVariable, credentialsFromEnv } from './credentials.js';

describe('credentials from the environment', () => {
	it('names the variable from the credential id, safely', () => {
		expect(credentialVariable('openai')).toBe('CRAFTABOT_CREDENTIAL_OPENAI');
		expect(credentialVariable('geap')).toBe('CRAFTABOT_CREDENTIAL_GEAP');
		expect(credentialVariable('my-vendor.eu')).toBe('CRAFTABOT_CREDENTIAL_MY_VENDOR_EU');
	});

	it('reads a set credential and reports an unset or blank one as absent', () => {
		const source = credentialsFromEnv({
			CRAFTABOT_CREDENTIAL_OPENAI: 'sk-test-planted',
			CRAFTABOT_CREDENTIAL_GEAP: '   ',
			UNRELATED: 'x'
		});
		expect(source.get('openai')).toBe('sk-test-planted');
		expect(source.has('openai')).toBe(true);
		expect(source.get('geap')).toBeUndefined();
		expect(source.has('geap')).toBe(false);
		expect(source.get('anthropic')).toBeUndefined();
	});

	it('lists every planted secret for the leak sweep, and nothing else', () => {
		const source = credentialsFromEnv({
			CRAFTABOT_CREDENTIAL_OPENAI: 'sk-one',
			CRAFTABOT_CREDENTIAL_GEAP: 'ya29.two',
			CRAFTABOT_CREDENTIAL_EMPTY: '',
			PATH: '/usr/bin'
		});
		expect(source.secrets().sort()).toEqual(['sk-one', 'ya29.two']);
	});
});
