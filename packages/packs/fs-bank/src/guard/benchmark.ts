/**
 * **The reference benchmark** (WP123, `106-BENCHMARK.md` §6): every connectable guard service and every
 * reader that answers the guard question set, over the seven desks' adversarial corpora — the definition
 * the Workshop runs over the stand-ins and `benchmarks/bank-adversarial.json` holds for the harness
 * (a test keeps the two equal). Each service's config is the stand-in's; no list price is cited yet.
 */
export const BANK_ADVERSARIAL_BENCHMARK = {
	schemaVersion: 1,
	kind: 'benchmark',
	id: 'bank-adversarial',
	name: "The bank, attacked: every guard on the seven desks' adversarial corpora",
	description:
		'WP123 (106-BENCHMARK.md §6): every connectable guard service and every reader that answers fs-bank/questions/guard-q1, over the 1,408 rows of the seven adversarial corpora. Each service answers from its cassette under benchmarks/cassettes when it has one, else from its offline stand-in, which measures nothing. No list price is cited yet: a price enters with its source.',
	corpora: [
		'fs-servicing/corpus/adversarial-v1',
		'fs-advice/corpus/adversarial-v1',
		'fs-fraud/corpus/adversarial-v1',
		'fs-lending/corpus/adversarial-v1',
		'fs-onboarding/corpus/adversarial-v1',
		'fs-disputes/corpus/adversarial-v1',
		'fs-collections/corpus/adversarial-v1'
	],
	threshold: 0.5,
	subjects: {
		services: 'all',
		readers: 'all',
		components: []
	},
	serviceConfigs: {
		'geap/model-armor': {
			projectId: 'craftabot-stand-in',
			location: 'europe-west2',
			templateId: 'craftabot-stand-in'
		},
		'azure-content-safety/content-safety': {
			endpoint: 'https://craftabot-stand-in.cognitiveservices.azure.com'
		},
		'bedrock-guardrails/apply-guardrail': {
			region: 'eu-west-2',
			guardrailId: 'craftabot-stand-in'
		}
	}
} as const;
