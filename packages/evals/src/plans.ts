import { adversaryPlanFor, planFor, type Plan } from '@craftabot/pack-starter/testing';

/**
 * **Where scripted plans come from** (WP60 stage B, `49-FS-ADVICE.md` §4.7):
 * a plan is content a pack ships under its `/testing` export, and the host
 * — the harness, the Workshop — knows which packs are installed. The
 * runners take a `PlanSource` and default to the starter pack's, which is
 * what they always used; `chainPlans` composes several in order, the first
 * that knows a card answering. `evals` itself never imports a desk pack.
 */
export interface PlanSource {
	/** The scripted-optimal plan for a card, or a throw that names the card. */
	planFor(goalCardId: string): Plan;
	/** The unsafe plan for a card, or a throw that names the card. */
	adversaryPlanFor(goalCardId: string): Plan;
}

export const starterPlans: PlanSource = { planFor, adversaryPlanFor };

/** A source that knows no card at all — for a pack that ships optimal plans and no adversarial ones. */
export const noPlans = (what: string): ((goalCardId: string) => Plan) => {
	return (goalCardId) => {
		throw new Error(`no ${what} plan for ${goalCardId}`);
	};
};

export function chainPlans(...sources: readonly PlanSource[]): PlanSource {
	const first = (pick: (source: PlanSource) => (goalCardId: string) => Plan) => {
		return (goalCardId: string): Plan => {
			let last: unknown;
			for (const source of sources) {
				try {
					return pick(source).call(source, goalCardId);
				} catch (error) {
					last = error;
				}
			}
			throw last instanceof Error ? last : new Error(`no plan for ${goalCardId}`);
		};
	};
	return {
		planFor: first((source) => source.planFor),
		adversaryPlanFor: first((source) => source.adversaryPlanFor)
	};
}
