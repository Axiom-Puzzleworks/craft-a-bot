import { chainPlans, noPlans, starterPlans, type PlanSource } from '@craftabot/evals';
import {
	adversaryPlanFor as advicePlanUnsafe,
	planFor as advicePlanFor
} from '@craftabot/pack-fs-advice/testing';
import {
	adversaryPlanFor as fraudPlanUnsafe,
	planFor as fraudPlanFor
} from '@craftabot/pack-fs-fraud/testing';
import {
	adversaryPlanFor as lendingPlanUnsafe,
	planFor as lendingPlanFor
} from '@craftabot/pack-fs-lending/testing';
import {
	adversaryPlanFor as onboardingPlanUnsafe,
	planFor as onboardingPlanFor
} from '@craftabot/pack-fs-onboarding/testing';
import {
	adversaryPlanFor as disputesPlanUnsafe,
	planFor as disputesPlanFor
} from '@craftabot/pack-fs-disputes/testing';
import {
	adversaryPlanFor as collectionsPlanUnsafe,
	planFor as collectionsPlanFor
} from '@craftabot/pack-fs-collections/testing';
import {
	adversaryPlanFor as servicingPlanUnsafe,
	planFor as servicingPlanFor
} from '@craftabot/pack-fs-servicing/testing';
import { planFor as workshopPlanFor } from '@craftabot/pack-workshop/testing';

/**
 * The scripted plans the harness knows (WP60, `49-FS-ADVICE.md` §4.7): the
 * starter pack's, then the Workshop's, then the Advice Desk's, the Fraud Desk's (WP62) and the Lending Desk's (WP63) — the same
 * chain `run` had by hand, now one source every command shares.
 */
export const harnessPlans: PlanSource = chainPlans(
	starterPlans,
	{ planFor: workshopPlanFor, adversaryPlanFor: noPlans('adversarial') },
	{ planFor: advicePlanFor, adversaryPlanFor: advicePlanUnsafe },
	{ planFor: fraudPlanFor, adversaryPlanFor: fraudPlanUnsafe },
	{ planFor: lendingPlanFor, adversaryPlanFor: lendingPlanUnsafe },
	// WP103: the Onboarding Desk's.
	{ planFor: onboardingPlanFor, adversaryPlanFor: onboardingPlanUnsafe },
	// WP104: the Disputes Desk's.
	{ planFor: disputesPlanFor, adversaryPlanFor: disputesPlanUnsafe },
	// WP105: the Collections Desk's.
	{ planFor: collectionsPlanFor, adversaryPlanFor: collectionsPlanUnsafe },
	// WP106: the Servicing Desk's.
	{ planFor: servicingPlanFor, adversaryPlanFor: servicingPlanUnsafe }
);
