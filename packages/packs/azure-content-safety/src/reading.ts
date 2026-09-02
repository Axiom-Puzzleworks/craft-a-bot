import type { FindingConfidence, ScreenFinding, ScreenReading } from '@craftabot/core';
import { z } from 'zod';

/**
 * The two Azure AI Content Safety envelopes this pack reads (`30-…` §4),
 * in the shell's vocabulary with the vendor's words kept:
 *
 * - `text:shieldPrompt` → `{ userPromptAnalysis: { attackDetected }, documentsAnalysis: [{ attackDetected }] }`
 * - `text:analyze`      → `{ categoriesAnalysis: [{ category, severity }] }` with severity 0 | 2 | 4 | 6
 *
 * Findings are named for the vendor's own labels — `prompt-shield`,
 * `prompt-shield:documents`, `Hate`, `SelfHarm`, `Sexual`, `Violence` — so a
 * trace reads in Azure's terms, while the categories the shell dials on
 * are `injection` and `harmful`.
 */

export const shieldPromptResponseSchema = z.object({
	userPromptAnalysis: z.object({ attackDetected: z.boolean() }).optional(),
	documentsAnalysis: z.array(z.object({ attackDetected: z.boolean() })).optional()
});
export type ShieldPromptResponse = z.infer<typeof shieldPromptResponseSchema>;

export const HARM_CATEGORIES = ['Hate', 'SelfHarm', 'Sexual', 'Violence'] as const;
export type HarmCategory = (typeof HARM_CATEGORIES)[number];

export const analyzeResponseSchema = z.object({
	categoriesAnalysis: z.array(
		z.object({ category: z.enum(HARM_CATEGORIES), severity: z.number().int().min(0).max(7) })
	)
});
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

/** Azure's four-level output: 0 clean, 2 low, 4 medium, 6 high (the eight-level output lands in the same bands). */
export function confidenceForSeverity(severity: number): FindingConfidence | undefined {
	if (severity <= 0) return undefined;
	if (severity <= 2) return 'low';
	if (severity <= 4) return 'medium';
	return 'high';
}

export function shieldFindings(shield: ShieldPromptResponse): ScreenFinding[] {
	const findings: ScreenFinding[] = [];
	if (shield.userPromptAnalysis) {
		findings.push({
			category: 'injection',
			vendorLabel: 'prompt-shield',
			ran: true,
			matched: shield.userPromptAnalysis.attackDetected
		});
	}
	if (shield.documentsAnalysis && shield.documentsAnalysis.length > 0) {
		findings.push({
			category: 'injection',
			vendorLabel: 'prompt-shield:documents',
			ran: true,
			matched: shield.documentsAnalysis.some((document) => document.attackDetected)
		});
	}
	return findings;
}

export function analyzeFindings(analysis: AnalyzeResponse | undefined): ScreenFinding[] {
	return HARM_CATEGORIES.map((category) => {
		const row = analysis?.categoriesAnalysis.find((entry) => entry.category === category);
		if (!row) return { category: 'harmful', vendorLabel: category, ran: false, matched: false };
		const confidence = confidenceForSeverity(row.severity);
		return {
			category: 'harmful',
			vendorLabel: category,
			ran: true,
			matched: confidence !== undefined,
			...(confidence !== undefined
				? { confidence, vendorConfidence: `severity:${row.severity}` }
				: {})
		};
	});
}

/** Both envelopes, or the shield alone when harm analysis was not asked for, as one reading. */
export function toScreenReading(
	shield: ShieldPromptResponse,
	analysis: AnalyzeResponse | undefined,
	options: { analyzeAsked: boolean }
): ScreenReading {
	const findings = [...shieldFindings(shield), ...analyzeFindings(analysis)];
	return {
		// Harm analysis that was asked for and did not come back is a partial reading, never "clean".
		outcome: options.analyzeAsked && analysis === undefined ? 'partial' : 'ok',
		matched: findings.some((finding) => finding.matched),
		findings
	};
}
