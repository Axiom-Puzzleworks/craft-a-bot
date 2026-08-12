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
