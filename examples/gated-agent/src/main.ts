import { runGatedAgent } from './agent.js';

/** `npm start`: the agent, pointed at the Gate (`GATE_URL`, 127.0.0.1:8127 by default). */
const baseUrl = `${process.env['GATE_URL'] ?? 'http://127.0.0.1:8127'}/v1`;
const turns = await runGatedAgent({
	baseUrl,
	turns: 8,
	conversationId: 'office',
	print: (line) => console.log(line)
});
const refused = turns.filter((turn) => turn.outcome === 'refused').length;
console.log(
	`\n${turns.length} turns: ${turns.filter((turn) => turn.outcome === 'called').length} calls, ${refused} refused, ${turns.some((turn) => turn.outcome === 'stopped') ? 'then stopped' : 'not stopped'}`
);
