import type { Connection } from '@craftabot/core';

/**
 * **Why a browser edition refuses a connection** (WP99, `30-…`'s dated note;
 * `83-…` §6.2.4), or `undefined` when it may fit it: a harness-only
 * connection holds a credential a browser must not; an unchecked one waits
 * for its live checkpoint. The Guard Rack shows the reason instead of the
 * fit button; `checkStack` refuses a browser stack that fits one.
 */
export function browserRefusal(connection: Connection | undefined): string | undefined {
	if (!connection) return undefined;
	if (connection.browserCapable === false) {
		return `${connection.wraps} is a harness-only connection: its credential cannot be held in a browser. Run it from the harness.`;
	}
	if (connection.browserCapable === 'checkpoint-pending') {
		return `${connection.wraps} has not been checked from a browser yet: take the live checkpoint from the harness first.`;
	}
	return undefined;
}
