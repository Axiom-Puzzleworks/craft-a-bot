import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChatMessage, ChatResponse, EngineEvent, Stack } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import {
	GATE_CONTENT,
	GATE_PRESETS,
	createGate,
	fromChatMessages,
	fromChatResponse,
	parseStackFile,
	serveGate
} from '@craftabot/gate';
import { compileStackLoop } from '@craftabot/governance';
import fsBankPack from '@craftabot/pack-fs-bank';
import {
	buildRegistry,
	buildSpec,
	planFor,
	runToCompletion
} from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';

/**
 * **The Gate's identity test** (WP127 stage C, `107-THE-GATE.md` §6): the same
 * conversation and the same stack, once through a session over the mock
 * provider in the Playroom and once through the Gate on a port, in front of
 * an upstream on another port that answers each turn as the mock did — each
 * request the prompt the session composed at that turn, each `post-act` the
 * tool message carrying that turn's result — and the two `guardrail.checked`
 * sequences equal over tick, guardrail, hook, verdict, component and point.
 * Every preset and the Studio-built fixture, on every push.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const CARD = 'starter/tidy-the-blocks';
const STUDIO_FIXTURE = parseStackFile(
	JSON.parse(readFileSync(resolve(ROOT, 'packages/gate/fixtures/studio-stack.json'), 'utf8'))
);

function registry() {
	const created = buildRegistry();
	created.registerPack(fsBankPack);
	created.registerPack(GATE_CONTENT);
	return created;
}

type Checked = {
	tick: number;
	guardrailId: string;
	hook: string;
	verdict: unknown;
	componentId?: string;
	point?: unknown;
};
const checked = (events: readonly EngineEvent[]): Checked[] =>
	events.flatMap((event) =>
		event.type === 'guardrail.checked'
			? [
					{
						tick: event.tick,
						guardrailId: event.payload.guardrailId,
						hook: event.payload.hook,
						verdict: event.payload.verdict,
						...(event.payload.componentId ? { componentId: event.payload.componentId } : {}),
						...(event.payload.point ? { point: event.payload.point } : {})
					}
				]
			: []
	);

async function throughSession(stack: Stack) {
	const reg = registry();
	return runToCompletion({
		script: obedient(planFor(CARD)),
		spec: buildSpec({
			goalCardId: CARD,
			memory: { windowSize: 30, notebook: false, strategy: 'transcript' }
		}),
		guardrails: compileStackLoop(stack, reg),
		packs: [fsBankPack, GATE_CONTENT],
		approve: true,
		stepLimit: 20
	});
}

/** The upstream: each turn's answer, as the session's mock gave it, on a port. */
async function upstreamServing(responses: Map<number, ChatResponse>) {
	let turn = 0;
	const server = createServer((request, response) => {
		request.resume();
		request.on('end', () => {
			turn += 1;
			const answer = responses.get(turn);
			response.writeHead(answer ? 200 : 500, { 'content-type': 'application/json' });
			response.end(
				JSON.stringify(answer ? fromChatResponse(answer, `call_${turn}`) : { error: 'no turn' })
			);
		});
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address();
	return {
		url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`,
		close: () => new Promise<void>((done) => server.close(() => done()))
	};
}

async function throughGate(stack: Stack, session: readonly EngineEvent[]) {
	const prompts = new Map<number, ChatMessage[]>();
	const responses = new Map<number, ChatResponse>();
	const results = new Map<number, string>();
	for (const event of session) {
		if (event.type === 'prompt.composed') prompts.set(event.tick, event.payload.messages);
		if (event.type === 'think.completed') responses.set(event.tick, event.payload.response);
		if (event.type === 'action.performed') results.set(event.tick, event.payload.result.narration);
	}
	const upstream = await upstreamServing(responses);
	const gate = createGate({
		stack,
		registry: registry(),
		upstream: { baseUrl: upstream.url },
		mode: 'enforce'
	});
	const served = await serveGate(gate);
	const headers = { 'content-type': 'application/json', 'x-craftabot-conversation': 'identity' };
	const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
		fetch(`${served.url}${path}`, {
			method: 'POST',
			headers: { ...headers, ...extra },
			body: JSON.stringify(body)
		});
	try {
		const ticks = [...prompts.keys()].sort((a, b) => a - b);
		for (const tick of ticks) {
			const request = { model: 'mock-1', messages: fromChatMessages(prompts.get(tick)!) };
			let reply = await post('/v1/chat/completions', request);
			if (reply.status === 202) {
				const { approvalId } = (await reply.json()) as { approvalId: string };
				await post(`/v1/gate/approvals/${approvalId}`, { approved: true });
				reply = await post('/v1/chat/completions', request, { 'x-craftabot-approval': approvalId });
			}
			expect(reply.status, `tick ${tick}`).toBe(200);
			await reply.json();
		}
		// The last turn's post-act: its call and its result, as the next prompt would have carried them.
		const last = ticks.at(-1)!;
		const call = responses.get(last)?.toolCall;
		const final: ChatMessage[] = [
			...prompts.get(last)!,
			...(call && results.has(last)
				? [
						{
							role: 'assistant' as const,
							content: responses.get(last)!.text,
							toolCalls: [{ id: `call_${last}`, name: call.name, arguments: call.arguments }]
						},
						{
							role: 'tool' as const,
							content: results.get(last)!,
							toolCallId: `call_${last}`,
							name: call.name
						}
					]
				: [])
		];
		await post('/v1/gate/conversations/identity/end', { messages: fromChatMessages(final) });
		return (await gate.trace('identity'))!.events;
	} finally {
		await served.close();
		await upstream.close();
	}
}

const COVERAGE: Record<string, [number, string[], string[]]> = {
	'gate/stack/budgets': [7, ['allow', 'stop-run'], ['pre-think']],
	'gate/stack/policy-card': [15, ['allow', 'stop-run'], ['pre-act', 'pre-think']],
	'gate/stack/approval': [10, ['pause'], ['pre-act']],
	'gate/stack/injection-defences': [20, ['allow', 'annotate'], ['post-act', 'pre-act']],
	'gate/stack/quarantined-reader': [20, ['allow', 'annotate'], ['post-act', 'pre-act']],
	'local/stack/tidy-desk-guard': [30, ['allow', 'annotate'], ['post-act', 'pre-act', 'pre-think']]
};

const STACKS: Array<[string, Stack]> = [
	...GATE_PRESETS.map((stack): [string, Stack] => [stack.id, stack]),
	[`${STUDIO_FIXTURE.id} (the Studio’s)`, STUDIO_FIXTURE]
];

describe('the Gate’s identity (WP127)', () => {
	it.each(STACKS)(
		'%s: the Gate’s guardrail.checked sequence is the session’s',
		async (_name, stack) => {
			const session = await throughSession(stack);
			const expected = checked(session.events);
			expect(expected.length).toBeGreaterThan(0);
			const gate = await throughGate(stack, session.events);
			expect(checked(gate)).toEqual(expected);
			const kinds = expected.map((row) => {
				const verdict = row.verdict as {
					allow?: boolean;
					pause?: boolean;
					verdictKind?: string;
					disposition?: string;
				};
				return verdict.pause
					? 'pause'
					: verdict.allow
						? (verdict.verdictKind ?? 'allow')
						: verdict.disposition!;
			});
			// Pinned, so no case can quietly go trivial: how many checks, which verdicts, which hooks.
			expect([
				expected.length,
				[...new Set(kinds)].sort(),
				[...new Set(expected.map((row) => row.hook))].sort()
			]).toEqual(COVERAGE[stack.id]);
		}
	);
});
