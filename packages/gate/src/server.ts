import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Gate } from './gate.js';

/**
 * **The Gate's door** (WP127, `107-THE-GATE.md` §1, §5): `node:http` onto
 * `Gate.handle`, and nothing the Gate does not already do. Loopback unless
 * `allowRemote` is set, and then the start line says the door is open and
 * unauthenticated.
 *
 * - `POST /v1/chat/completions` — a request, through the stack.
 * - `POST /v1/gate/approvals/{id}` `{ approved }` — the operator's answer.
 * - `GET /v1/gate/approvals` — what is waiting.
 * - `POST /v1/gate/conversations/{id}/end` — the last `post-act`, and `run.finished`.
 * - `GET /v1/gate/conversations/{id}/trace` — the conversation as a trace file with its digest.
 */
export interface ServeOptions {
	host?: string;
	port?: number;
	/** Required to bind anything but loopback. */
	allowRemote?: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertBindable(host: string, allowRemote: boolean | undefined): void {
	if (!LOOPBACK.has(host) && !allowRemote)
		throw new Error(
			`the Gate binds loopback only; ${host} needs --allow-remote, and it is unauthenticated (107-THE-GATE.md §5)`
		);
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString('utf8');
	if (text.trim() === '') return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function send(
	response: ServerResponse,
	status: number,
	body: unknown,
	headers: Record<string, string> = {}
): void {
	response.writeHead(status, { 'content-type': 'application/json', ...headers });
	response.end(JSON.stringify(body));
}

function headersOf(request: IncomingMessage): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	for (const [name, value] of Object.entries(request.headers))
		out[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
	return out;
}

/** Starts the door; resolves with the server and the address it listens on. */
export async function serveGate(
	gate: Gate,
	options: ServeOptions = {}
): Promise<{ server: Server; url: string; close(): Promise<void> }> {
	const host = options.host ?? '127.0.0.1';
	assertBindable(host, options.allowRemote);
	const server = createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? '/', 'http://gate');
			const path = url.pathname.replace(/\/+$/, '');
			try {
				if (request.method === 'POST' && path === '/v1/chat/completions') {
					const reply = await gate.handle(await bodyOf(request), headersOf(request));
					return send(response, reply.status, reply.body, reply.headers);
				}
				const approval = /^\/v1\/gate\/approvals\/([^/]+)$/.exec(path);
				if (request.method === 'POST' && approval) {
					const body = (await bodyOf(request)) as { approved?: unknown } | undefined;
					const reply = gate.approve(decodeURIComponent(approval[1]!), body?.approved === true);
					return send(response, reply.status, reply.body, reply.headers);
				}
				if (request.method === 'GET' && path === '/v1/gate/approvals')
					return send(response, 200, gate.approvals());
				const end = /^\/v1\/gate\/conversations\/([^/]+)\/end$/.exec(path);
				if (request.method === 'POST' && end) {
					const reply = await gate.end(decodeURIComponent(end[1]!), await bodyOf(request));
					return send(response, reply.status, reply.body, reply.headers);
				}
				const trace = /^\/v1\/gate\/conversations\/([^/]+)\/trace$/.exec(path);
				if (request.method === 'GET' && trace) {
					const file = await gate.trace(decodeURIComponent(trace[1]!));
					return file
						? send(response, 200, file)
						: send(response, 404, { error: { message: 'no such conversation' } });
				}
				send(response, 404, { error: { message: `the Gate has no ${request.method} ${path}` } });
			} catch (error) {
				send(response, 500, {
					error: { message: error instanceof Error ? error.message : String(error) }
				});
			}
		})();
	});
	await new Promise<void>((resolve) => server.listen(options.port ?? 0, host, resolve));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : (options.port ?? 0);
	return {
		server,
		url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}
