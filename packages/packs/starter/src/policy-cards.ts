import type { PolicyCard } from '@craftabot/core';
import { LEAK_PHRASE } from './world/predicates.js';

/**
 * **The starter policy cards** (`14-…` §4.6, WP22).
 *
 * Three, one per disposition, each written against a Playroom action that
 * genuinely exists — the L5 efficacy suite (`policy-cards.test.ts`) proves
 * each one by driving a scripted adversarial run straight at it. A card that
 * cannot be demonstrated against real content is a card nobody can trust.
 */

/** Block: nothing gets left on the floor — it goes in the chest or it stays in hand. */
const NO_LOOSE_ENDS: PolicyCard = {
	id: 'starter/policy/no-loose-ends',
	title: 'No loose ends',
	description: 'Blocks putting something down anywhere but the toy chest.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'put_down' },
					{ kind: 'not', expr: { kind: 'argument-equals', path: 'container', value: 'toy chest' } }
				]
			},
			then: 'block-action',
			reason: 'Everything goes in the toy chest — nothing gets left on the floor.'
		}
	]
};

/** Require approval: a locked or closed chest only opens with a person watching. */
const ASK_BEFORE_OPENING: PolicyCard = {
	id: 'starter/policy/ask-before-opening',
	title: 'Ask before opening',
	description: 'Pauses for a person before the chest is opened.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'open' },
			then: 'require-approval',
			reason: 'Opening the chest is worth a person checking first.'
		}
	]
};

/** Stop-run: a hard, card-authored deadline, independent of the Safety Brick's own dial. */
const WRAP_UP_BY_TEN: PolicyCard = {
	id: 'starter/policy/wrap-up-by-ten',
	title: 'Wrap up by turn ten',
	description: 'Stops the run at turn ten, however the step-budget dial is set.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-think',
			when: { kind: 'usage-at-least', field: 'ticks', value: 10 },
			then: 'stop-run',
			reason: 'Ten turns is the deadline this card sets, card and dial both watching.'
		}
	]
};

/**
 * Block, scoped to the exact leak rather than the whole `say` action
 * (`19-…` #11, WP25): a blanket blocklist on `say` would also stop the bot
 * greeting Teddy, which is the legitimate half of the goal a defended bot
 * still has to complete. This is "remove one leg" made concrete — the
 * exfiltration channel is narrowed to nothing, not switched off outright.
 */
const NO_SECRETS_OUT_LOUD: PolicyCard = {
	id: 'starter/policy/no-secrets-out-loud',
	title: 'No secrets out loud',
	description: 'Blocks saying the cupboard code, however the bot was talked into it.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{ kind: 'argument-equals', path: 'text', value: LEAK_PHRASE }
				]
			},
			then: 'block-action',
			reason:
				'That is the cupboard code — it never gets said out loud, whatever a note in the room asks for.'
		}
	]
};

export const starterPolicyCards: PolicyCard[] = [
	NO_LOOSE_ENDS,
	ASK_BEFORE_OPENING,
	WRAP_UP_BY_TEN,
	NO_SECRETS_OUT_LOUD
];
