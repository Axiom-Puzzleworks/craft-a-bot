/**
 * The shared `Storage` conformance suite moved to `@craftabot/core/testing`
 * (WP36 stage A, `26-TARGET-DESIGN-V3.md` §6.7) so every implementation — the
 * browser's IndexedDB store here, the harness's file store later — runs the
 * same tests. Re-exported for one release.
 */
export { describeStorageContract } from '@craftabot/core/testing';
