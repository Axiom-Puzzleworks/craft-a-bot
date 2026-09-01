import { describe, expect, it, vi } from 'vitest';
import { createGeapCredentialBay, testTheGuard } from './geap-credential.svelte.js';
import { createKeyVault } from './keys.js';

function memoryWebStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key)
	};
}

describe('createGeapCredentialBay', () => {
	it('starts empty when the vault has no geap entry', () => {
		const bay = createGeapCredentialBay({ vault: createKeyVault(memoryWebStorage()) });
		expect(bay.status).toBe('empty');
		expect(bay.hasToken).toBe(false);
		expect(bay.secondsRemaining).toBeUndefined();
	});

	it('starts live, with an unknown remaining life, when a token already sits in the vault', () => {
		const vault = createKeyVault(memoryWebStorage());
		vault.set('geap', 'a-previous-token');
		const bay = createGeapCredentialBay({ vault });
		expect(bay.status).toBe('live');
		expect(bay.hasToken).toBe(true);
		expect(bay.secondsRemaining).toBeUndefined();
	});

	it('reports whether a client id is configured', () => {
		const configured = createGeapCredentialBay({
			vault: createKeyVault(memoryWebStorage()),
			clientId: 'a-client-id.apps.googleusercontent.com'
		});
		expect(configured.clientIdConfigured).toBe(true);

		const unconfigured = createGeapCredentialBay({
			vault: createKeyVault(memoryWebStorage())
		});
		expect(unconfigured.clientIdConfigured).toBe(false);
	});

	it('signIn() with no client id configured never touches GIS and explains why', async () => {
		const loadGis = vi.fn(() => Promise.resolve());
		const bay = createGeapCredentialBay({
			vault: createKeyVault(memoryWebStorage()),
			loadGis
		});
		await bay.signIn();
		expect(loadGis).not.toHaveBeenCalled();
		expect(bay.status).toBe('empty');
		expect(bay.message).toContain('VITE_GEAP_OAUTH_CLIENT_ID');
	});

	it('signIn() stores the token, sets a real TTL and reports success', async () => {
		const vault = createKeyVault(memoryWebStorage());
		const initTokenClient = vi.fn(
			(config: { callback: (r: { access_token: string; expires_in: number }) => void }) => ({
				requestAccessToken: () => config.callback({ access_token: 'fresh-token', expires_in: 3600 })
			})
		);
		vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });

		const bay = createGeapCredentialBay({
			vault,
			clientId: 'a-client-id.apps.googleusercontent.com',
			loadGis: () => Promise.resolve()
		});
		await bay.signIn();

		expect(bay.status).toBe('live');
		expect(bay.hasToken).toBe(true);
		expect(vault.get('geap')).toBe('fresh-token');
		expect(bay.secondsRemaining).toBeGreaterThan(3500);
		expect(bay.secondsRemaining).toBeLessThanOrEqual(3600);

		vi.unstubAllGlobals();
	});

	it('signIn() reports the error plainly when Google denies or cancels', async () => {
		const initTokenClient = vi.fn((config: { callback: (r: { error?: string }) => void }) => ({
			requestAccessToken: () => config.callback({ error: 'access_denied' })
		}));
		vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });

		const bay = createGeapCredentialBay({
			vault: createKeyVault(memoryWebStorage()),
			clientId: 'a-client-id.apps.googleusercontent.com',
			loadGis: () => Promise.resolve()
		});
		await bay.signIn();

		expect(bay.status).toBe('empty');
		expect(bay.hasToken).toBe(false);
		expect(bay.message).toContain('access_denied');

		vi.unstubAllGlobals();
	});

	it('signIn() falls back to live/empty (never crashes) when the GIS script fails to load', async () => {
		const bay = createGeapCredentialBay({
			vault: createKeyVault(memoryWebStorage()),
			clientId: 'a-client-id.apps.googleusercontent.com',
			loadGis: () => Promise.reject(new Error('network blocked'))
		});
		await bay.signIn();
		expect(bay.status).toBe('empty');
		expect(bay.message).toContain('network blocked');
	});

	it('eject() clears the token, the status and the TTL', async () => {
		const vault = createKeyVault(memoryWebStorage());
		const initTokenClient = vi.fn(
			(config: { callback: (r: { access_token: string; expires_in: number }) => void }) => ({
				requestAccessToken: () => config.callback({ access_token: 'fresh-token', expires_in: 3600 })
			})
		);
		vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });

		const bay = createGeapCredentialBay({
			vault,
			clientId: 'a-client-id.apps.googleusercontent.com',
			loadGis: () => Promise.resolve()
		});
		await bay.signIn();
		bay.eject();

		expect(bay.hasToken).toBe(false);
		expect(bay.status).toBe('empty');
		expect(bay.secondsRemaining).toBeUndefined();
		expect(vault.get('geap')).toBeUndefined();

		vi.unstubAllGlobals();
	});
});

describe('testTheGuard', () => {
	function jsonResponse(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	}

	it('reports success when the known-injection phrase is caught', async () => {
		const fetchImpl = (() =>
			Promise.resolve(
				jsonResponse({
					sanitizationResult: {
						filterMatchState: 'MATCH_FOUND',
						invocationResult: 'SUCCESS',
						filterResults: {
							pi_and_jailbreak: {
								piAndJailbreakFilterResult: {
									executionState: 'EXECUTION_SUCCESS',
									matchState: 'MATCH_FOUND',
									confidenceLevel: 'HIGH'
								}
							}
						}
					}
				})
			)) as unknown as typeof globalThis.fetch;

		const result = await testTheGuard('a-token', 'proj-1', 'europe-west2', 'cab-armour', fetchImpl);
		expect(result.ok).toBe(true);
		expect(result.message).toContain('sneaky instruction');
	});

	it('reports failure when the phrase is not caught', async () => {
		const fetchImpl = (() =>
			Promise.resolve(
				jsonResponse({
					sanitizationResult: { filterMatchState: 'NO_MATCH_FOUND', invocationResult: 'SUCCESS' }
				})
			)) as unknown as typeof globalThis.fetch;

		const result = await testTheGuard('a-token', 'proj-1', 'europe-west2', 'cab-armour', fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.message).toContain('not caught');
	});

	it('reports a transport failure plainly, never throwing', async () => {
		const fetchImpl = (() =>
			Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof globalThis.fetch;
		const result = await testTheGuard('a-token', 'proj-1', 'europe-west2', 'cab-armour', fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.message).toContain('could not check');
	});

	it('never leaks the token into the check result', async () => {
		const fetchImpl = (() =>
			Promise.resolve(
				jsonResponse({ error: { message: 'bad token: a-real-secret-token' } }, 401)
			)) as unknown as typeof globalThis.fetch;
		const result = await testTheGuard(
			'a-real-secret-token',
			'proj-1',
			'europe-west2',
			'cab-armour',
			fetchImpl
		);
		expect(JSON.stringify(result)).not.toContain('a-real-secret-token');
	});
});
