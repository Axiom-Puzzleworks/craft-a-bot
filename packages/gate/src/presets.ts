import { stackSchema, type PackManifest, type PolicyCard, type Stack } from '@craftabot/core';

/**
 * **The Gate's content** (WP127, `107-THE-GATE.md` §6): five preset stacks
 * over what the wire can see — no world predicate, no observation — and the
 * one policy card the second of them fits. Registered as a small manifest
 * beside the host's packs, so a preset resolves its card like any stack.
 */
const PROVENANCE = {
	author: { kind: 'service' as const, id: 'craftabot/gate', name: 'The Gate' },
	createdAt: '2026-09-30T00:00:00.000Z'
};

/** Mail leaves only through the company's own domain: the example agent's rule, on the wire. */
export const NO_OUTSIDE_MAIL_CARD: PolicyCard = {
	id: 'gate/policy/no-outside-mail',
	title: 'No mail outside example.com',
	description: 'Blocks a send_email call addressed outside example.com.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'send_email' },
					{
						kind: 'not',
						expr: { kind: 'argument-matches', path: 'to', pattern: '@example\\.com$' }
					}
				]
			},
			then: 'block-action',
			reason: 'Mail may only be sent to example.com addresses.'
		}
	]
} as PolicyCard;

const stack = (id: string, name: string, description: string, fit: Stack['fit']): Stack =>
	stackSchema.parse({ schemaVersion: 1, id, name, description, fit, provenance: PROVENANCE });

export const GATE_PRESETS: readonly Stack[] = [
	stack('gate/stack/budgets', 'Budgets', 'The turn and token budgets, before each turn.', [
		{
			componentId: 'governance/step-budget',
			config: { maxTicks: 4 },
			point: { kind: 'pre-think' }
		},
		{
			componentId: 'governance/token-budget',
			config: { maxTokens: 20_000 },
			point: { kind: 'pre-think' }
		}
	]),
	stack(
		'gate/stack/policy-card',
		'A policy card',
		'The step budget, and mail only inside the company.',
		[
			{
				componentId: 'governance/step-budget',
				config: { maxTicks: 8 },
				point: { kind: 'pre-think' }
			},
			{
				componentId: 'governance/policy-card',
				config: { cardId: NO_OUTSIDE_MAIL_CARD.id },
				point: { kind: 'pre-act' }
			}
		]
	),
	stack('gate/stack/approval', 'Ask first', 'A person approves every call.', [
		{
			componentId: 'governance/approval-mode',
			config: { mode: 'everything' },
			point: { kind: 'pre-act' }
		}
	]),
	stack(
		'gate/stack/injection-defences',
		'Injection defences',
		'Every call’s result marked untrusted; a call its words reach refused.',
		[
			{ componentId: 'governance/untrusted-content', config: {}, point: { kind: 'post-act' } },
			{ componentId: 'governance/taint', config: {}, point: { kind: 'pre-act' } }
		]
	),
	stack(
		'gate/stack/quarantined-reader',
		'Quarantined reader',
		'A reader alone reads each result; the agent reads its answers; taint holds the rest.',
		[
			{ componentId: 'fs-bank/guard/quarantined-reader', config: {}, point: { kind: 'post-act' } },
			{ componentId: 'governance/taint', config: {}, point: { kind: 'pre-act' } }
		]
	)
];

/** The manifest a host registers beside its packs, so the presets and their card resolve. */
export const GATE_CONTENT: PackManifest = {
	id: 'gate',
	name: 'The Gate’s presets',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	policyCards: [NO_OUTSIDE_MAIL_CARD],
	stacks: [...GATE_PRESETS]
};
