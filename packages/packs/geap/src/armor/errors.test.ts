import { describe, expect, it } from 'vitest';
import {
	armorErrorFromNetworkFailure,
	armorErrorFromStatus,
	armorErrorFromTimeout,
	scrubToken
} from './errors.js';

describe('armorErrorFromStatus', () => {
	it.each([
		[401, 'bad-token'],
		[403, 'no-permission'],
		[404, 'no-template'],
		[429, 'quota'],
		[500, 'unavailable'],
		[503, 'unavailable'],
		[418, 'unavailable']
	] as const)('maps status %i to kind %s', (status, kind) => {
		expect(armorErrorFromStatus(status, 'x').kind).toBe(kind);
	});
});

describe('armorErrorFromNetworkFailure', () => {
	it('reports unavailable for a rejected fetch', () => {
		expect(armorErrorFromNetworkFailure(new TypeError('Failed to fetch')).kind).toBe('unavailable');
	});

	it('reports unavailable for a non-Error rejection', () => {
		expect(armorErrorFromNetworkFailure('boom').kind).toBe('unavailable');
	});
});

describe('armorErrorFromTimeout', () => {
	it('reports timeout with the configured duration in the message', () => {
		const error = armorErrorFromTimeout(3000);
		expect(error.kind).toBe('timeout');
		expect(error.message).toContain('3000');
	});
});

describe('scrubToken', () => {
	const TOKEN = 'ya29.super-secret-access-token';

	it('removes a token from a plain string', () => {
		expect(scrubToken(`Bearer ${TOKEN}`, TOKEN)).toBe('Bearer [token-redacted]');
	});

	it('removes a token nested in an object', () => {
		const scrubbed = scrubToken({ headers: { authorization: `Bearer ${TOKEN}` } }, TOKEN);
		expect(JSON.stringify(scrubbed)).not.toContain(TOKEN);
	});

	it('removes a token nested in an array', () => {
		const scrubbed = scrubToken([`leaked: ${TOKEN}`, 'clean'], TOKEN);
		expect(scrubbed[0]).not.toContain(TOKEN);
	});

	it('removes a token from an Error message, preserving the name', () => {
		const error = new TypeError(`failed with ${TOKEN}`);
		const scrubbed = scrubToken(error, TOKEN);
		expect(scrubbed.message).not.toContain(TOKEN);
		expect(scrubbed.name).toBe('TypeError');
	});

	it('leaves values untouched when the token is empty', () => {
		expect(scrubToken('nothing to scrub', '')).toBe('nothing to scrub');
	});

	it('is a no-op when the token does not appear', () => {
		expect(scrubToken('all clear', TOKEN)).toBe('all clear');
	});
});
