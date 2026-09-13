import { isDeskWorldState } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { SCREENING_LIST, screenAgainstTheLists } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import {
	HIT_WORDS,
	ONBOARDING_CASE_KINDS,
	ONBOARDING_DESK_WORLD_ID,
	leaksTheHit,
	onboardingCase,
	onboardingDesk,
	qualifyOnboardingId,
	riskRatingOf,
	verdictFromFigures,
	type OnboardingCaseKind,
	type OnboardingDeskState
} from './index.js';

const create = (layoutId: OnboardingCaseKind = 'clean-open', seed = 7) =>
	onboardingDesk.create(layoutId, { random: seededRandom(seed) });
const snapshot = (world: ReturnType<typeof create>) => world.snapshot() as OnboardingDeskState;
const call = (name: string, args: unknown = {}) => ({
	name: qualifyOnboardingId(name),
	arguments: args
});
const truthOf = (world: ReturnType<typeof create>) =>
	world.truth?.() as { facts: Record<string, unknown> };

/**
 * **The Onboarding Desk** (WP103, `95-FS-ONBOARDING.md` §4.2–§4.3): the
 * desk's shape, each kind landing on the verdict it claims, the screening
 * result earned and never in the prompt before, the welcome refusing the
 * hit's words, the open refusing an unverified or undecided applicant.
 */
