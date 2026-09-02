import {
	describeGuardrailServiceProblems,
	externalOutcomeKindSchema,
	hostMatches,
	type GuardrailService,
	type ScreenResult
} from '@craftabot/core';
import type { ConformanceIssue, GuardrailServiceConformanceFixture } from '../types.js';

/**
 * **A hosted guardrail service's conformance** (`29-GUARD-SHELL.md` §4.7,
 * WP39 stage E): the checks a second vendor has to pass that the Armour
 * Brick passed by hand in `25-…` §11 — made generic here, once.
 *
 * - `guardrailService.well-formed` — id, hooks, egress, schema, both factories (core's own data check).
 * - `guardrailService.config-parses` — the fixture config through `configSchema`.
 * - `guardrailService.offline-answers` — the offline client resolves a `ScreenResult` for every fixture request, with a record and unique finding labels.
 * - `guardrailService.create-never-throws` — a live client over a rejecting fetch, a 500 and a body of `{}` still resolves to `{ error }` with a known kind.
 * - `guardrailService.no-secret-leaks` — none of those results, stringified, carries the planted credential.
 * - `guardrailService.egress-declared` — every host the live client asked for matches a declared `egress` pattern.
 */
export async function checkGuardrailService(
	service: GuardrailService,
	fixture: GuardrailServiceConformanceFixture
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];

	for (const problem of describeGuardrailServiceProblems(service)) {
		issues.push({ check: 'guardrailService.well-formed', message: `"${service.id}" ${problem}` });
	}
	if (issues.length > 0) return issues;

	const parsedConfig = service.configSchema.safeParse(fixture.config);
	if (!parsedConfig.success) {
		issues.push({
			check: 'guardrailService.config-parses',
			message: `"${service.id}" refuses its own fixture config: ${parsedConfig.error.message}`
		});
		return issues;
	}
	const config = parsedConfig.data;

	// Offline: every request answered, with a record and distinct labels.
	const results: ScreenResult[] = [];
	try {
		const offline = service.createOffline(config);
		for (const request of fixture.requests) {
			const result = await offline.screen(request);
			results.push(result);
			if (typeof result.record?.service !== 'string' || result.record.service.length === 0) {
				issues.push({
					check: 'guardrailService.offline-answers',
					message: `"${service.id}" answered a ${request.hook} request offline with no record.service`
				});
			}
			if ('reading' in result) {
				const labels = result.reading.findings.map((f) => f.vendorLabel);
				if (new Set(labels).size !== labels.length) {
					issues.push({
						check: 'guardrailService.offline-answers',
						message: `"${service.id}" repeats a finding label offline: ${labels.join(', ')}`
					});
				}
			} else if (!externalOutcomeKindSchema.safeParse(result.error?.kind).success) {
				issues.push({
					check: 'guardrailService.offline-answers',
					message: `"${service.id}" answered offline with an error of unknown kind`
				});
			}
		}
	} catch (error) {
		issues.push({
			check: 'guardrailService.offline-answers',
			message: `"${service.id}" threw offline: ${error instanceof Error ? error.message : String(error)}`
		});
	}

	// Live, on three broken transports: never a throw, always a typed error.
	const hosts: string[] = [];
	const transports: Array<[string, typeof globalThis.fetch]> = [
		[
			'a rejecting fetch',
			(input) => {
				hosts.push(hostOf(input));
				return Promise.reject(new Error(`network down for ${fixture.plantedSecret}`));
			}
		],
		[
			'a 500',
			(input) => {
				hosts.push(hostOf(input));
				return Promise.resolve(new Response('{"error":{"message":"boom"}}', { status: 500 }));
			}
		],
		[
			'an empty body',
			(input) => {
				hosts.push(hostOf(input));
				return Promise.resolve(new Response('{}', { status: 200 }));
			}
		]
	];
	for (const [name, fetchImpl] of transports) {
		try {
			const client = service.create({
				config,
				fetch: fetchImpl,
				getCredential: () => fixture.plantedSecret,
				timeoutMs: 1000
			});
			for (const request of fixture.requests) {
				const result = await client.screen(request);
				results.push(result);
				if ('reading' in result) continue;
				if (!externalOutcomeKindSchema.safeParse(result.error?.kind).success) {
					issues.push({
						check: 'guardrailService.create-never-throws',
						message: `"${service.id}" over ${name} returned an error of unknown kind`
					});
				}
			}
		} catch (error) {
			issues.push({
				check: 'guardrailService.create-never-throws',
				message: `"${service.id}" threw over ${name}: ${error instanceof Error ? error.message : String(error)}`
			});
		}
	}

	if (JSON.stringify(results).includes(fixture.plantedSecret)) {
		issues.push({
			check: 'guardrailService.no-secret-leaks',
			message: `"${service.id}" let the credential into a screen result`
		});
	}

	for (const host of new Set(hosts)) {
		if (!service.egress.some((declaration) => hostMatches(declaration.host, host))) {
			issues.push({
				check: 'guardrailService.egress-declared',
				message: `"${service.id}" called "${host}", which no egress declaration covers`
			});
		}
	}

	return issues;
}

function hostOf(input: string | URL | Request): string {
	try {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		return new URL(url).host;
	} catch {
		return String(input);
	}
}

export { hostMatches };
