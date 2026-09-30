import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { GATE_KEY_VARIABLE, gateAnswer, gateServe } from './gate.js';

/**
 * **`craftabot gate`** (WP127, `107-THE-GATE.md`): a preset served on a port
 * in front of a real upstream on another, the approval answered by the
 * command, the conversation streamed to the file sink — and the upstream key
 * nowhere but the upstream's `Authorization` header.
 */
async function upstreamServer(script: Array<{ name: string; args: unknown }>) {
	const authorizations: string[] = [];
	let turn = 0;
	const server = createServer((request, response) => {
		authorizations.push(String(request.headers.authorization ?? ''));
		request.resume();
		request.on('end', () => {
			const step = script[turn++];
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(
				JSON.stringify({
					id: `up-${turn}`,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: 'Calling.',
								...(step
									? {
											tool_calls: [
												{
													id: `call_${turn}`,
													type: 'function',
													function: { name: step.name, arguments: JSON.stringify(step.args) }
												}
											]
										}
									: {})
							},
							finish_reason: step ? 'tool_calls' : 'stop'
						}
					],
					usage: { prompt_tokens: 50, completion_tokens: 5 }
				})
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	return {
		url: `http://127.0.0.1:${port}/v1`,
		authorizations,
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}

describe('craftabot gate (WP127)', () => {
	it('serves a preset, pauses a call the command approves, and keeps the key off every file', async () => {
		const key = 'sk-planted-gate-harness-0123456789';
		const upstream = await upstreamServer([{ name: 'delete_file', args: { path: 'notes.md' } }]);
		const dir = await mkdtemp(join(tmpdir(), 'gate-'));
		const tracePath = join(dir, 'gate.jsonl');
		const env = { [GATE_KEY_VARIABLE]: key };
		const served = await gateServe({
			stack: 'gate/stack/approval',
			upstream: upstream.url,
			mode: 'enforce',
			config: defaultConfig(),
			env,
			credentials: credentialsFromEnv({}),
			port: 0,
			sink: { id: 'telemetry/file', config: JSON.stringify({ path: tracePath, flushAfterMs: 50 }) }
		});
		try {
			expect(served.line).toContain('enforce, stack gate/stack/approval');
			expect(served.line).toContain('unauthenticated');
			const ask = (approvalId?: string) =>
				fetch(`${served.url}/v1/chat/completions`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-craftabot-conversation': 'h1',
						...(approvalId ? { 'x-craftabot-approval': approvalId } : {})
					},
					body: JSON.stringify({ messages: [{ role: 'user', content: 'Tidy up.' }] })
				});
			const held = await ask();
			expect(held.status).toBe(202);
			const { approvalId } = (await held.json()) as { approvalId: string };
			expect(await gateAnswer(approvalId, true, served.url)).toBe(
				`approval ${approvalId}: approved`
			);
			await expect(gateAnswer(approvalId, false, served.url)).rejects.toThrow(/already approved/);
			const answered = await ask(approvalId);
			expect(answered.status).toBe(200);
			const body = (await answered.json()) as {
				choices: Array<{ message: { tool_calls?: Array<{ function: { name: string } }> } }>;
			};
			expect(body.choices[0]!.message.tool_calls?.map((call) => call.function.name)).toEqual([
				'delete_file'
			]);
			expect(upstream.authorizations).toEqual([`Bearer ${key}`]);
			await fetch(`${served.url}/v1/gate/conversations/h1/end`, { method: 'POST' });
		} finally {
			await served.close();
			await upstream.close();
		}
		const lines = await readFile(tracePath, 'utf8');
		const types = lines
			.trim()
			.split('\n')
			.map((line) => (JSON.parse(line) as { type: string }).type);
		expect(types).toEqual(
			expect.arrayContaining([
				'run.started',
				'guardrail.checked',
				'approval.requested',
				'approval.resolved',
				'run.finished'
			])
		);
		// The key-leak sweep over what the Gate wrote.
		expect(lines).not.toContain(key);
		expect(served.line).not.toContain(key);
	});

	it('refuses a remote bind without --allow-remote, and names a stack it cannot read', async () => {
		const common = {
			upstream: 'http://127.0.0.1:1/v1',
			mode: 'enforce' as const,
			config: defaultConfig(),
			env: {},
			credentials: credentialsFromEnv({}),
			port: 0
		};
		await expect(
			gateServe({ ...common, stack: 'gate/stack/budgets', host: '0.0.0.0' })
		).rejects.toThrow(/--allow-remote/);
		await expect(gateServe({ ...common, stack: 'no-such-stack.json' })).rejects.toThrow(/ENOENT/);
	});
});
