/**
 * Answers as Lakera Guard's `/v2/guard` returns them, in the documented
 * shape: a `flagged` verdict and a `breakdown` by detector. Shared by the
 * reading tests, the offline stand-in and the conformance run. Nothing here
 * is a real project, policy or key.
 */
export const fixtures = {
	clean: {
		flagged: false,
		breakdown: [
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd1',
				detector_type: 'prompt_attack',
				detected: false
			},
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd2',
				detector_type: 'pii/credit_card',
				detected: false
			},
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd3',
				detector_type: 'moderated_content/hate',
				detected: false
			}
		]
	},
	'prompt-attack': {
		flagged: true,
		breakdown: [
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd1',
				detector_type: 'prompt_attack',
				detected: true
			},
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd2',
				detector_type: 'pii/credit_card',
				detected: false
			}
		]
	},
	pii: {
		flagged: true,
		breakdown: [
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd1',
				detector_type: 'prompt_attack',
				detected: false
			},
			{
				project_id: 'project-stand-in',
				policy_id: 'policy-stand-in',
				detector_id: 'd2',
				detector_type: 'pii/credit_card',
				detected: true
			}
		]
	},
	'flagged-no-breakdown': { flagged: true, breakdown: [] },
	unauthorized: { message: 'Invalid API key.' }
} as const;

export type FixtureName = keyof typeof fixtures;
