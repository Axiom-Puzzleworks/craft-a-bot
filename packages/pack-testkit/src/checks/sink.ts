import { createEventBus, describeSinkProblems, type TraceSink } from '@craftabot/core';
import type { ConformanceIssue, SinkConformanceFixture } from '../types.js';

/**
 * **`checkSink`** (`35-TELEMETRY.md` §4.4, WP47): a sink is a consumer that
 * never lets a failure past itself. Created with a `fetch` that refuses and
 * a planted secret, it must attach without throwing, take every event,
 * flush without rejecting, count the failure in `status()` and keep the
 * secret out of `lastError`; `export` must resolve `{ ok: false }` rather
 * than reject. A sink that throws from `attach` is the one thing this
 * exists to catch.
 */
export async function checkSink(
	sink: TraceSink,
	fixture: SinkConformanceFixture
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	for (const problem of describeSinkProblems(sink)) {
		issues.push({ check: 'sink.shape', message: `"${sink.id}" ${problem}` });
	}
	if (issues.length > 0) return issues;

	const parsed = sink.configSchema.safeParse(fixture.config);
	if (!parsed.success) {
		issues.push({
			check: 'sink.config',
			message: `"${sink.id}" refuses its own fixture config: ${parsed.error.issues[0]?.message ?? 'invalid'}`
		});
		return issues;
	}

	for (const declaration of sink.egress(fixture.config)) {
		if (typeof declaration.host !== 'string' || declaration.host === '') {
			issues.push({
				check: 'sink.egress',
				message: `"${sink.id}" declares an egress without a host`
			});
		}
	}

	const errors: string[] = [];
	const refusing: typeof globalThis.fetch = () =>
		Promise.reject(new Error(`no network in conformance (${fixture.plantedSecret})`));
	let instance;
	try {
		instance = sink.create({
			config: fixture.config,
			fetch: refusing,
			getCredential: () => fixture.plantedSecret,
			onError: (error) => errors.push(error.message)
		});
	} catch (error) {
		issues.push({
			check: 'sink.create',
			message: `"${sink.id}" threw from create(): ${(error as Error).message}`
		});
		return issues;
	}

	const bus = createEventBus();
	const run = { runId: fixture.input.run.id, agentId: fixture.input.run.agentId };
	try {
		const off = instance.attach(bus, run);
		for (const event of fixture.input.events) bus.emit(event);
		off();
	} catch (error) {
		issues.push({
			check: 'sink.attach',
			message: `"${sink.id}" threw from attach() or while receiving events: ${(error as Error).message}`
		});
		return issues;
	}
	try {
		await instance.flush();
	} catch (error) {
		issues.push({
			check: 'sink.flush',
			message: `"${sink.id}" rejected from flush(): ${(error as Error).message}`
		});
	}

	let exported;
	try {
		exported = await instance.export(fixture.input);
	} catch (error) {
		issues.push({
			check: 'sink.export',
			message: `"${sink.id}" rejected from export() — a failure is { ok: false }: ${(error as Error).message}`
		});
	}
	if (exported && exported.ok && fixture.expectsNetwork !== false) {
		issues.push({
			check: 'sink.export',
			message: `"${sink.id}" reported ok with no network — it did not try to send`
		});
	}

	const status = instance.status();
	if (fixture.expectsNetwork !== false && status.failed === 0) {
		issues.push({
			check: 'sink.status',
			message: `"${sink.id}" counts no failure after a refused send`
		});
	}
	const leaked = [status.lastError ?? '', ...errors].some((text) =>
		text.includes(fixture.plantedSecret)
	);
	if (leaked) {
		issues.push({
			check: 'sink.secret',
			message: `"${sink.id}" carries the credential in an error it reports`
		});
	}
	return issues;
}
