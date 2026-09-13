import type { GuardrailComponent } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * **A connection's conformance** (WP99, `83-…` §6.2.4; `30-…`'s dated note):
 * a component that binds to something outside the product declares it
 * honestly.
 *
 * - `connection.declared` — `wraps` names the vendor surface; `egress` names at least one host; a `credential` is named when the service takes one.
 * - `connection.stand-in` — a stand-in exists (`offline-fixture` or `deterministic-rule`); `none` is refused, since every host must be able to run the component offline.
 * - `connection.browser` — `browserCapable` is `true`, `false` or `'checkpoint-pending'`; `false` and `'checkpoint-pending'` are what a browser edition refuses to fit, with the reason `browserRefusal` gives.
 * - `connection.checkpoint` — a `checkpoint`, when declared, carries a date and a note.
 */
export function checkConnection(component: GuardrailComponent): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const connection = component.connection;
	if (!connection) return issues;
	const at = (check: string, message: string) =>
		issues.push({ check, message: `"${component.id}" ${message}` });
	if (connection.wraps.trim() === '')
		at('connection.declared', 'declares a connection that wraps nothing');
	if (connection.egress.length === 0)
		at('connection.declared', 'declares a connection with no egress');
	if (connection.standIn === 'none')
		at('connection.stand-in', 'declares a connection with no stand-in');
	if (
		connection.browserCapable !== true &&
		connection.browserCapable !== false &&
		connection.browserCapable !== 'checkpoint-pending'
	) {
		at('connection.browser', 'declares an unknown browser capability');
	}
	if (connection.checkpoint) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(connection.checkpoint.takenOn))
			at('connection.checkpoint', 'declares a checkpoint without a date');
		if (connection.checkpoint.note.trim() === '')
			at('connection.checkpoint', 'declares a checkpoint without a note');
	}
	return issues;
}

export { browserRefusal } from '@craftabot/governance';
