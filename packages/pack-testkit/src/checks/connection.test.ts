import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Connection, GuardrailComponent } from '@craftabot/core';
import { browserRefusal, checkConnection } from './connection.js';

/**
 * A connection's conformance (WP99): declared in full or refused; the
 * reason a browser edition gives for a harness-only or unchecked one.
 */
const connection = (overrides: Partial<Connection> = {}): Connection => ({
	kind: 'hosted',
	wraps: 'vendor/thing',
	egress: [{ host: 'api.example', purpose: 'test', sends: ['prompt'] }],
	browserCapable: true,
	standIn: 'offline-fixture',
	...overrides
});
const component = (conn: Connection | undefined): GuardrailComponent => ({
	id: 'test/c',
	name: 'c',
	description: 'c',
	technique: 'input-classifier',
	points: ['pre-act'],
	verdicts: ['allow'],
	cost: { class: 'metered', latency: 'network' },
	...(conn ? { connection: conn } : {}),
	configSchema: z.object({}),
	explain: () => 'x',
	compile: () => []
});

describe('checkConnection', () => {
	it('passes a full declaration and a component with no connection', () => {
		expect(checkConnection(component(connection()))).toEqual([]);
		expect(
			checkConnection(
				component(connection({ checkpoint: { takenOn: '2026-09-01', note: 'taken' } }))
			)
		).toEqual([]);
		expect(checkConnection(component(undefined))).toEqual([]);
	});

	it('refuses nothing wrapped, no egress, no stand-in, an unknown browser capability, a dateless or noteless checkpoint', () => {
		const checks = (conn: Connection) => checkConnection(component(conn)).map((i) => i.check);
		expect(checks(connection({ wraps: ' ' }))).toEqual(['connection.declared']);
		expect(checks(connection({ egress: [] }))).toEqual(['connection.declared']);
		expect(checks(connection({ standIn: 'none' }))).toEqual(['connection.stand-in']);
		expect(checks(connection({ browserCapable: 'maybe' as never }))).toEqual([
			'connection.browser'
		]);
		expect(checks(connection({ checkpoint: { takenOn: 'soon', note: 'x' } }))).toEqual([
			'connection.checkpoint'
		]);
		expect(checks(connection({ checkpoint: { takenOn: '2026-09-01', note: ' ' } }))).toEqual([
			'connection.checkpoint'
		]);
	});
});

describe('browserRefusal', () => {
	it('names the reason for a harness-only or unchecked connection, and none for a browser-capable one', () => {
		expect(browserRefusal(connection({ browserCapable: false }))).toContain('harness-only');
		expect(browserRefusal(connection({ browserCapable: 'checkpoint-pending' }))).toContain(
			'checkpoint'
		);
		expect(browserRefusal(connection())).toBeUndefined();
		expect(browserRefusal(undefined)).toBeUndefined();
	});
});
