import { selectCells, type CampaignReport } from './campaign.js';

/**
 * A campaign report as JUnit XML (`28-CAMPAIGNS.md` §4.5): one `testsuite`
 * per campaign, one `testcase` per gate — the shape every CI system ingests
 * (Jenkins, Gradle, GitHub's JUnit actions). A failed gate carries a
 * `<failure>` whose message is the same sentence the scorecard prints and
 * whose body lists the run ids of the cells it measured, so a red build
 * points at traces; an inconclusive gate is `<skipped/>`. There is no single
 * normative schema for JUnit XML, so the fixture is checked structurally.
 */
export function renderJUnit(report: CampaignReport): string {
	const failures = report.gates.filter((gate) => !gate.passed).length;
	const skipped = report.gates.filter((gate) => gate.inconclusive).length;
	const lines: string[] = [];
	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push(
		`<testsuites name="craftabot" tests="${report.gates.length}" failures="${failures}" errors="0" skipped="${skipped}">`
	);
	lines.push(
		`  <testsuite name="campaign:${escape(report.campaignId)}" tests="${report.gates.length}" failures="${failures}" errors="0" skipped="${skipped}" timestamp="${escape(report.createdAt)}" time="0">`
	);
	for (const gate of report.gates) {
		const open = `    <testcase classname="${escape(gate.kind)}" name="${escape(gate.id)}" time="0"`;
		if (gate.inconclusive) {
			lines.push(`${open}>`);
			lines.push(
				`      <skipped message="${escape(`inconclusive — ${gate.required} (no baseline)`)}"/>`
			);
			lines.push('    </testcase>');
		} else if (gate.passed) {
			lines.push(`${open}/>`);
		} else {
			const runs = selectCells(gate.where, report.cells)
				.map(
					(cell) =>
						cell.runId ??
						`(${cell.scenario}/${cell.guard}/${cell.brain}/${cell.seed}: ${cell.error ?? 'no run id'})`
				)
				.join('\n');
			lines.push(`${open}>`);
			lines.push(`      <failure message="${escape(failureMessage(gate))}" type="gate">`);
			lines.push(escape(`cells (${gate.cells}):\n${runs}`));
			lines.push('      </failure>');
			lines.push('    </testcase>');
		}
	}
	lines.push('  </testsuite>');
	lines.push('</testsuites>');
	return `${lines.join('\n')}\n`;
}

export function failureMessage(gate: CampaignReport['gates'][number]): string {
	const observed = gate.observed === undefined ? 'no cells matched' : `observed ${format(gate)}`;
	return `${observed}, required ${gate.required}`;
}

function format(gate: CampaignReport['gates'][number]): string {
	if (gate.observed === undefined) return '—';
	return gate.kind === 'metric'
		? String(Math.round(gate.observed * 100) / 100)
		: `${Math.round(gate.observed * 100)}%`;
}

export function escape(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
