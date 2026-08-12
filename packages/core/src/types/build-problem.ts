/**
 * validateSpec()'s output (02-AGENT-MODEL.md §6). Rendered by the build-checks
 * ribbon (03-UI-UX-DESIGN.md §4.4): only `blocking` problems disable GO,
 * everything else explains without blocking.
 */
export type BuildProblemSeverity = 'blocking' | 'warning';

export type BuildProblemCode =
	| 'missing-brain'
	| 'unknown-cartridge'
	| 'unknown-goal-card'
	| 'unknown-tool'
	| 'unknown-sense-channel'
	| 'unknown-action'
	| 'unknown-blocked-action'
	| 'tool-needs-notebook';

export type BrickSlot = 'llm' | 'memory' | 'tools' | 'sense' | 'actions' | 'safety';

export interface BuildProblem {
	code: BuildProblemCode;
	severity: BuildProblemSeverity;
	/** Which brick panel this relates to, so the UI can point at it. */
	brick?: BrickSlot;
	message: string;
	details?: Record<string, unknown>;
}
