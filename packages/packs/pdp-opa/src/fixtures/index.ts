/**
 * Response bodies as OPA's Data API returns them (`33-…` §4.3, WP45) —
 * `POST /v1/data/<path>` answers `{ "result": <the document> }`, and an
 * undefined document answers `{}`. Shared by the reading tests, the offline
 * client and the conformance run.
 */
import allow from './allow.json' with { type: 'json' };
import deny from './deny.json' with { type: 'json' };
import undefinedDocument from './undefined.json' with { type: 'json' };

export const fixtures = { allow, deny, undefined: undefinedDocument } as const;

export type FixtureName = keyof typeof fixtures;
