/**
 * **The one endpoint rule** (`40-DEBTS.md` §4.3, WP52; `06-…` §5's "revisit
 * for Ollama later with `localhost`-only validation"). A base URL for this
 * pack is honoured only when it is `http` on this computer — `localhost` or
 * `127.0.0.1`, the two hosts `OLLAMA_EGRESS` declares. Settings checks it
 * before storing, the factory checks it again before using it, and the
 * session's egress guard would refuse anything else a third time.
 */

export function describeEndpointProblem(endpoint: string): string | undefined {
	let url: URL;
	try {
		url = new URL(endpoint.trim());
	} catch {
		return 'That is not a web address.';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return 'The address must start with http:// or https://.';
	}
	if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return 'Only this computer is allowed: use localhost or 127.0.0.1.';
	}
	return undefined;
}

export function isLoopbackEndpoint(endpoint: string): boolean {
	return describeEndpointProblem(endpoint) === undefined;
}
