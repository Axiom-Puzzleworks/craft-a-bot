/**
 * Answers as Bedrock's `ApplyGuardrail` returns them, in the documented
 * shape: an action, the outputs, and one assessment per policy. Shared by
 * the reading tests, the offline stand-in and the conformance run. Nothing
 * here is a real guardrail, account or key.
 */
export const fixtures = {
	clean: {
		action: 'NONE',
		outputs: [],
		assessments: [
			{
				contentPolicy: {
					filters: [
						{ type: 'PROMPT_ATTACK', confidence: 'NONE', detected: false },
						{ type: 'HATE', confidence: 'NONE', detected: false },
						{ type: 'VIOLENCE', confidence: 'NONE', detected: false }
					]
				}
			}
		]
	},
	'prompt-attack': {
		action: 'GUARDRAIL_INTERVENED',
		outputs: [{ text: 'Sorry, the model cannot answer this question.' }],
		assessments: [
			{
				contentPolicy: {
					filters: [
						{ type: 'PROMPT_ATTACK', confidence: 'HIGH', action: 'BLOCKED', detected: true },
						{ type: 'HATE', confidence: 'NONE', detected: false }
					]
				}
			}
		]
	},
	'pii-anonymised': {
		action: 'GUARDRAIL_INTERVENED',
		outputs: [{ text: 'The card is {CREDIT_DEBIT_CARD_NUMBER}.' }],
		assessments: [
			{
				contentPolicy: {
					filters: [{ type: 'PROMPT_ATTACK', confidence: 'NONE', detected: false }]
				},
				sensitiveInformationPolicy: {
					piiEntities: [{ type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'ANONYMIZED' }],
					regexes: []
				}
			}
		]
	},
	'topic-denied': {
		action: 'GUARDRAIL_INTERVENED',
		outputs: [{ text: 'Sorry, the model cannot answer this question.' }],
		assessments: [{ topicPolicy: { topics: [{ name: 'Investment advice', action: 'BLOCKED' }] } }]
	},
	forbidden: { message: 'The security token included in the request is invalid.' }
} as const;

export type FixtureName = keyof typeof fixtures;
