/**
 * Response bodies as Azure AI Content Safety returns them (`30-…` §3) —
 * the `2024-09-01` shapes for `text:shieldPrompt` and `text:analyze`, and
 * the 401 envelope. Shared by the reading tests, the offline client and the
 * conformance run.
 */
import analyzeClean from './analyze-clean.json' with { type: 'json' };
import analyzeViolence from './analyze-violence.json' with { type: 'json' };
import shieldAttack from './shield-attack.json' with { type: 'json' };
import shieldClean from './shield-clean.json' with { type: 'json' };
import shieldDocumentAttack from './shield-document-attack.json' with { type: 'json' };
import unauthorized from './unauthorized.json' with { type: 'json' };

export const fixtures = {
	'shield-clean': shieldClean,
	'shield-attack': shieldAttack,
	'shield-document-attack': shieldDocumentAttack,
	'analyze-clean': analyzeClean,
	'analyze-violence': analyzeViolence,
	unauthorized
} as const;

export type FixtureName = keyof typeof fixtures;
