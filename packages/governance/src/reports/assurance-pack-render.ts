import type { Principal } from '@craftabot/core';
import type {
	AssuranceCampaign,
	AssurancePack,
	AssurancePrincipal,
	NotRecorded
} from './assurance-pack.js';

/**
 * **The two renderings** (WP67, `53-ASSURANCE-PACK.md` §4.2): markdown for a
 * person at a terminal, and one self-contained HTML file — the app's tokens
 * inlined, no script, printable, every run id an anchor into the appendix —
 * for a reader who has never opened the app. Both cite ids after every
 * number: a figure with nothing behind it is written as "none", never as a
 * zero that reads as a rate.
 */

/** The app's colour tokens, inlined (`apps/workbench/src/lib/styles/tokens.css`; a test keeps them equal). */
export const ASSURANCE_TOKENS: Readonly<Record<string, string>> = {
	cream: '#f3e9d2',
	paper: '#efe3c8',
	ink: '#2b2620',
	'ink-muted': '#5c5348',
	blue: '#2456a6',
	'blue-text': '#1c4485',
	red: '#c93a2e',
	'red-text': '#a72e24',
	green: '#4e8a3c',
	'green-text': '#3a6e2c',
	yellow: '#e9b62f',
	teal: '#3e8f8a'
};

const percent = (value: number | undefined): string =>
	value === undefined ? 'none' : `${Math.round(value * 100)}%`;
const list = (ids: readonly string[]): string => (ids.length === 0 ? 'none' : ids.join(', '));
const cite = (ids: readonly string[]): string =>
	ids.length === 0 ? '(no runs behind this figure)' : `(runs: ${ids.join(', ')})`;
const notRecorded = (entry: NotRecorded): string => entry.note;
/**
 * A principal and its chain, one line: `person "Sam" (browser-1) for service craftabot-harness`.
 * A person with no name is said to be unnamed (UX-3, 2026-09-07) rather than left as a bare id
 * a reviewer would take for a name — the id stays, because the pack is evidence.
 */
export const principalLine = (principal: Principal): string => {
	const one = (p: Principal) =>
		`${p.kind}${p.name ? ` "${p.name}"` : p.kind === 'person' ? ' (unnamed)' : ''} (${p.id})`;
	const chain: string[] = [];
	for (let at: Principal | undefined = principal; at; at = at.onBehalfOf) chain.push(one(at));
	return chain.join(' for ');
};
const principalsMd = (entries: readonly AssurancePrincipal[]): string =>
	entries.map((entry) => `${principalLine(entry.principal)} ${cite(entry.runIds)}`).join('; ');

function campaignLines(campaign: AssuranceCampaign): string[] {
	const lines: string[] = [];
	lines.push(
		`- **${campaign.title}** (report \`${campaign.reportId}\`, ${campaign.createdAt}) — ${campaign.passed ? 'passed' : 'failed'}; build \`${campaign.buildId}\`, ${campaign.cells} cells ${cite(campaign.runIds)}`
	);
	for (const gate of campaign.gates)
		lines.push(
			`  - gate \`${gate.id}\`: ${gate.required} → ${gate.observed === undefined ? 'none' : gate.observed} — ${gate.passed ? 'pass' : 'fail'}${gate.scoped ? '' : ' (campaign-wide)'}`
		);
	for (const matrix of campaign.matrices.filter((entry) => !entry.slice['scenario']))
		lines.push(
			`  - matrix \`${matrix.evaluatorId}\`: tp ${matrix.tp}, fp ${matrix.fp}, tn ${matrix.tn}, fn ${matrix.fn}; precision ${percent(matrix.precision)}, recall ${percent(matrix.recall)}, false-positive rate ${percent(matrix.falsePositiveRate)} ${cite(campaign.runIds)}`
		);
	for (const parity of campaign.parity)
		lines.push(
			`  - parity \`${parity.id}\`: ${parity.required} — ${parity.passed ? 'pass' : 'fail'}; ${Object.entries(
				parity.values
			)
				.map(([value, number]) => `${value} ${percent(number)}`)
				.join(
					', '
				)}. ${parity.matched ? 'The campaign claims matched cohorts.' : 'The cohorts are unmatched: the cases differ in more than the attribute, so a spread is a caveat, not a finding.'}`
		);
	for (const row of campaign.obligations)
		lines.push(
			`  - obligation \`${row.tag}\`: ${row.cells} cells, success ${percent(row.successRate)}`
		);
	return lines;
}

