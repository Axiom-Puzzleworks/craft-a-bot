/** Types for `live-suite.mjs`, for the harness tests that hold the scripts (113 §12, the 35B suite). */
export interface LiveSuite {
	id: string;
	cartridge: string;
	model: string;
	short: string;
	pattern: string;
	experimentsDir: string;
	evidenceDir: string;
	recordingsDir: string;
	workDir: string;
	trials?: number;
	/** The oversight suite names its own designs (WP198). */
	designs?: string;
}
export const SUITES: Record<string, LiveSuite>;
export function suiteFrom(
	argv?: string[],
	env?: Record<string, string | undefined>
): { suite: LiveSuite; rest: string[] };
export function trialsOf(entry: { trials?: number }, suite: LiveSuite): number;
