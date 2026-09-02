/**
 * `@craftabot/harness` — the headless host (WP37, `26-TARGET-DESIGN-V3.md`
 * §6.8): run a bot, keep the evidence, report on it, from a Node process and
 * a CLI, against the same contracts the browser uses. The browser is *a* host,
 * not *the* host (`26-…` tenet 9).
 */
export { createFileStorage, runExists, type FileStorage } from './storage/file-storage.js';
export {
	createRegistry,
	defaultConfig,
	defaultPacks,
	loadConfig,
	packVersions,
	parseConfig,
	type HarnessConfig
} from './config.js';
export {
	CREDENTIAL_PREFIX,
	credentialVariable,
	credentialsFromEnv,
	type CredentialSource
} from './credentials.js';
export { describePacks, type PackReport } from './commands/packs.js';
export { runKit, type BrainTier, type RunKitOptions, type RunKitReport } from './commands/run.js';
export { bundleRun } from './commands/bundle.js';
export {
	reportIncidents,
	reportSafetyCase,
	reportTelemetry,
	type TelemetryReport
} from './commands/report.js';
export { runRecordFrom } from './run-record.js';
export { main as cli, parseArgs, type CliIo } from './cli.js';
