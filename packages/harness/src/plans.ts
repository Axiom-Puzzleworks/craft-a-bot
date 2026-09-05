import { chainPlans, noPlans, starterPlans, type PlanSource } from '@craftabot/evals';
import {
	adversaryPlanFor as advicePlanUnsafe,
	planFor as advicePlanFor
} from '@craftabot/pack-fs-advice/testing';
import { planFor as workshopPlanFor } from '@craftabot/pack-workshop/testing';

/**
 * The scripted plans the harness knows (WP60, `49-FS-ADVICE.md` §4.7): the
 * starter pack's, then the Workshop's, then the Advice Desk's — the same
 * chain `run` had by hand, now one source every command shares.
 */
export const harnessPlans: PlanSource = chainPlans(
	starterPlans,
	{ planFor: workshopPlanFor, adversaryPlanFor: noPlans('adversarial') },
	{ planFor: advicePlanFor, adversaryPlanFor: advicePlanUnsafe }
);
