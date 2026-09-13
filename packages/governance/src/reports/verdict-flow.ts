import type { EngineEvent, PointKind } from '@craftabot/core';

/**
 * **The verdict flow** (WP101, `88-STUDIO.md` §4; `83-…` §6.3): every
 * `guardrail.checked` on a trace, in order, as one row — the point, the
 * component, the verdict, the cause, the latency of the hosted call that
 * preceded it, the finding's category, the redacted text where there was
 * one. The Studio's test bench draws it as it happens and lights each
 * verdict on its point; a second stack's flow sits beside it over the same
 * run. Pure over the events; the sequence of rows *is* the sequence of
 * `guardrail.checked` events, which is what the test holds.
 */
export interface VerdictFlowRow {
	/** The event's index on the trace. */
	seq: number;
	tick: number;
	guardrailId: string;
	hook: string;
	/** The point the component decided at (WP94); absent on a verdict a rule wrote without one. */
	point?: { kind: PointKind; at?: string };
	componentId?: string;
	policyCardId?: string;
	/** `allow`, `annotate`, `redact`, `pause`, `block-action` or `stop-run`. */
	verdict: 'allow' | 'annotate' | 'redact' | 'pause' | 'block-action' | 'stop-run';
	/** The denial's reason, or the allow's note. */
	reason?: string;
	/** `could-not-check` when a hosted guard failed closed. */
	cause?: string;
	/** The hosted call's latency, from the `guardrail.external` written just before. */
	latencyMs?: number;
	findingCategory?: string;
	redactedText?: string;
}

/** The flow (§4): one row per `guardrail.checked`, in trace order, with what the events beside it say. */
export function verdictFlow(events: readonly EngineEvent[]): VerdictFlowRow[] {
	const rows: VerdictFlowRow[] = [];
	let pendingLatency: { guardrailId: string; hook: string; latencyMs: number } | undefined;
	events.forEach((event, index) => {
		if (event.type === 'guardrail.external') {
			pendingLatency = {
				guardrailId: event.payload.guardrailId,
				hook: event.payload.hook,
				latencyMs: event.payload.latencyMs
			};
			return;
		}
		if (event.type !== 'guardrail.checked') return;
		const { guardrailId, hook, componentId, point, policyCardId } = event.payload;
		const verdict = event.payload.verdict as {
			allow?: boolean;
			pause?: boolean;
			note?: string;
			reason?: string;
			verdictKind?: 'redact' | 'annotate';
			finding?: { category: string };
			redactedText?: string;
			disposition?: 'block-action' | 'stop-run';
			cause?: string;
		};
		const latency =
			pendingLatency && pendingLatency.guardrailId === guardrailId && pendingLatency.hook === hook
				? pendingLatency.latencyMs
				: undefined;
		pendingLatency = undefined;
		const kind: VerdictFlowRow['verdict'] =
			verdict.allow === true
				? (verdict.verdictKind ?? 'allow')
				: verdict.pause === true
					? 'pause'
					: (verdict.disposition ?? 'block-action');
		const reason = verdict.allow === true ? verdict.note : verdict.reason;
		rows.push({
			seq: index,
			tick: event.tick,
			guardrailId,
			hook,
			...(point !== undefined
				? {
						point: {
							kind: point.kind as PointKind,
							...(point.at !== undefined ? { at: point.at } : {})
						}
					}
				: {}),
			...(componentId !== undefined ? { componentId } : {}),
			...(policyCardId !== undefined ? { policyCardId } : {}),
			verdict: kind,
			...(reason !== undefined ? { reason } : {}),
			...(verdict.cause !== undefined ? { cause: verdict.cause } : {}),
			...(latency !== undefined ? { latencyMs: latency } : {}),
			...(verdict.finding?.category !== undefined
				? { findingCategory: verdict.finding.category }
				: {}),
			...(verdict.redactedText !== undefined ? { redactedText: verdict.redactedText } : {})
		});
	});
	return rows;
}

/** The flow's shape alone — guardrail, hook, verdict per row — for holding two flows, or a flow and its trace, equal. */
export function verdictFlowSignature(rows: readonly VerdictFlowRow[]): string[] {
	return rows.map((row) => `${row.guardrailId}@${row.hook}:${row.verdict}`);
}
