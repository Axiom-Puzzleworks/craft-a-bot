/**
 * Answers as Amazon Verified Permissions' `IsAuthorized` returns them, in
 * the documented shape: a decision, the policies that determined it, and any
 * errors. Shared by the reading tests, the offline stand-in and the
 * conformance run. Nothing here is a real policy store, account or key.
 */
export const fixtures = {
	allow: {
		decision: 'ALLOW',
		determiningPolicies: [{ policyId: 'policy-stand-in-permit' }],
		errors: []
	},
	deny: {
		decision: 'DENY',
		determiningPolicies: [{ policyId: 'policy-stand-in-forbid-irreversible' }],
		errors: []
	},
	'deny-by-default': { decision: 'DENY', determiningPolicies: [], errors: [] },
	'evaluation-error': {
		decision: 'DENY',
		determiningPolicies: [],
		errors: [{ errorDescription: 'while evaluating policy policy-stand-in: attribute missing' }]
	},
	forbidden: { message: 'User is not authorized to perform: verifiedpermissions:IsAuthorized' }
} as const;

export type FixtureName = keyof typeof fixtures;
