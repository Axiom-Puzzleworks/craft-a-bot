import type {
	BrickConfigProblem,
	BrickKindDefinition,
	BrickValidationContext,
	Evaluator,
	Guardrail,
	GuardrailContext
} from '@craftabot/core';
import { assertionEvaluator, evaluationInputFor, inputReadableBy } from '@craftabot/governance';
import { z } from 'zod';

/**
 * **The Monitor Judge** (`31-EVALUATORS.md` §4.3, WP43 stage C): an
 * evaluator run in-run, at `post-act`, over the trace so far — `note`-only,
 * so its verdicts are `guardrail.checked` rows and nothing new is on the
 * bus. A deterministic evaluator (an assertion card) runs live; a `model`
 * or `hosted` one runs its offline stand-in, because a brick has no
 * provider to hand it — the live in-run judge is WP48's (`31-…` §8 D-d).
 */

export const MONITOR_JUDGE_ID = 'workshop/monitor-judge';

export const monitorJudgeConfigSchema = z.object({
	/** A registered evaluator's id, or an assertion card's. `''` until one is chosen. */
	evaluatorId: z.string().default(''),
	/** The evaluator's own config, as JSON text (the Guard Brick's discipline, `29-…` §8 D-h). */
	evaluatorConfig: z.string().default('{}'),
	/** Judge every tick, or only every N-th — a card is cheap, a judge is not. */
	everyTicks: z.number().int().positive().default(1)
});
export type MonitorJudgeConfig = z.infer<typeof monitorJudgeConfigSchema>;

export const monitorJudgeDefaults: MonitorJudgeConfig = {
	evaluatorId: '',
	evaluatorConfig: '{}',
	everyTicks: 1
};

function parseConfig(text: string): { ok: true; config: unknown } | { ok: false } {
	try {
		return { ok: true, config: JSON.parse(text) as unknown };
	} catch {
		return { ok: false };
	}
}

function validate(config: MonitorJudgeConfig, ctx: BrickValidationContext): BrickConfigProblem[] {
	const problems: BrickConfigProblem[] = [];
	if (config.evaluatorId === '') {
		problems.push({
			code: 'judge-no-evaluator',
			severity: 'warning',
			message: 'The Monitor Judge is fitted but no evaluator is chosen — it will note nothing.'
		});
		return problems;
	}
	if (!(ctx.hasEvaluator?.(config.evaluatorId) ?? false)) {
		problems.push({
			code: 'unknown-evaluator',
			severity: 'warning',
			message: `The Monitor Judge names "${config.evaluatorId}", which no installed pack ships — it will note nothing.`,
			details: { evaluatorId: config.evaluatorId }
		});
	}
	if (!parseConfig(config.evaluatorConfig).ok) {
		problems.push({
			code: 'judge-config-not-json',
			severity: 'warning',
			message: "The evaluator's settings are not valid JSON — the judge will note nothing."
		});
	}
	return problems;
}

/** The judge's one guardrail: at `post-act`, evaluate the trace so far and note the verdict. */
export function monitorJudgeGuardrail(
	evaluator: Evaluator,
	config: unknown,
	everyTicks: number
): Guardrail {
	const runner: Pick<Evaluator, 'evaluate'> =
		evaluator.kind === 'deterministic' ? evaluator : (evaluator.createOffline?.() ?? evaluator);
	return {
		id: `${MONITOR_JUDGE_ID}:${evaluator.id}`,
		name: `Monitor Judge (${evaluator.name})`,
		description: `Runs ${evaluator.id} over the trace so far after each action and notes what it says.`,
		hooks: ['post-act'],
		async check(ctx: GuardrailContext) {
			if (ctx.tick % everyTicks !== 0) return { allow: true, note: 'judge: not this tick' };
			const input = evaluationInputFor(ctx.history);
			try {
				const result = await runner.evaluate(inputReadableBy(evaluator, input), {
					config,
					fetch: () => Promise.reject(new Error('the Monitor Judge does not call out')),
					getCredential: () => undefined
				});
				const verdict = result.verdict ?? 'no verdict';
				return { allow: true, note: `judge: ${verdict} — ${result.explanation}` };
			} catch (error) {
				return {
					allow: true,
					note: `judge: could not evaluate — ${error instanceof Error ? error.message : String(error)}`
				};
			}
		}
	};
}

export const monitorJudgeBrickKind: BrickKindDefinition<MonitorJudgeConfig> = {
	id: MONITOR_JUDGE_ID,
	slot: 'safety',

	name: 'Monitor Judge',
	description:
		'Watches your robot with a judge of your choosing and writes down what the judge thinks after each move. It never stops anything.',
	realName: 'In-run evaluator (note-only)',
	realExplanation:
		'Runs a registered evaluator — an assertion card, or a judge in its offline form — over the trace so far after every action, as a post-act guardrail that only ever notes. The notes are ordinary guardrail.checked rows, so the trace shows the judging without any new event.',

	configSchema: monitorJudgeConfigSchema,
	configVersion: 1,
	defaults: monitorJudgeDefaults,
	audience: 'workshop',
	controlHints: {
		evaluatorId: { control: 'text', label: 'Evaluator id' },
		evaluatorConfig: { control: 'text', label: "Evaluator's settings (JSON)" },
		everyTicks: {
			control: 'dial',
			label: 'Judge every',
			options: [
				{ value: 1, label: 'Every turn' },
				{ value: 3, label: 'Every third turn' },
				{ value: 10, label: 'Every tenth turn' }
			]
		}
	},
	describeFitted: (config) =>
		config.evaluatorId === ''
			? 'a monitor judge with nobody on the bench'
			: `a monitor judge asking ${config.evaluatorId} after every ${config.everyTicks === 1 ? 'move' : `${config.everyTicks} moves`}`,
	validateConfig: validate,
	createRuntime: (config, ctx) => {
		const registered = ctx.getEvaluator?.(config.evaluatorId);
		const card = registered ? undefined : ctx.getAssertionCard?.(config.evaluatorId);
		const evaluator = registered ?? (card ? assertionEvaluator(card) : undefined);
		const parsed = parseConfig(config.evaluatorConfig);
		if (!evaluator || !parsed.ok) return {};
		return {
			contributeGuardrails: () => [
				monitorJudgeGuardrail(evaluator, parsed.config, config.everyTicks)
			]
		};
	}
};
