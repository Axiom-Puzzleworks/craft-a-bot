/**
 * `@craftabot/core/testing/contract` — the `Storage` conformance suite (WP36
 * stage A). One suite, run against every implementation — the in-memory store,
 * the browser's IndexedDB store, a headless host's file store — so no two can
 * drift. Its own entry point because it imports `vitest`: `@craftabot/core/testing`
 * is imported by runtime code (the Demo Brain, the Worker's mock provider), and
 * a test runner in that barrel rode into the Workbench's bundle.
 */
export { describeStorageContract } from './storage-contract.js';
