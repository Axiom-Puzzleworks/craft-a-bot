import { selectCells, type CampaignReport } from './campaign.js';
import { failureMessage } from './campaign-junit.js';

/**
 * A campaign report as SARIF 2.1.0 (`28-CAMPAIGNS.md` §4.5): one run, one
 * rule per gate, one result per **failed** gate — what GitHub code scanning
 * and enterprise security tooling ingest. Every result names the campaign
 * file as its location and carries the failing cells' run ids and the
 * scenario's threat tags in `properties`, so a finding in a security tab
 * points at traces and at the OWASP vocabulary it was tested under.
 * Validated in the suite against the vendored official schema.
 */
export interface SarifOptions {
	/** The campaign file the results point at, as a relative URI. */
	campaignUri?: string;
	toolVersion?: string;
}

export function renderSarif(report: CampaignReport, options: SarifOptions = {}): SarifLog {
	const uri = options.campaignUri ?? `campaigns/${report.campaignId}.json`;
	const rules = report.gates.map((gate) => ({
		id: gate.id,
		name: gate.kind,
		shortDescription: { text: gate.required },
		fullDescription: {
			text: `${gate.kind} gate over ${describeWhere(gate.where)}: ${gate.required}`
		},
		defaultConfiguration: { level: 'error' as const },
		properties: { kind: gate.kind, ...(gate.where ? { where: gate.where } : {}) }
	}));

	const results = report.gates
		.map((gate, index) => ({ gate, index }))
		.filter(({ gate }) => !gate.passed)
		.map(({ gate, index }) => {
			const cells = selectCells(gate.where, report.cells);
			return {
				ruleId: gate.id,
				ruleIndex: index,
				level: 'error' as const,
				message: { text: `Gate '${gate.id}' failed: ${failureMessage(gate)}.` },
				locations: [{ physicalLocation: { artifactLocation: { uri, uriBaseId: 'REPO' } } }],
				properties: {
					cells: cells.length,
					runIds: cells.map((cell) => cell.runId).filter((id): id is string => id !== undefined),
					tags: [...new Set(cells.flatMap((cell) => cell.tags))],
					observed: gate.observed ?? null,
					required: gate.required
				}
			};
		});

	return {
		$schema:
			'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
		version: '2.1.0',
		runs: [
			{
				tool: {
					driver: {
						name: 'Craft A Bot campaigns',
						version: options.toolVersion ?? '0.0.1',
						informationUri: 'https://github.com/Axiom-Puzzleworks/craft-a-bot',
						rules
					}
				},
				invocations: [{ executionSuccessful: true, endTimeUtc: report.createdAt }],
				originalUriBaseIds: { REPO: { description: { text: 'The repository root.' } } },
				results,
				properties: {
					campaignId: report.campaignId,
					reportId: report.id,
					passed: report.passed,
					cells: report.cells.length
				}
			}
		]
	};
}

function describeWhere(where: CampaignReport['gates'][number]['where']): string {
	if (!where) return 'every cell';
	return (
		Object.entries(where)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => `${key}=${value}`)
			.join(' ') || 'every cell'
	);
}

/** The subset of SARIF 2.1.0 this renderer emits — typed so a consumer can read it without a cast. */
export interface SarifLog {
	$schema: string;
	version: '2.1.0';
	runs: Array<{
		tool: {
			driver: {
				name: string;
				version: string;
				informationUri: string;
				rules: Array<{
					id: string;
					name: string;
					shortDescription: { text: string };
					fullDescription: { text: string };
					defaultConfiguration: { level: 'error' };
					properties: Record<string, unknown>;
				}>;
			};
		};
		invocations: Array<{ executionSuccessful: boolean; endTimeUtc: string }>;
		originalUriBaseIds: Record<string, { description: { text: string } }>;
		results: Array<{
			ruleId: string;
			ruleIndex: number;
			level: 'error';
			message: { text: string };
			locations: Array<{
				physicalLocation: { artifactLocation: { uri: string; uriBaseId: string } };
			}>;
			properties: Record<string, unknown>;
		}>;
		properties: Record<string, unknown>;
	}>;
}