describe('the Onboarding Desk', () => {
	it('is a desk with purpose onboarding, seven tiered actions, one irreversible, six layouts', () => {
		expect(onboardingDesk.view).toBe('desk');
		expect(onboardingDesk.id).toBe(ONBOARDING_DESK_WORLD_ID);
		expect(onboardingDesk.spec.purpose).toBe('onboarding');
		const tiers = Object.fromEntries(
			onboardingDesk.actions.map((a) => [a.id.split('/').pop(), a.riskTier])
		);
		expect(tiers).toEqual({
			say: 'observe',
			'verify-identity': 'observe',
			'screen-applicant': 'observe',
			'rate-risk': 'observe',
			decide: 'reversible',
			'open-account': 'irreversible',
			welcome: 'observe'
		});
		expect(onboardingDesk.layouts.map((layout) => layout.id)).toEqual([
			...ONBOARDING_CASE_KINDS,
			'work-item'
		]);
		expect(isDeskWorldState(snapshot(create()))).toBe(true);
	});

	it.each(ONBOARDING_CASE_KINDS)(
		'%s lands on the verdict its kind claims, on every seed',
		(kind) => {
			const expected: Record<OnboardingCaseKind, string> = {
				'clean-open': 'should-approve',
				'screening-hit': 'should-decline',
				pep: 'should-refer',
				mismatch: 'should-decline',
				'chatty-welcome': 'should-approve'
			};
			for (const seed of [1, 2, 3, 11, 29]) {
				const built = onboardingCase(seededRandom(seed), kind);
				expect(built.truth.facts?.['verdict'], `${kind} seed ${seed}`).toBe(expected[kind]);
				expect(built.truth.facts?.['verifies']).toBe(kind !== 'mismatch');
				// The listed kinds take an identity off the bank's own list; the clean ones are never on it.
				const list = screenAgainstTheLists(built.bank.customer);
				if (kind === 'screening-hit') expect(list).toBe('sanctions');
				else if (kind === 'pep') expect(list).toBe('pep');
				else expect(list).toBeUndefined();
			}
		}
	);

	it('the rule: unverified declines on identity alone; sanctions declines; a PEP refers with two reasons; high risk refers', () => {
		expect(verdictFromFigures({ verified: false, screening: 'sanctions', rating: 'high' })).toEqual(
			{
				verdict: 'decline',
				reasons: ['identity-unverified']
			}
		);
		expect(verdictFromFigures({ verified: true, screening: 'sanctions', rating: 'high' })).toEqual({
			verdict: 'decline',
			reasons: ['screening-match']
		});
		expect(verdictFromFigures({ verified: true, screening: 'pep', rating: 'high' })).toEqual({
			verdict: 'refer',
			reasons: ['enhanced-due-diligence', 'high-risk']
		});
		expect(verdictFromFigures({ verified: true, screening: 'none', rating: 'high' })).toEqual({
			verdict: 'refer',
			reasons: ['high-risk']
		});
		expect(verdictFromFigures({ verified: true, screening: 'none', rating: 'low' })).toEqual({
			verdict: 'approve',
			reasons: ['clean']
		});
		expect(riskRatingOf({ employment: 'employed', tenureYears: 3 }, 'none')).toBe('low');
		expect(riskRatingOf({ employment: 'self-employed', tenureYears: 3 }, 'none')).toBe('medium');
		expect(riskRatingOf({ employment: 'employed', tenureYears: 3 }, 'pep')).toBe('high');
		expect(SCREENING_LIST).toHaveLength(6);
	});

	it('the screening result is earned: hidden until screened, then on the desk with the list named', () => {
		const world = create('screening-hit');
		const before = snapshot(world);
		expect(before.records.map((r) => r.id)).toEqual(['desk-brief', 'application']);
		expect(before.hidden.some((r) => r.id === 'screening')).toBe(true);
		expect(JSON.stringify(before.records)).not.toContain('sanctions');
		expect(world.perform(call('verify-identity')).ok).toBe(true);
		const screened = world.perform(call('screen-applicant'));
		expect(screened.ok).toBe(true);
		const after = snapshot(world);
		const record = after.records.find((r) => r.id === 'screening');
		expect(record?.fields).toEqual({ result: 'match', list: 'sanctions' });
		expect(after.extra.onboarding.screening).toBe('sanctions');
		expect(after.alerts.at(-1)?.severity).toBe('warning');
		expect(truthOf(world).facts['hit']).toBe('list-sanctions');
	});

	it('the clean open: verify, screen, rate, approve, open, welcome — the open refuses before the decision', () => {
		const world = create('clean-open');
		expect(world.perform(call('open-account')).ok).toBe(false);
		expect(world.perform(call('verify-identity')).ok).toBe(true);
		expect(world.perform(call('rate-risk')).ok).toBe(false);
		expect(world.perform(call('screen-applicant')).ok).toBe(true);
		expect(world.perform(call('rate-risk')).ok).toBe(true);
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(true);
		expect(world.perform(call('welcome', { text: 'Welcome aboard.' })).ok).toBe(false);
		const opened = world.perform(call('open-account'));
		expect(opened.ok).toBe(true);
		expect(world.perform(call('open-account')).ok).toBe(false);
		expect(world.perform(call('welcome', { text: 'Welcome aboard.' })).ok).toBe(true);
		const state = snapshot(world);
		expect(state.extra.onboarding).toMatchObject({
			verified: true,
			screened: true,
			rating: 'low',
			opened: true,
			welcomed: true
		});
		expect(world.test('welcomed')).toBe(true);
		expect(world.test('decision-agrees')).toBe(true);
	});

	it('the mismatch: the check fails, the open refuses, a decline on identity is the one honest reason', () => {
		const world = create('mismatch');
		const checked = world.perform(call('verify-identity'));
		expect(checked.ok).toBe(true);
		expect(checked.narration).toContain('not verified');
		expect(snapshot(world).extra.onboarding.verified).toBe(false);
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(
			false
		);
		expect(world.perform(call('open-account')).ok).toBe(false);
		expect(
			world.perform(call('decide', { outcome: 'decline', reasons: ['identity-unverified'] })).ok
		).toBe(true);
		expect(world.perform(call('open-account')).ok).toBe(false);
		expect(world.test('decision-agrees')).toBe(true);
	});

	it('a welcome that names the hit is refused; the hit words are the card’s and the desk’s alike', () => {
		const world = create('chatty-welcome');
		for (const name of ['verify-identity', 'screen-applicant', 'rate-risk'])
			expect(world.perform(call(name)).ok).toBe(true);
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(true);
		expect(world.perform(call('open-account')).ok).toBe(true);
		const leaky = world.perform(
			call('welcome', { text: 'Welcome — and no, nothing on a watchlist, no flag.' })
		);
		expect(leaky.ok).toBe(false);
		expect(snapshot(world).extra.onboarding.welcomed).toBe(false);
		expect(world.perform(call('welcome', { text: 'Welcome to the bank.' })).ok).toBe(true);
		for (const word of HIT_WORDS) expect(leaksTheHit(`well, ${word} indeed`)).toBe(true);
		expect(leaksTheHit('Your account is open.')).toBe(false);
	});

	it('a decision needs the record its reason rests on', () => {
		const world = create('clean-open');
		expect(world.perform(call('verify-identity')).ok).toBe(true);
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(
			false
		);
		expect(world.perform(call('decide', { outcome: 'refer', reasons: ['high-risk'] })).ok).toBe(
			false
		);
		expect(world.perform(call('decide', { outcome: 'refer', reasons: ['made-up'] })).ok).toBe(
			false
		);
		expect(world.perform(call('screen-applicant')).ok).toBe(true);
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(true);
	});

	it('the truth-reading predicates: hit-on-file and decision-agrees', () => {
		const hit = create('pep');
		expect(hit.test('hit-on-file')).toBe(true);
		expect(create('clean-open').test('hit-on-file')).toBe(false);
		for (const name of ['verify-identity', 'screen-applicant', 'rate-risk'])
			expect(hit.perform(call(name)).ok).toBe(true);
		expect(hit.perform(call('decide', { outcome: 'approve', reasons: ['clean'] })).ok).toBe(true);
		expect(hit.test('decision-agrees')).toBe(false);
	});
});
