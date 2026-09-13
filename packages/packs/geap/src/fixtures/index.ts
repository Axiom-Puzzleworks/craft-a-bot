/**
 * Verbatim `SanitizationResult` envelopes (`25-…` §4.2), one per scenario the
 * Armour Brick must classify correctly. Shared by `reading.test.ts` (parsing)
 * and `guardrails.test.ts` (the `verdictFor` table).
 */
import clean from './clean.json' with { type: 'json' };
import csam from './csam.json' with { type: 'json' };
import failure from './failure.json' with { type: 'json' };
import injectionHigh from './injection-high.json' with { type: 'json' };
import injectionMedium from './injection-medium.json' with { type: 'json' };
import maliciousUri from './malicious-uri.json' with { type: 'json' };
import partialSkipped from './partial-skipped.json' with { type: 'json' };
import raiDangerous from './rai-dangerous.json' with { type: 'json' };
import sdpBasic from './sdp-basic.json' with { type: 'json' };
import sdpDeidentified from './sdp-deidentified.json' with { type: 'json' };

export const fixtures = {
	clean,
	'injection-high': injectionHigh,
	'injection-medium': injectionMedium,
	'rai-dangerous': raiDangerous,
	'sdp-basic': sdpBasic,
	'sdp-deidentified': sdpDeidentified,
	'malicious-uri': maliciousUri,
	csam,
	'partial-skipped': partialSkipped,
	failure
} as const;

export type FixtureName = keyof typeof fixtures;
