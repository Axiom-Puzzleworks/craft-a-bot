/**
 * Verbatim `SanitizationResult` envelopes (`25-…` §4.2), one per scenario the
 * Armour Brick must classify correctly. Shared by `reading.test.ts` (parsing)
 * and `guardrails.test.ts` (the `verdictFor` table).
 */
import clean from './clean.json';
import csam from './csam.json';
import failure from './failure.json';
import injectionHigh from './injection-high.json';
import injectionMedium from './injection-medium.json';
import maliciousUri from './malicious-uri.json';
import partialSkipped from './partial-skipped.json';
import raiDangerous from './rai-dangerous.json';
import sdpBasic from './sdp-basic.json';
import sdpDeidentified from './sdp-deidentified.json';

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
