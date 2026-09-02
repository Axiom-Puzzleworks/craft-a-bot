/**
 * `@craftabot/core/testing` — deterministic scaffolding for tests, E2E runs,
 * and the keyless demo build. Kept off the main barrel so production bundles
 * of the engine never pull it in.
 */
export {
	createMockProvider,
	mumbling,
	obedient,
	turn,
	wanderer,
	type MockProviderOptions,
	type MockScript,
	type MockTurn
} from './mock-provider.js';
export { createTestClock, type TestClock } from './test-clock.js';
export { v1BrickKinds } from './brick-kinds.js';
/**
 * The `Storage` conformance suite and its fixtures (WP36 stage A). One suite,
 * run against every implementation — the in-memory store here, the browser's
 * IndexedDB store, a headless host's file store — so no two can drift.
 */
export { describeStorageContract } from './storage-contract.js';
export {
	makeAgent,
	makeAgentV1,
	makeEvent,
	makeGroupRun,
	makeRun,
	makeSpec,
	makeSpecV1,
	uuid
} from './storage-fixtures.js';
