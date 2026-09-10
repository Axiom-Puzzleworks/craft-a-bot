/**
 * `@craftabot/desk/testing` (WP79): the runtime's own test desk for the
 * packages that run something over a desk without wanting a pack's content
 * to move their oracle — `@craftabot/workflow`'s identity test, the
 * harness's `workflow run` test. The same door `@craftabot/core/testing` is.
 */
export {
	TEST_DESK_ID,
	counterpartTestDesk,
	counterpartTestDeskSpec,
	testDesk,
	testDeskSpec,
	type TestExtra
} from './test-desk.js';
