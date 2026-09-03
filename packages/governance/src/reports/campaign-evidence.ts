/**
 * **Campaign results per bot** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md` §4.2,
 * WP49): what a stored campaign report says about one shelf bot, quoted
 * into its safety case.
 *
 * Governance does not import `@craftabot/evals` (the ESLint rule keeps it on
 * `core`), so the report arrives as the structural slice below —
 * `CampaignReport` satisfies it as it is. The link from a report to a bot is
 * `builds[].agentId`, which a build made from a kit file carries; a
 * `starter-default` build belongs to no bot and is never quoted.
 *
 * A gate is this bot's evidence when it was scoped to this build, or scoped
 * to no build at all (it applied to every build, this one included). A gate
 * scoped to *another* build says nothing about this bot and is left out —
 * quoting it would be borrowing someone else's result.
 */

export interface CampaignReportLike {
	id: string;
	campaignTitle: string;
	createdAt: string;
	passed: boolean;
	builds?: ReadonlyArray<{
		id: string;
		agentId?: string | undefined;
		agentName?: string | undefined;
	}>;
	cells: ReadonlyArray<{ build: string; outcome?: string | undefined }>;
	gates: ReadonlyArray<{
		id: string;
		required: string;
		observed?: number | undefined;
		passed: boolean;
		where?: { build?: string | undefined } | undefined;
	}>;
}

export interface CampaignEvidence {
	reportId: string;
	title: string;
	createdAt: string;
	/** The whole report's verdict — every gate, every build. */
	passed: boolean;
	buildId: string;
	/** This build's cells, and how they ended (`not-run` for a cell that never produced an outcome). */
	cells: number;
	outcomes: Record<string, number>;
	gates: Array<{
		id: string;
		required: string;
		observed: number | undefined;
		passed: boolean;
		/** True when the gate named this build; false when it applied to every build. */
		scoped: boolean;
	}>;
}

/** Every report and build in which this bot ran, newest report first. */
export function campaignEvidenceFor(
	agentId: string,
	reports: readonly CampaignReportLike[]
): CampaignEvidence[] {
	const evidence: CampaignEvidence[] = [];
	const ordered = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	for (const report of ordered) {
		for (const build of report.builds ?? []) {
			if (build.agentId !== agentId) continue;
			const cells = report.cells.filter((cell) => cell.build === build.id);
			const outcomes: Record<string, number> = {};
			for (const cell of cells) {
				const key = cell.outcome ?? 'not-run';
				outcomes[key] = (outcomes[key] ?? 0) + 1;
			}
			evidence.push({
				reportId: report.id,
				title: report.campaignTitle,
				createdAt: report.createdAt,
				passed: report.passed,
				buildId: build.id,
				cells: cells.length,
				outcomes,
				gates: report.gates
					.filter((gate) => gate.where?.build === undefined || gate.where.build === build.id)
					.map((gate) => ({
						id: gate.id,
						required: gate.required,
						observed: gate.observed,
						passed: gate.passed,
						scoped: gate.where?.build === build.id
					}))
			});
		}
	}
	return evidence;
}