/** The markdown rendering: sections in SS1/23's order, ids cited after every number. */
export function renderAssurancePackMarkdown(pack: AssurancePack): string {
	const out: string[] = [];
	out.push(`# Assurance pack — ${pack.bot.name}`);
	out.push('');
	out.push(`> ${pack.posture}`);
	out.push('');
	out.push(
		`Generated ${pack.generatedAt}; digest \`${pack.digest}\`. Bot \`${pack.bot.id}\` on goal card \`${pack.bot.goalCardId}\`${pack.bot.worldId ? ` in world \`${pack.bot.worldId}\`` : ''}${pack.bot.purpose ? ` (purpose: ${pack.bot.purpose})` : ''}. Control rows: ${pack.review.rows} — ${pack.review.reviewed} reviewed, ${pack.review.unreviewed} unreviewed, ${pack.review.pending} pending.`
	);
	out.push('');
	out.push('## 1. Identification and classification (SS1/23 principle 1) — the inventory entry');
	out.push('');
	out.push(
		`- Agent card: **${pack.inventory.agentCard.name}**, goal card \`${pack.inventory.agentCard.goalCardId}\`; bricks: ${pack.inventory.agentCard.bricks.map((brick) => `\`${brick.kind}\``).join(', ') || 'none'}`
	);
	out.push(
		`- Kit file requires: core \`${pack.inventory.requires.core}\`; packs ${
			Object.entries(pack.inventory.requires.packs)
				.map(([id, range]) => `\`${id}@${range}\``)
				.join(', ') || 'none'
		}`
	);
	out.push(
		`- Installed pack versions: ${Object.entries(pack.inventory.packVersions)
			.map(([id, version]) => `\`${id}@${version}\``)
			.join(', ')}`
	);
	if (pack.inventory.world)
		out.push(
			`- World: ${pack.inventory.world.name} (\`${pack.inventory.world.id}\`)${pack.inventory.world.purpose ? `, purpose ${pack.inventory.world.purpose}` : ''}`
		);
	out.push('');
	out.push('## 2. Governance (principle 2)');
	out.push('');
	out.push(`- Safety stack: ${list(pack.governance.guardrails)}`);
	out.push(
		`- Approvals: ${pack.governance.approvals.requested} requested, ${pack.governance.approvals.granted} granted ${cite(pack.governance.approvals.runIds)}`
	);
	out.push(
		`- Egress: hosts ${list(pack.governance.egress.hosts)}; ${pack.governance.egress.recordedRuns} runs recorded their egress, ${pack.governance.egress.noNetworkRuns} allowed none ${cite(pack.governance.egress.runIds)}`
	);
	out.push(
		`- Principal: ${pack.governance.principal.recorded ? principalsMd(pack.governance.principal.principals) : notRecorded(pack.governance.principal)}`
	);
	out.push('');
	out.push('## 3. Development, implementation and use (principle 3) — the campaigns');
	out.push('');
	if (pack.development.note) out.push(pack.development.note);
	for (const campaign of pack.development.campaigns) out.push(...campaignLines(campaign));
	out.push('');
	out.push('## 4. Independent validation (principle 4)');
	out.push('');
	out.push(
		`- Validated by: ${pack.validation.validatedBy.recorded ? `${principalsMd(pack.validation.validatedBy.validators)} — ${pack.validation.validatedBy.note}` : notRecorded(pack.validation.validatedBy)}`
	);
	if (pack.validation.note) out.push(`- ${pack.validation.note}`);
	for (const row of pack.validation.evaluations)
		out.push(
			`- \`${row.evaluatorId}\`: ${row.pass} pass, ${row.fail} fail, ${row.inconclusive} inconclusive${row.meanScore === undefined ? '' : `, mean score ${row.meanScore.toFixed(2)}`} ${cite(row.runIds)}`
		);
	out.push('');
	out.push('## 5. Risk mitigants (principle 5)');
	out.push('');
	out.push(`- Cannot: ${list(pack.mitigants.inability)}`);
	out.push(`- Can reach (irreversible): ${list(pack.mitigants.reach)}`);
	out.push(`- Guardrails: ${list(pack.mitigants.guardrails)}`);
	out.push(`- Kill switch: ${pack.mitigants.killSwitch}`);
	out.push(
		`- Hosted screening: ${pack.mitigants.hostedScreening ? `${pack.mitigants.hostedScreening.fired} fired over ${pack.mitigants.hostedScreening.decisions} decisions` : 'none fitted'}`
	);
	out.push('');
	out.push('## 6. Ongoing monitoring');
	out.push('');
	if (pack.monitoring.note) out.push(pack.monitoring.note);
	out.push(
		`- Series: ${pack.monitoring.series.length} days; drift flags: ${pack.monitoring.drift.length === 0 ? 'none' : pack.monitoring.drift.map((flag) => `${flag.day} ${flag.kind}${flag.series ? ` ${flag.series}` : ''}`).join('; ')}`
	);
	out.push(`- Incidents: ${pack.monitoring.incidents.length === 0 ? 'none' : ''}`);
	for (const incident of pack.monitoring.incidents) {
		out.push(
			`  - run \`${incident.runId}\` (${incident.startedAt}, ${incident.outcome ?? 'unfinished'}): ${incident.findings.map((finding) => finding.kind).join(', ')}`
		);
		for (const explanation of incident.explanations)
			out.push(
				`    - tick ${explanation.tick}: saw "${(explanation.observation?.text ?? '').slice(0, 80)}"; chose ${explanation.decision.call ? `\`${explanation.decision.call.name}\`` : 'nothing'}; checks ${explanation.checks.map((check) => `${check.guardrailId} ${check.verdict}`).join(', ') || 'none'}; ${explanation.approval ? `a person said ${explanation.approval.approved === false ? 'no' : 'yes'}; ` : ''}${explanation.result ? `result: ${explanation.result.ok ? 'ok' : 'failed'}` : 'no result'} (runs: ${incident.runId})`
			);
	}
	out.push(`- Explanations: ${pack.monitoring.explanations.note}`);
	out.push('');
	out.push('## 7. The Consumer Duty outcomes');
	out.push('');
	for (const outcome of pack.outcomes) {
		out.push(`### ${outcome.title} (\`${outcome.tag}\`)`);
		out.push(`- Control rows: ${list(outcome.rows)}`);
		if (outcome.evaluations.length === 0)
			out.push('- Evaluator evidence: none over this bot’s runs');
		for (const row of outcome.evaluations)
			out.push(
				`- \`${row.evaluatorId}\`: ${row.pass} pass, ${row.fail} fail, ${row.inconclusive} inconclusive ${cite(row.runIds)}`
			);
		out.push('');
	}
	out.push('## 8. The control map');
	out.push('');
	for (const map of pack.controlMaps) {
		out.push(`### ${map.title} (\`${map.id}\`)`);
		out.push('');
		out.push(map.description);
		out.push('');
		out.push('| Framework | Ref | Obligation | Evidence | Status |');
		out.push('|---|---|---|---|---|');
		for (const row of map.rows)
			out.push(
				`| ${row.framework} | \`${row.ref}\` | ${row.obligation} | ${row.status === 'pending' ? `pending — ${row.note ?? ''}` : row.evidence.map((item) => `${item.kind} \`${item.id}\` (${item.presence})`).join('; ')} | ${row.status ?? 'reviewed'} |`
			);
		out.push('');
	}
	out.push('## Appendix — runs');
	out.push('');
	if (pack.runs.length === 0) out.push('No stored runs.');
	for (const run of pack.runs)
		out.push(
			`- \`${run.id}\` — ${run.startedAt}, ${run.outcome ?? 'unfinished'}, ${run.goalCardId}`
		);
	out.push('');
	out.push(`> ${pack.posture}`);
	out.push('');
	return out.join('\n');
}

