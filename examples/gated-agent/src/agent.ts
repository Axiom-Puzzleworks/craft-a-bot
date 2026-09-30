/**
 * **An agent that knows nothing of Craft A Bot** (WP128, `107-THE-GATE.md`):
 * a plain loop over the OpenAI chat-completions wire — send the conversation,
 * run the tool calls that come back, send their results — pointed at an
 * endpoint that happens to be the Gate. Nothing here imports Craft A Bot, and
 * nothing here knows the stack that governs it: the refusals, the budget and
 * the stop arrive as ordinary assistant messages, which is all any agent sees.
 */

/** What happened to one turn, as the agent saw it. */
export interface Turn {
	turn: number;
	outcome: 'called' | 'refused' | 'stopped';
	/** The call the agent made, or the words that came back instead. */
	detail: string;
}

interface WireMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
}

const TOOLS: Record<string, (args: Record<string, unknown>) => string> = {
	read_file: (args) => `the contents of ${String(args['path'])}`,
	send_email: (args) => `sent to ${String(args['to'])}`,
	delete_file: (args) => `deleted ${String(args['path'])}`
};

export async function runGatedAgent(options: {
	/** Any OpenAI-compatible base URL — the Gate's, in this example. */
	baseUrl: string;
	turns: number;
	conversationId?: string;
	print?: (line: string) => void;
}): Promise<Turn[]> {
	const print = options.print ?? (() => {});
	const messages: WireMessage[] = [
		{ role: 'system', content: 'You are an office assistant. Use the tools to finish the task.' },
		{ role: 'user', content: 'Tidy up my notes and tell Sam.' }
	];
	const turns: Turn[] = [];
	let lastStop: string | undefined;
	for (let turn = 1; turn <= options.turns; turn += 1) {
		const response = await fetch(`${options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(options.conversationId ? { 'x-craftabot-conversation': options.conversationId } : {})
			},
			body: JSON.stringify({ model: 'office-model', messages })
		});
		const body = (await response.json()) as {
			choices: Array<{ message: WireMessage; finish_reason: string }>;
		};
		const message = body.choices[0]!.message;
		const calls = message.tool_calls ?? [];
		messages.push({
			role: 'assistant',
			content: message.content,
			...(calls.length > 0 ? { tool_calls: calls } : {})
		});
		if (calls.length === 0) {
			const words = message.content ?? '';
			// The same stop twice means the conversation is over; anything else is a refusal to work around.
			const outcome = words === lastStop || !words.includes('refused') ? 'stopped' : 'refused';
			turns.push({ turn, outcome, detail: words });
			print(`turn ${turn}: ${outcome} — ${words}`);
			if (outcome === 'stopped') break;
			lastStop = words;
			messages.push({ role: 'user', content: 'Carry on with the rest.' });
			continue;
		}
		for (const call of calls) {
			const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
			const result = TOOLS[call.function.name]?.(args) ?? 'no such tool';
			messages.push({ role: 'tool', tool_call_id: call.id, content: result });
			turns.push({ turn, outcome: 'called', detail: `${call.function.name}: ${result}` });
			print(`turn ${turn}: called ${call.function.name} — ${result}`);
		}
	}
	return turns;
}
