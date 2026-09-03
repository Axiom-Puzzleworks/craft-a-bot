import { describe, expect, it } from 'vitest';
import { hostMatches } from './egress.js';

/**
 * The `*-suffix` label form (WP51, `39-HOSTED-EVALUATOR.md` §4.2): names the
 * Vertex AI regional hosts without naming every Google host. Additive — the
 * whole-label wildcard and exact labels keep their meaning.
 */
describe('hostMatches with a suffix wildcard', () => {
	it('matches any label ending in the suffix, in one position', () => {
		expect(
			hostMatches('*-aiplatform.googleapis.com', 'europe-west2-aiplatform.googleapis.com')
		).toBe(true);
		expect(
			hostMatches('*-aiplatform.googleapis.com', 'us-central1-aiplatform.googleapis.com')
		).toBe(true);
		expect(
			hostMatches('*-aiplatform.googleapis.com', 'EUROPE-WEST2-AIPLATFORM.googleapis.com')
		).toBe(true);
	});

	it('does not match the bare suffix, a different label count, or the suffix elsewhere', () => {
		expect(hostMatches('*-aiplatform.googleapis.com', 'aiplatform.googleapis.com')).toBe(false);
		expect(hostMatches('*-aiplatform.googleapis.com', '-aiplatform.googleapis.com')).toBe(false);
		expect(
			hostMatches('*-aiplatform.googleapis.com', 'evil-aiplatform.googleapis.com.example')
		).toBe(false);
		expect(hostMatches('*-aiplatform.googleapis.com', 'europe-west2-aiplatform.example.com')).toBe(
			false
		);
	});

	it('leaves the whole-label wildcard and exact labels as they were', () => {
		expect(
			hostMatches('modelarmor.*.rep.googleapis.com', 'modelarmor.europe-west2.rep.googleapis.com')
		).toBe(true);
		expect(hostMatches('api.openai.com', 'api.openai.com')).toBe(true);
		expect(hostMatches('api.openai.com', 'api-openai.com')).toBe(false);
	});
});
