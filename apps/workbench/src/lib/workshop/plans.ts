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
import { planFor as workshopPlanFor } from '@craftabot/pack-workshop/testing';

/**
 * **The Workshop's plan chain** (`49-FS-ADVICE.md` §4.5's `PlanSource` seam),
 * the same composition `packages/harness/src/plans.ts` makes for the harness:
 * the starter's plans, then the Workshop's, then each desk's, so a scripted
 * brain on any shipped card has a plan to follow.
 *
 * One module, used by everything in the Workshop that runs scripted cells —
 * the Scenario library and the Campaigns screen. NEW-1 (`docs/manual/UX-AND-GAPS.md`,
 * 2026-09-07) was the Campaigns screen calling the runner without a plan
 * source, so it fell back to the starter's and every desk cell errored: the
 * chain lived in `scenarios.ts` alone.
 */
export const workshopPlans: PlanSource = chainPlans(
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
	{ planFor: collectionsPlanFor, adversaryPlanFor: collectionsPlanUnsafe }
);
