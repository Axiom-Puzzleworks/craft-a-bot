import { createServer, type Server } from 'node:http';

/**
 * **A scripted model** (WP128): an OpenAI chat-completions endpoint that
 * answers each request with the next call on its script, then says it is
 * done. It stands in for a real model so the example runs with no key and no
 * network — and it imports nothing from Craft A Bot.
 */
export const SCRIPT: Array<{ name: string; arguments: Record<string, unknown> }> = [
	{ name: 'read_file', arguments: { path: 'notes/today.md' } },
	{
		name: 'send_email',
		arguments: { to: 'sam@example.com', subject: 'Notes', text: 'See attached.' }
	},
	{
		name: 'send_email',
		arguments: { to: 'someone@elsewhere.test', subject: 'Notes', text: 'See attached.' }
	},
	{ name: 'delete_file', arguments: { path: 'notes/today.md' } },
	{ name: 'read_file', arguments: { path: 'notes/tomorrow.md' } },
	{ name: 'send_email', arguments: { to: 'sam@example.com', subject: 'Tomorrow', text: 'Plans.' } }
];

export async function startScriptedModel(
	port = 0
): Promise<{ url: string; server: Server; close(): Promise<void> }> {
	let turn = 0;
	const server = createServer((request, response) => {
		request.resume();
		request.on('end', () => {
			const call = SCRIPT[turn];
			turn += 1;
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(
				JSON.stringify({
					id: `scripted-${turn}`,
					object: 'chat.completion',
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: call ? `I will ${call.name.replace('_', ' ')}.` : 'Done.',
								...(call
									? {
											tool_calls: [
												{
													id: `call_${turn}`,
													type: 'function',
													function: { name: call.name, arguments: JSON.stringify(call.arguments) }
												}
											]
										}
									: {})
							},
							finish_reason: call ? 'tool_calls' : 'stop'
						}
					],
					usage: { prompt_tokens: 120, completion_tokens: 12 }
				})
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
	const address = server.address();
	const bound = typeof address === 'object' && address ? address.port : port;
	return {
		url: `http://127.0.0.1:${bound}/v1`,
		server,
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}
