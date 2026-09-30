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
 * The `Storage` fixtures (WP36 stage A). The conformance suite they serve,
 * `describeStorageContract`, is `@craftabot/core/testing/contract`: it imports
 * `vitest`, and this barrel is imported by the app's runtime (the Demo Brain,
 * the Worker's mock provider), which must never carry a test runner.
 */
export {
	makeAgent,
	makeAgentV1,
	makeCampaignReport,
	makeExperimentResult,
	makeBenchmarkReport,
	makeStoredWorkflowRun,
	makeContent,
	makeEvaluation,
	makeEvent,
	makeGroupRun,
	makeRun,
	makeRunSummary,
	makeSpec,
	makeSpecV1,
	uuid
} from './storage-fixtures.js';
