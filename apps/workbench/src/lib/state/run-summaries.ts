/**
 * Moved to `@craftabot/governance/reports` (WP37 stage C) so the headless
 * host keeps summaries by the same rule the Workshop's screens do — finished
 * runs written back, in-progress runs folded but never stored. Re-exported
 * here for one release; new code imports from the package.
 */
export { ensureRunSummaries, persistRunSummary } from '@craftabot/governance/reports';