const escape = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const runLink = (id: string): string =>
	`<a href="#run-${escape(id)}"><code>${escape(id)}</code></a>`;
const citeHtml = (ids: readonly string[]): string =>
	ids.length === 0
		? '<span class="cite">(no runs behind this figure)</span>'
		: `<span class="cite">(runs: ${ids.map(runLink).join(', ')})</span>`;
const listHtml = (ids: readonly string[]): string =>
	ids.length === 0 ? 'none' : ids.map((id) => `<code>${escape(id)}</code>`).join(', ');
const table = (caption: string, head: string[], rows: string[][]): string =>
	`<table><caption>${escape(caption)}</caption><thead><tr>${head.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** The self-contained HTML rendering: tokens inlined, no script, printable, every run id an anchor into the appendix. */
export function renderAssurancePackHtml(pack: AssurancePack): string {
	const css = `:root{${Object.entries(ASSURANCE_TOKENS)
		.map(([name, value]) => `--cab-${name}:${value}`)
		.join(';')}}
body{margin:0;padding:2rem;background:var(--cab-cream);color:var(--cab-ink);font:16px/1.5 system-ui,sans-serif;max-width:64rem}
h1,h2,h3{line-height:1.2}h2{margin-top:2.5rem;border-bottom:2px solid var(--cab-ink);padding-bottom:.25rem}
.posture{padding:.75rem 1rem;border:2px solid var(--cab-ink);background:var(--cab-paper);font-weight:600}
.meta,.cite,.note{color:var(--cab-ink-muted)}.cite{font-size:.9em}
table{border-collapse:collapse;width:100%;margin:1rem 0;background:var(--cab-paper)}
caption{text-align:left;font-weight:600;padding:.25rem 0}
th,td{border:1px solid var(--cab-ink-muted);padding:.4rem .5rem;text-align:left;vertical-align:top}
th{background:var(--cab-cream)}code{font-size:.9em}
.present{color:var(--cab-green-text);font-weight:600}.available{color:var(--cab-blue-text)}.pending,.not-recorded{color:var(--cab-ink-muted);font-style:italic}.unresolved{color:var(--cab-red-text);font-weight:600}
@media print{body{background:#fff;padding:0}table{page-break-inside:avoid}}`;
	const section = (title: string, body: string): string =>
		`<section><h2>${escape(title)}</h2>${body}</section>`;
	const notRec = (entry: NotRecorded): string =>
		`<span class="not-recorded">${escape(entry.note)}</span>`;
	const principalsHtml = (entries: readonly AssurancePrincipal[]): string =>
		entries
			.map((entry) => `${escape(principalLine(entry.principal))} ${citeHtml(entry.runIds)}`)
			.join('; ');

	const inventory = `<ul>
<li>Agent card: <strong>${escape(pack.inventory.agentCard.name)}</strong>, goal card <code>${escape(pack.inventory.agentCard.goalCardId)}</code>; bricks: ${pack.inventory.agentCard.bricks.length === 0 ? 'none' : pack.inventory.agentCard.bricks.map((brick) => `<code>${escape(brick.kind)}</code>`).join(', ')}</li>
<li>Kit file requires: core <code>${escape(pack.inventory.requires.core)}</code>; packs ${
		Object.entries(pack.inventory.requires.packs)
			.map(([id, range]) => `<code>${escape(`${id}@${range}`)}</code>`)
			.join(', ') || 'none'
	}</li>
<li>Installed pack versions: ${Object.entries(pack.inventory.packVersions)
		.map(([id, version]) => `<code>${escape(`${id}@${version}`)}</code>`)
		.join(', ')}</li>
${pack.inventory.world ? `<li>World: ${escape(pack.inventory.world.name)} (<code>${escape(pack.inventory.world.id)}</code>)${pack.inventory.world.purpose ? `, purpose ${escape(pack.inventory.world.purpose)}` : ''}</li>` : ''}
</ul>`;

	const governance = `<ul>
<li>Safety stack: ${listHtml(pack.governance.guardrails)}</li>
<li>Approvals: ${pack.governance.approvals.requested} requested, ${pack.governance.approvals.granted} granted ${citeHtml(pack.governance.approvals.runIds)}</li>
<li>Egress: hosts ${listHtml(pack.governance.egress.hosts)}; ${pack.governance.egress.recordedRuns} runs recorded their egress, ${pack.governance.egress.noNetworkRuns} allowed none ${citeHtml(pack.governance.egress.runIds)}</li>
<li>Principal: ${pack.governance.principal.recorded ? principalsHtml(pack.governance.principal.principals) : notRec(pack.governance.principal)}</li>
</ul>`;

	const development =
		(pack.development.note ? `<p class="note">${escape(pack.development.note)}</p>` : '') +
		pack.development.campaigns
			.map(
				(campaign) => `<h3>${escape(campaign.title)}</h3>
<p class="meta">Report <code>${escape(campaign.reportId)}</code>, ${escape(campaign.createdAt)} — ${campaign.passed ? 'passed' : 'failed'}; build <code>${escape(campaign.buildId)}</code>, ${campaign.cells} cells ${citeHtml(campaign.runIds)}</p>
${table(
	'Gates',
	['Gate', 'Required', 'Observed', 'Verdict'],
	campaign.gates.map((gate) => [
		`<code>${escape(gate.id)}</code>`,
		escape(gate.required),
		gate.observed === undefined ? 'none' : String(gate.observed),
		gate.passed ? 'pass' : 'fail'
	])
)}
${
	campaign.matrices.filter((entry) => !entry.slice['scenario']).length > 0
		? table(
				'Confusion matrices ' +
					(campaign.runIds.length
						? `(runs: ${campaign.runIds.join(', ')})`
						: '(no runs behind these figures)'),
				['Evaluator', 'tp', 'fp', 'tn', 'fn', 'Precision', 'Recall', 'False-positive rate'],
				campaign.matrices
					.filter((entry) => !entry.slice['scenario'])
					.map((matrix) => [
						`<code>${escape(matrix.evaluatorId)}</code>`,
						String(matrix.tp),
						String(matrix.fp),
						String(matrix.tn),
						String(matrix.fn),
						percent(matrix.precision),
						percent(matrix.recall),
						percent(matrix.falsePositiveRate)
					])
			)
		: ''
}
${
	campaign.parity.length > 0
		? table(
				'Parity',
				['Gate', 'Required', 'Values', 'Verdict', 'Cohorts'],
				campaign.parity.map((parity) => [
					`<code>${escape(parity.id)}</code>`,
					escape(parity.required),
					Object.entries(parity.values)
						.map(([value, number]) => `${escape(value)} ${percent(number)}`)
						.join(', ') || 'none',
					parity.passed ? 'pass' : 'fail',
					parity.matched
						? 'matched (the campaign’s own claim)'
						: 'unmatched — the cases differ in more than the attribute, so a spread is a caveat, not a finding'
				])
			)
		: ''
}
${
	campaign.obligations.length > 0
		? table(
				'Obligations ' + (campaign.runIds.length ? `(runs: ${campaign.runIds.join(', ')})` : ''),
				['Tag', 'Cells', 'Success'],
				campaign.obligations.map((row) => [
					`<code>${escape(row.tag)}</code>`,
					String(row.cells),
					percent(row.successRate)
				])
			)
		: ''
}`
			)
			.join('');

	const evaluationRows = (rows: AssurancePack['validation']['evaluations']) =>
		table(
			'Evaluator evidence',
			['Evaluator', 'Pass', 'Fail', 'Inconclusive', 'Mean score', 'Runs'],
			rows.map((row) => [
				`<code>${escape(row.evaluatorId)}</code>`,
				String(row.pass),
				String(row.fail),
				String(row.inconclusive),
				row.meanScore === undefined ? 'none' : row.meanScore.toFixed(2),
				citeHtml(row.runIds)
			])
		);
	const validation = `<p>Validated by: ${pack.validation.validatedBy.recorded ? `${principalsHtml(pack.validation.validatedBy.validators)} <span class="note">${escape(pack.validation.validatedBy.note)}</span>` : notRec(pack.validation.validatedBy)}</p>${pack.validation.note ? `<p class="note">${escape(pack.validation.note)}</p>` : evaluationRows(pack.validation.evaluations)}`;

	const mitigants = `<ul>
<li>Cannot: ${pack.mitigants.inability.length === 0 ? 'none' : pack.mitigants.inability.map(escape).join('; ')}</li>
<li>Can reach (irreversible): ${pack.mitigants.reach.length === 0 ? 'none' : pack.mitigants.reach.map(escape).join('; ')}</li>
<li>Guardrails: ${listHtml(pack.mitigants.guardrails)}</li>
<li>Kill switch: ${escape(pack.mitigants.killSwitch)}</li>
<li>Hosted screening: ${pack.mitigants.hostedScreening ? `${pack.mitigants.hostedScreening.fired} fired over ${pack.mitigants.hostedScreening.decisions} decisions` : 'none fitted'}</li>
</ul>`;

	const monitoring = `${pack.monitoring.note ? `<p class="note">${escape(pack.monitoring.note)}</p>` : ''}<ul>
<li>Series: ${pack.monitoring.series.length} days; drift flags: ${pack.monitoring.drift.length === 0 ? 'none' : pack.monitoring.drift.map((flag) => escape(`${flag.day} ${flag.kind}${flag.series ? ` ${flag.series}` : ''}`)).join('; ')}</li>
<li>Incidents: ${pack.monitoring.incidents.length === 0 ? 'none' : ''}</li>
${pack.monitoring.incidents.map((incident) => `<li>Run ${runLink(incident.runId)} (${escape(incident.startedAt)}, ${escape(incident.outcome ?? 'unfinished')}): ${incident.findings.map((finding) => escape(finding.kind)).join(', ')}${incident.explanations.length > 0 ? `<ul>${incident.explanations.map((explanation) => `<li>Tick ${explanation.tick}: saw <q>${escape((explanation.observation?.text ?? '').slice(0, 80))}</q>; chose ${explanation.decision.call ? `<code>${escape(explanation.decision.call.name)}</code>` : 'nothing'}; checks ${explanation.checks.length === 0 ? 'none' : explanation.checks.map((check) => `<code>${escape(check.guardrailId)}</code> ${escape(check.verdict)}`).join(', ')}; ${explanation.approval ? `a person said ${explanation.approval.approved === false ? 'no' : 'yes'}; ` : ''}${explanation.result ? `result: ${explanation.result.ok ? 'ok' : 'failed'}` : 'no result'} ${citeHtml([incident.runId])}</li>`).join('')}</ul>` : ''}</li>`).join('')}
<li>Explanations: <span class="${'recorded' in pack.monitoring.explanations && pack.monitoring.explanations.recorded ? 'meta' : 'not-recorded'}">${escape(pack.monitoring.explanations.note)}</span></li>
</ul>`;

	const outcomes = pack.outcomes
		.map(
			(outcome) => `<h3>${escape(outcome.title)} <code>${escape(outcome.tag)}</code></h3>
<p>Control rows: ${listHtml(outcome.rows)}</p>
${outcome.evaluations.length === 0 ? '<p class="note">Evaluator evidence: none over this bot’s runs.</p>' : evaluationRows(outcome.evaluations)}`
		)
		.join('');

	const controlMaps = pack.controlMaps
		.map(
			(
				map
			) => `<h3>${escape(map.title)} <code>${escape(map.id)}</code></h3><p class="meta">${escape(map.description)}</p>
${table(
	map.title,
	['Framework', 'Ref', 'Obligation', 'Evidence', 'Status'],
	map.rows.map((row) => [
		escape(row.framework),
		`<code>${escape(row.ref)}</code>`,
		escape(row.obligation),
		row.status === 'pending'
			? `<span class="pending">pending — ${escape(row.note ?? '')}</span>`
			: row.evidence
					.map(
						(item) =>
							`${escape(item.kind)} <code>${escape(item.id)}</code> <span class="${item.presence}">${item.presence}</span>`
					)
					.join('; '),
		escape(row.status ?? 'reviewed')
	])
)}`
		)
		.join('');

	const runs =
		pack.runs.length === 0
			? '<p class="note">No stored runs.</p>'
			: `<ul>${pack.runs.map((run) => `<li id="run-${escape(run.id)}"><code>${escape(run.id)}</code> — ${escape(run.startedAt)}, ${escape(run.outcome ?? 'unfinished')}, <code>${escape(run.goalCardId)}</code></li>`).join('')}</ul>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assurance pack — ${escape(pack.bot.name)}</title>
<style>${css}</style>
</head>
<body>
<main>
<h1>Assurance pack — ${escape(pack.bot.name)}</h1>
<p class="posture">${escape(pack.posture)}</p>
<p class="meta">Generated ${escape(pack.generatedAt)}; digest <code>${escape(pack.digest)}</code>. Bot <code>${escape(pack.bot.id)}</code> on goal card <code>${escape(pack.bot.goalCardId)}</code>${pack.bot.worldId ? ` in world <code>${escape(pack.bot.worldId)}</code>` : ''}${pack.bot.purpose ? ` (purpose: ${escape(pack.bot.purpose)})` : ''}. Control rows: ${pack.review.rows} — ${pack.review.reviewed} reviewed, ${pack.review.unreviewed} unreviewed, ${pack.review.pending} pending.</p>
${section('1. Identification and classification (SS1/23 principle 1) — the inventory entry', inventory)}
${section('2. Governance (principle 2)', governance)}
${section('3. Development, implementation and use (principle 3) — the campaigns', development)}
${section('4. Independent validation (principle 4)', validation)}
${section('5. Risk mitigants (principle 5)', mitigants)}
${section('6. Ongoing monitoring', monitoring)}
${section('7. The Consumer Duty outcomes', outcomes)}
${section('8. The control map', controlMaps)}
${section('Appendix — runs', runs)}
<p class="posture">${escape(pack.posture)}</p>
</main>
</body>
</html>
`;
}
