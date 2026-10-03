import {
	REDACTED,
	type EngineEvent,
	type EvaluationRecord,
	type Principal,
	type RunRecord,
	type StageRecord,
	type WorkflowRun,
	type WorkItem
} from '@craftabot/core';
import { ASSURANCE_TOKENS } from './tokens.js';

/**
 * **The story** (WP161, `112-REAL-ENOUGH-PLAN.md` §5, D12): one run, or one
 * work item through its journey with every handoff followed, folded from the
 * trace into something a person reads top to bottom — what arrived, what the
 * assistant was told, what it thought and asked, what it did and what the
 * world answered, what checked it and what stopped it, who approved and why,
 * what a reader answered and how sure, what a person drew, what was planted,
 * and, last, the truth and the evaluators' marks.
 *
 * **A render, never a store** (D12): nothing a story shows is anywhere but on
 * the bus. If a story cannot show it, a sensor is missing, and the Sensor
 * Inventory's coverage test is where that is caught. **The truth comes last**:
 * the item as it arrived is the case and its records; the answer a bank would
 * have wanted is the ending's, never the opening's. Deterministic over its
 * input — no clock, nothing read from a disk.
 */

/** What a beat in a story is: something seen, thought, checked, asked, done, said or drawn. */
export type StoryBeatKind =
	| 'arrived'
	| 'saw'
	| 'told'
	| 'thought'
	| 'planted'
	| 'checked'
	| 'stopped'
	| 'asked'
	| 'answered'
	| 'did'
	| 'result'
	| 'said'
	| 'read'
	| 'drew'
	| 'marked'
	| 'remembered'
	| 'waited'
	| 'error'
	| 'stage'
	| 'handed-off';

/** One thing that happened, in a sentence, with optional detail beneath it. */
export interface StoryBeat {
	kind: StoryBeatKind;
	text: string;
	/** Further lines, shown beneath the beat. */
	detail?: string[];
	tick?: number;
}

/** A turn of a run, or a stage of a journey, with its beats and — for a bot stage — the bot's own run told inside it. */
export interface StoryChapter {
	heading: string;
	note?: string;
	beats: StoryBeat[];
	/** A bot stage's own run, told inside the stage. */
	children?: StoryChapter[];
}

/** An evaluator's mark on the run, shown at the end. */
export interface StoryMark {
	evaluator: string;
	verdict: string;
	explanation: string;
}

/** A run or a journey told: what it was, its chapters in order, and how it ended — the truth only there. */
export interface Story {
	version: 1;
	subject: { kind: 'run' | 'journey'; id: string; title: string };
	/** What the run was: model, dials, principal, replay, budgets. */
	facts: Array<{ label: string; value: string }>;
	chapters: StoryChapter[];
	ending: {
		outcome: string;
		reason?: string;
		/** `undefined` when the run or journey recorded none; `truthNote` says so. */
		truth?: unknown;
		truthNote: string;
		marks: StoryMark[];
	};
}

/**
 * Every secret, wherever it sits in a string. `core`'s `redactSecrets` matches
 * a whole string exactly, which is right for a structured record and useless for
 * a narrative, where a key is a few characters inside a sentence — so a story is
 * scrubbed by substring, in every string it holds. Defence in depth for hard
 * rule 2: a key never enters an event, and a story is the last place to find one.
 */
export function scrubSecrets<T>(value: T, secrets: readonly string[]): T {
	const targets = secrets.filter((secret) => secret.trim() !== '');
	if (targets.length === 0) return value;
	const scrub = (each: unknown): unknown => {
		if (typeof each === 'string')
			return targets.reduce((text, secret) => text.split(secret).join(REDACTED), each);
		if (Array.isArray(each)) return each.map(scrub);
		if (each !== null && typeof each === 'object')
			return Object.fromEntries(Object.entries(each).map(([key, entry]) => [key, scrub(entry)]));
		return each;
	};
	return scrub(value) as T;
}

// ── Words ──────────────────────────────────────────────────────────────────

const clip = (text: string, limit: number): string =>
	text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;

const json = (value: unknown, limit = 240): string => {
	let text: string | undefined;
	try {
		text = JSON.stringify(value);
	} catch {
		text = undefined;
	}
	return clip(text ?? String(value), limit);
};

const principalWords = (principal: Principal): string =>
	`${principal.name ?? principal.id} (${principal.kind})`;

const seconds = (ms: number): string =>
	ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;

type Payload<T extends EngineEvent['type']> = Extract<EngineEvent, { type: T }>['payload'];

/** The verdict in a sentence — and whether it stopped, paused or merely noted something. */
function verdictWords(verdict: Payload<'guardrail.checked'>['verdict']): {
	text: string;
	notable: boolean;
} {
	if ('pause' in verdict) return { text: `asked a person — ${verdict.reason}`, notable: true };
	if (!verdict.allow)
		return {
			text: `${verdict.disposition === 'stop-run' ? 'stopped the run' : 'blocked the act'} — ${verdict.reason}${verdict.cause ? ` (${verdict.cause})` : ''}`,
			notable: true
		};
	if (verdict.verdictKind === 'redact')
		return { text: 'allowed it, rewriting the words that went out', notable: true };
	if (verdict.verdictKind === 'annotate')
		return {
			text: `allowed it and noted: ${verdict.finding ? `${verdict.finding.label ?? verdict.finding.category}${verdict.finding.confidence ? ` (${verdict.finding.confidence} confidence)` : ''}` : (verdict.note ?? 'a finding')}`,
			notable: true
		};
	if (verdict.mark)
		return {
			text: `allowed it, marking what came back untrusted (${verdict.mark.source})`,
			notable: true
		};
	return { text: 'allowed it', notable: false };
}

// ── One run ────────────────────────────────────────────────────────────────

/** The tick-by-tick chapters of one run's events. */
export function runChapters(events: readonly EngineEvent[]): StoryChapter[] {
	const chapters = new Map<number, StoryChapter>();
	const chapterOf = (tick: number): StoryChapter => {
		let chapter = chapters.get(tick);
		if (!chapter) {
			chapter = { heading: tick === 0 ? 'Before the first turn' : `Turn ${tick}`, beats: [] };
			chapters.set(tick, chapter);
		}
		return chapter;
	};
	// Allowed checks are counted, not listed: a story is for what a person would stop at.
	const allowed = new Map<number, number>();
	for (const event of events) {
		const tick = event.tick;
		const beats = chapterOf(tick).beats;
		const add = (beat: Omit<StoryBeat, 'tick'>): void => void beats.push({ ...beat, tick });
		switch (event.type) {
			case 'sense':
				add({ kind: 'saw', text: `It saw: ${clip(event.payload.observation.text, 600)}` });
				break;
			case 'input.delivered':
				add({
					kind: 'told',
					text: `It was told, from outside the world: “${clip(event.payload.text, 300)}”${event.payload.heard ? '' : ' — nothing here could hear it'}`
				});
				break;
			case 'prompt.composed': {
				const last = event.payload.messages.at(-1);
				add({
					kind: 'told',
					text: `Its prompt: ${event.payload.messages.length} messages, about ${event.payload.estimatedTokens} tokens.`,
					detail: [
						...event.payload.messages.map(
							(message) => `${message.role}: ${message.content.length} characters`
						),
						...(last ? [`The last message it read: “${clip(last.content, 500)}”`] : [])
					]
				});
				break;
			}
			case 'think.completed': {
				const { response, durationMs } = event.payload;
				const facts = [
					`${response.usage.inputTokens} in, ${response.usage.outputTokens} out`,
					response.finishReason,
					...(durationMs !== undefined ? [`${seconds(durationMs)} at the provider`] : [])
				];
				add({ kind: 'thought', text: `It thought (${facts.join('; ')}).` });
				break;
			}
			case 'provider.retried':
				add({
					kind: 'waited',
					text: `The provider asked it to wait (${event.payload.kind}); it waited ${seconds(event.payload.afterMs)} and asked again.`
				});
				break;
			case 'decision':
				add({
					kind: 'thought',
					text: event.payload.call
						? `It decided: ${event.payload.thought ? `“${clip(event.payload.thought, 400)}” — ` : ''}${event.payload.call.name} ${json(event.payload.call.arguments)}${event.payload.source === 'reflex' ? ' (a reflex, not the brain)' : ''}`
						: `It decided to do nothing: “${clip(event.payload.thought, 400)}”`
				});
				break;
			case 'decision.fault':
				add({
					kind: 'planted',
					text: `A fault was planted on that decision: it chose ${json(event.payload.chose)} where the plan had ${json(event.payload.shouldHave)} (${event.payload.field}${event.payload.errorModel ? `, error model ${event.payload.errorModel}` : ''}).`,
					...(event.payload.draw
						? {
								detail: [
									`The roll was ${event.payload.draw.roll.toFixed(4)} against a rate of ${event.payload.draw.rate}.`
								]
							}
						: {})
				});
				break;
			case 'guardrail.checked': {
				const said = verdictWords(event.payload.verdict);
				if (said.notable)
					add({
						kind: 'checked',
						text: `${event.payload.guardrailId} (${event.payload.hook}${event.payload.point?.at ? `, at ${event.payload.point.at}` : ''}) ${said.text}.`
					});
				else allowed.set(tick, (allowed.get(tick) ?? 0) + 1);
				break;
			}
			case 'guardrail.external':
				add({
					kind: 'checked',
					text: `${event.payload.guardrailId} asked a hosted service (${event.payload.service}): ${event.payload.outcome}.`
				});
				break;
			case 'guardrail.tripped':
				add({
					kind: 'stopped',
					text: `Stopped by ${event.payload.guardrailId}: ${event.payload.reason}${event.payload.cause ? ` (${event.payload.cause})` : ''}.`
				});
				break;
			case 'content.marked':
				add({
					kind: 'marked',
					text: `What came back from ${event.payload.source} was marked untrusted by ${event.payload.guardrailId}${event.payload.quarantined ? '; a quarantined reader answered in its place' : ''}.`
				});
				break;
			case 'approval.requested':
				add({
					kind: 'asked',
					text: `A person was asked: ${event.payload.reason} (${event.payload.proposed.name}).`
				});
				break;
			case 'approval.resolved':
				add({
					kind: 'answered',
					text: `${event.payload.by ? principalWords(event.payload.by) : 'The host'} ${event.payload.approved ? 'approved' : 'declined'}${event.payload.override ? ', overruling what the case recommended' : ''}${event.payload.reason ? ` — “${event.payload.reason}”` : ''}.`
				});
				break;
			case 'elevation.requested':
				add({
					kind: 'asked',
					text: `It asked for the scope “${event.payload.scope}”: ${event.payload.reason}`
				});
				break;
			case 'elevation.resolved':
				add({
					kind: 'answered',
					text: `The scope “${event.payload.scope}” was ${event.payload.granted ? 'granted' : 'refused'}${event.payload.by ? ` by ${principalWords(event.payload.by)}` : ''}.`
				});
				break;
			case 'tool.executed':
				add({
					kind: 'did',
					text: `It used the ${event.payload.name} tool ${json(event.payload.arguments)} and read: ${clip(String(event.payload.result), 300)}`,
					detail: [`It took ${seconds(event.payload.durationMs)}.`]
				});
				break;
			case 'action.performed': {
				add({
					kind: 'did',
					text: `It did ${event.payload.name} ${json(event.payload.arguments)}.${event.payload.redacted ? ` The words were rewritten by ${event.payload.redacted.guardrailId} before they went out.` : ''}`,
					...(event.payload.attestation
						? {
								detail: [
									`On behalf of ${event.payload.attestation.principal ? principalWords(event.payload.attestation.principal) : 'no named principal'}.`
								]
							}
						: {})
				});
				add({
					kind: 'result',
					text: `${event.payload.result.ok ? 'The world answered' : 'The world refused'}: ${clip(event.payload.result.narration, 400)}`
				});
				break;
			}
			case 'disclosure.given':
				add({
					kind: 'said',
					text: `The customer was told ${event.payload.id} (words digest ${event.payload.digest.slice(0, 12)}…).`
				});
				break;
			case 'seat.said':
				add({
					kind: 'said',
					text: `${event.payload.persona} ${event.payload.text !== undefined ? `said: “${clip(event.payload.text, 300)}”` : 'acted without a word'}.`,
					detail: [
						`Cue: ${event.payload.cue.kind}${event.payload.cue.detail ? ` (${event.payload.cue.detail})` : ''}; ${event.payload.ruleId ? `rule ${event.payload.ruleId}` : 'the script’s fallback'}; then ${event.payload.then}.`,
						...(event.payload.pressure !== undefined
							? [
									`Pressure ${event.payload.pressure}${event.payload.tags?.length ? `, tags ${event.payload.tags.join(', ')}` : ''}.`
								]
							: [])
					]
				});
				break;
			case 'memory.updated':
				if (event.payload.source === 'untrusted')
					add({
						kind: 'remembered',
						text: 'It wrote to its notebook after reading something marked untrusted; the note carries that label.'
					});
				break;
			case 'error':
				add({
					kind: 'error',
					text: `An error${event.payload.kind ? ` (${event.payload.kind})` : ''}: ${clip(event.payload.message, 300)}`
				});
				break;
			case 'stage.started':
				add({
					kind: 'stage',
					text: `Stage ${event.payload.stageId} began (${event.payload.executor}).`
				});
				break;
			case 'stage.completed':
				add({
					kind: 'stage',
					text: `Stage ${event.payload.stageId} ended ${event.payload.status}; ${event.payload.guards.tripped} of ${event.payload.guards.checked} checks stopped it.`
				});
				break;
			case 'stage.overdue':
				add({
					kind: 'stage',
					text: `Stage ${event.payload.stageId} finished past its deadline: ${event.payload.elapsed} ticks against ${event.payload.deadline}.`
				});
				break;
			case 'reader.answered': {
				const reader = event.payload;
				add({
					kind: 'read',
					text: `${reader.readerId} (${reader.method}, ${reader.model}) answered with confidence ${reader.confidence === null ? 'unknown' : reader.confidence}${reader.gated ? ' — below the gate, so a person or a rule took the stage' : ''}.`,
					detail: Object.entries(reader.answers).map(
						([question, answer]) => `${question}: ${json(answer, 160)}`
					)
				});
				break;
			}
			case 'reviewer.drew':
				add({
					kind: 'drew',
					text: `The modelled person (${event.payload.model}) drew: ${event.payload.path.replace(/-/g, ' ')}.`,
					detail: [
						`Accuracy ${event.payload.rates.accuracy}, automation bias ${event.payload.rates.automationBias}${event.payload.rates.reasonRate !== undefined ? `, reason rate ${event.payload.rates.reasonRate}` : ''}.`,
						`Rolls: ${event.payload.rolls.map((roll) => roll.toFixed(4)).join(', ')}.`
					]
				});
				break;
			default:
				break;
		}
	}
	for (const [tick, count] of allowed)
		if (count > 0)
			chapterOf(tick).beats.push({
				kind: 'checked',
				text: `${count} other check${count === 1 ? '' : 's'} allowed it.`,
				tick
			});
	return [...chapters.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, chapter]) => chapter)
		.filter((chapter) => chapter.beats.length > 0);
}

/** What the run was: from `run.started`, the first think's dials, and the record. */
function runFacts(
	events: readonly EngineEvent[],
	record: Pick<RunRecord, 'agentName' | 'goalCardId' | 'replayedFrom' | 'startedAt'> | undefined
): Array<{ label: string; value: string }> {
	const facts: Array<{ label: string; value: string }> = [];
	const started = events.find((event) => event.type === 'run.started');
	if (record) {
		facts.push(
			{ label: 'Bot', value: record.agentName },
			{ label: 'Goal card', value: record.goalCardId }
		);
	}
	if (started?.type === 'run.started') {
		const p = started.payload;
		facts.push({
			label: 'Model',
			value: `${p.wireModel} through ${p.providerId} (cartridge ${p.cartridgeId || 'none'})`
		});
		const first = events.find((event) => event.type === 'think.started');
		if (first?.type === 'think.started' && first.payload.parameters)
			facts.push({
				label: 'Dials',
				value: `temperature ${first.payload.parameters.temperature}, up to ${first.payload.parameters.maxTokens} tokens a turn`
			});
		facts.push({
			label: 'Budgets',
			value: `${p.budgets.maxTicks} turns, ${p.budgets.maxTokens} tokens, ${seconds(p.budgets.requestTimeoutMs)} a request`
		});
		if (p.principal) facts.push({ label: 'Started by', value: principalWords(p.principal) });
		if (p.strategies)
			facts.push({
				label: 'Context',
				value: `${p.strategies.memory} memory, ${p.strategies.prompt} prompt`
			});
		if (p.egress)
			facts.push({
				label: 'Egress',
				value: `${p.egress.mode}${p.egress.hosts.length ? ` (${p.egress.hosts.join(', ')})` : ''}`
			});
		if (p.gate)
			facts.push({
				label: 'Through the Gate',
				value: `${p.gate.stackId}, ${p.gate.mode}, to ${p.gate.upstream}`
			});
		if (p.goalDial)
			facts.push({ label: 'Dial', value: `${p.goalDial.knob} at ${p.goalDial.value}` });
		if (p.forkedFrom)
			facts.push({
				label: 'Forked',
				value: `from run ${p.forkedFrom.runId} after turn ${p.forkedFrom.tick}`
			});
		if (p.changed)
			facts.push({
				label: 'Build',
				value: `not the validated build (${p.changed.validated.slice(0, 12)}… → ${p.changed.current.slice(0, 12)}…)`
			});
	}
	if (record?.replayedFrom)
		facts.push({
			label: 'Answers',
			value: `replayed from ${record.replayedFrom.cassette} (${record.replayedFrom.model}, recorded ${record.replayedFrom.recorded}) — not a live call`
		});
	else if (started?.type === 'run.started')
		facts.push({ label: 'Answers', value: 'as the provider gave them' });
	return facts;
}

const marksOf = (records: readonly EvaluationRecord[] | undefined): StoryMark[] =>
	(records ?? []).map((record) => ({
		evaluator: record.evaluatorId,
		verdict: record.result.verdict ?? record.result.label ?? 'no verdict',
		explanation: record.result.explanation
	}));

/** What `storyForRun` folds: the run's events, its record when the host has one, and its evaluations. */
export interface RunStoryInput {
	events: readonly EngineEvent[];
	record?:
		Pick<RunRecord, 'id' | 'agentName' | 'goalCardId' | 'replayedFrom' | 'startedAt'> | undefined;
	evaluations?: readonly EvaluationRecord[] | undefined;
}

/** One run as a story. */
export function storyForRun(input: RunStoryInput): Story {
	const finished = input.events.find((event) => event.type === 'run.finished');
	const runId = input.record?.id ?? input.events[0]?.runId ?? 'unknown';
	const end = finished?.type === 'run.finished' ? finished.payload : undefined;
	return {
		version: 1,
		subject: {
			kind: 'run',
			id: runId,
			title: input.record
				? `${input.record.agentName} on ${input.record.goalCardId}`
				: `Run ${runId}`
		},
		facts: runFacts(input.events, input.record),
		chapters: runChapters(input.events),
		ending: {
			outcome: end?.outcome ?? 'unfinished',
			...(end?.reason !== undefined ? { reason: end.reason } : {}),
			...(end?.truth !== undefined ? { truth: end.truth } : {}),
			truthNote:
				end?.truth !== undefined
					? 'The world’s own account of the case, recorded once at the end and shown only here.'
					: 'This run recorded no truth: its world holds no hidden state.',
			marks: marksOf(input.evaluations)
		}
	};
}

// ── One work item through its journey ──────────────────────────────────────

/** An agent run a journey made, by id: its events, and its record when the host has one. */
export interface JourneyAgentRun {
	events: readonly EngineEvent[];
	record?: RunStoryInput['record'];
}

/** What `storyForJourney` folds: the journey's run and item, the bot stages' runs, kept values, and the handoffs followed. */
export interface JourneyStoryInput {
	run: WorkflowRun;
	item?: WorkItem | undefined;
	/** The bot stages' runs, by run id. */
	agentRuns?: ReadonlyMap<string, JourneyAgentRun> | undefined;
	/** A stage value kept whole by digest (`--keep-values`), for a value the record holds as its digest alone. */
	values?: ((digest: string) => unknown) | undefined;
	/** The handoffs followed, each as its own journey, in order. */
	followed?: readonly JourneyStoryInput[] | undefined;
	evaluations?: readonly EvaluationRecord[] | undefined;
}

const executorWords = (stage: StageRecord): string => {
	const executor = stage.executor;
	switch (executor.kind) {
		case 'rule':
			return `a rule (${executor.rule})`;
		case 'agent':
			return `the bot, until “${clip(executor.until, 80)}”${executor.maxTicks ? `, within ${executor.maxTicks} turns` : ''}`;
		case 'human':
			return `a person, asked “${clip(executor.prompt, 120)}” (${executor.options.join(' / ')})`;
		case 'line':
			return `the ${executor.lineId} service, ${executor.operation}`;
		case 'reader':
			return `the reader ${executor.readerId}${executor.gate ? `, gated at ${executor.gate.threshold}` : ''}`;
	}
};

function stageChapter(
	stage: StageRecord,
	events: readonly EngineEvent[],
	input: JourneyStoryInput
): StoryChapter {
	const beats: StoryBeat[] = [];
	const value = (v: StageRecord['input']): string => {
		if (v.value !== undefined) return json(v.value, 400);
		const kept = input.values?.(v.digest);
		return kept !== undefined
			? `${json(kept, 400)} (kept whole, digest ${v.digest.slice(0, 12)}…)`
			: `over the record’s cap — digest ${v.digest.slice(0, 12)}…`;
	};
	beats.push({ kind: 'told', text: `Given: ${value(stage.input)}` });
	for (const verdict of (stage.guards.verdicts ?? []).filter((each) => each.point === 'stage-in'))
		beats.push({
			kind: 'checked',
			text: `On the way in, ${verdict.guardrailId} ${verdict.verdict}${verdict.reason ? ` — ${verdict.reason}` : ''}.`
		});
	if (stage.reader)
		beats.push({
			kind: 'read',
			text: `${stage.reader.readerId} (${stage.reader.method}, ${stage.reader.model}) answered with confidence ${stage.reader.confidence === null ? 'unknown' : stage.reader.confidence}${stage.reader.gated ? ' — gated' : ''}.`,
			detail: Object.entries(stage.reader.answers).map(
				([question, answer]) => `${question}: ${json(answer, 160)}`
			)
		});
	for (const event of events)
		if (event.type === 'reviewer.drew' && event.payload.stageId === stage.stageId)
			beats.push({
				kind: 'drew',
				text: `The modelled person (${event.payload.model}) drew: ${event.payload.path.replace(/-/g, ' ')}.`,
				detail: [
					`Accuracy ${event.payload.rates.accuracy}, automation bias ${event.payload.rates.automationBias}.`,
					`Rolls: ${event.payload.rolls.map((roll) => roll.toFixed(4)).join(', ')}.`
				]
			});
	if (stage.by)
		beats.push({
			kind: 'answered',
			text: `${stage.by.model} answered ${stage.by.answer}${stage.by.recommended ? ` (the case recommended ${stage.by.recommended}${stage.by.followed ? ', and it followed' : ''})` : ''}; it was ${stage.by.correct ? 'right' : 'wrong'}, and took ${stage.by.seconds} s.${stage.by.reason ? ` Reason: “${stage.by.reason}”` : ''}`
		});
	else if (stage.approval)
		beats.push({
			kind: 'answered',
			text: `${stage.approval.by ? principalWords(stage.approval.by) : 'The host'} chose ${stage.approval.decision}${stage.approval.override ? ', overruling the recommendation' : ''}${stage.approval.reason ? ` — “${stage.approval.reason}”` : ''}.`
		});
	for (const verdict of (stage.guards.verdicts ?? []).filter((each) => each.point === 'stage-out'))
		beats.push({
			kind: 'checked',
			text: `On the way out, ${verdict.guardrailId} ${verdict.verdict}${verdict.reason ? ` — ${verdict.reason}` : ''}.`
		});
	if (stage.guards.tripped.length > 0)
		beats.push({
			kind: 'stopped',
			text: `Stopped by ${stage.guards.tripped.map((trip) => trip.guardrailId).join(', ')}.`
		});
	beats.push({ kind: 'result', text: `Produced: ${value(stage.output)}` });
	if (stage.overdue)
		beats.push({
			kind: 'stage',
			text: `Finished past its deadline: ${stage.overdue.elapsed} ticks against ${stage.overdue.deadline}.`
		});
	if (stage.finding) beats.push({ kind: 'error', text: stage.finding });
	const nested = stage.runId ? input.agentRuns?.get(stage.runId) : undefined;
	return {
		heading: `Stage ${stage.stageId} — ${executorWords(stage)}`,
		note: `${stage.status}; ticks ${stage.startedTick}–${stage.endedTick}`,
		beats,
		...(nested ? { children: runChapters(nested.events) } : {})
	};
}

/** One work item through its journey, handoffs followed. */
export function storyForJourney(input: JourneyStoryInput): Story {
	const { run } = input;
	const chapters: StoryChapter[] = [];
	if (input.item) {
		// What arrived — never its truth, which is the ending's.
		const { truth: _truth, ...arrived } = input.item as WorkItem & { truth?: unknown };
		void _truth;
		chapters.push({
			heading: 'What arrived',
			beats: [
				{
					kind: 'arrived',
					text: `A ${input.item.kind} for ${input.item.customerId}: ${json(arrived, 600)}`
				}
			]
		});
	}
	for (const stage of run.stages) chapters.push(stageChapter(stage, run.events, input));
	if (run.handoff)
		chapters.push({
			heading: `Handed off to ${run.handoff.to}`,
			beats: [
				{
					kind: 'handed-off',
					text: `The journey ended by handing item ${run.handoff.itemId} to ${run.handoff.to}${run.handoff.kind ? ` as an ${run.handoff.kind}` : ''}.`
				}
			]
		});
	for (const next of input.followed ?? []) {
		const told = storyForJourney(next);
		chapters.push({
			heading: `Then, at ${next.run.workflowId}`,
			beats: [],
			children: told.chapters
		});
	}
	const last = [input, ...(input.followed ?? [])].at(-1) as JourneyStoryInput;
	const truth = (input.item as (WorkItem & { truth?: unknown }) | undefined)?.truth;
	const nestedTruth = [...run.stages]
		.reverse()
		.map((stage) => (stage.runId ? input.agentRuns?.get(stage.runId) : undefined))
		.flatMap((agent) =>
			agent ? agent.events.filter((event) => event.type === 'run.finished') : []
		)
		.map((event) => (event.type === 'run.finished' ? event.payload.truth : undefined))
		.find((value) => value !== undefined);
	const shown = nestedTruth ?? truth;
	return {
		version: 1,
		subject: {
			kind: 'journey',
			id: run.id,
			title: `${run.workflowId}, item ${run.itemId}`
		},
		facts: [
			{ label: 'Journey', value: run.workflowId },
			{
				label: 'Configuration',
				value: run.config.autonomy
					? `autonomy level ${run.config.autonomy.level}${run.config.autonomy.enforce ? ', ceilings enforced' : ''}`
					: 'the journey’s defaults'
			},
			...(run.config.reviewer ? [{ label: 'Reviewer', value: run.config.reviewer }] : []),
			...(run.config.stack ? [{ label: 'Stack', value: run.config.stack }] : []),
			...(run.config.context
				? [{ label: 'Context rung', value: JSON.stringify(run.config.context) }]
				: []),
			{
				label: 'Stages',
				value: `${run.stages.length}, in ${run.runIds.length} bot run${run.runIds.length === 1 ? '' : 's'}`
			}
		],
		chapters,
		ending: {
			outcome: last.run.outcome,
			...(shown !== undefined ? { truth: shown } : {}),
			truthNote:
				shown !== undefined
					? 'What the case really was, recorded by the world and shown only here.'
					: 'This journey recorded no truth: it was run without its world’s hidden state.',
			marks: marksOf(input.evaluations)
		}
	};
}

// ── Renderings ─────────────────────────────────────────────────────────────

const ICON: Record<StoryBeatKind, string> = {
	arrived: 'arrived',
	saw: 'saw',
	told: 'told',
	thought: 'thought',
	planted: 'planted',
	checked: 'checked',
	stopped: 'stopped',
	asked: 'asked',
	answered: 'answered',
	did: 'did',
	result: 'result',
	said: 'said',
	read: 'read',
	drew: 'drew',
	marked: 'marked',
	remembered: 'remembered',
	waited: 'waited',
	error: 'error',
	stage: 'stage',
	'handed-off': 'handed off'
};

function chapterMarkdown(chapter: StoryChapter, depth: number): string[] {
	const lines = [`${'#'.repeat(Math.min(depth, 6))} ${chapter.heading}`, ''];
	if (chapter.note) lines.push(`*${chapter.note}*`, '');
	for (const beat of chapter.beats) {
		lines.push(`- **${ICON[beat.kind]}** — ${beat.text}`);
		for (const detail of beat.detail ?? []) lines.push(`  - ${detail}`);
	}
	if (chapter.beats.length > 0) lines.push('');
	for (const child of chapter.children ?? []) lines.push(...chapterMarkdown(child, depth + 1));
	return lines;
}

/** The story as markdown a person reads top to bottom. */
export function renderStoryMarkdown(story: Story): string {
	const lines = [
		`# ${story.subject.title}`,
		'',
		`*${story.subject.kind === 'run' ? 'Run' : 'Journey'} \`${story.subject.id}\`*`,
		''
	];
	for (const fact of story.facts) lines.push(`- **${fact.label}:** ${fact.value}`);
	lines.push('');
	for (const chapter of story.chapters) lines.push(...chapterMarkdown(chapter, 2));
	lines.push(
		'## How it ended',
		'',
		`- **Outcome:** ${story.ending.outcome}${story.ending.reason ? ` — ${story.ending.reason}` : ''}`
	);
	lines.push(`- **The truth:** ${story.ending.truthNote}`);
	if (story.ending.truth !== undefined)
		lines.push('', '```json', JSON.stringify(story.ending.truth, null, 2), '```');
	if (story.ending.marks.length > 0) {
		lines.push('', '### The evaluators', '');
		for (const mark of story.ending.marks)
			lines.push(`- **${mark.evaluator}:** ${mark.verdict} — ${mark.explanation}`);
	}
	return `${lines.join('\n')}\n`;
}

const escape = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chapterHtml(chapter: StoryChapter, depth: number): string {
	const level = Math.min(depth, 6);
	const beats = chapter.beats
		.map(
			(beat) =>
				`<li class="beat ${beat.kind}"><span class="kind">${escape(ICON[beat.kind])}</span> ${escape(beat.text)}${beat.detail && beat.detail.length > 0 ? `<ul class="detail">${beat.detail.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>` : ''}</li>`
		)
		.join('');
	return `<section class="chapter"><h${level}>${escape(chapter.heading)}</h${level}>${chapter.note ? `<p class="note">${escape(chapter.note)}</p>` : ''}${beats ? `<ul class="beats">${beats}</ul>` : ''}${(chapter.children ?? []).map((child) => chapterHtml(child, depth + 1)).join('')}</section>`;
}

/** The story as one self-contained HTML file: tokens inlined, no script, printable. */
export function renderStoryHtml(story: Story): string {
	const css = `:root{${Object.entries(ASSURANCE_TOKENS)
		.map(([name, value]) => `--cab-${name}:${value}`)
		.join(';')}}
body{margin:0;padding:2rem;background:var(--cab-cream);color:var(--cab-ink);font:16px/1.5 system-ui,sans-serif;max-width:60rem}
h1,h2,h3,h4{line-height:1.2}h2{margin-top:2rem;border-bottom:2px solid var(--cab-ink);padding-bottom:.25rem}
.note,.meta{color:var(--cab-ink-muted)}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem;background:var(--cab-paper);padding:.75rem 1rem;border:2px solid var(--cab-ink)}
dl.facts dt{font-weight:600}dl.facts dd{margin:0}
ul.beats{list-style:none;padding-left:0}ul.beats>li{padding:.25rem 0;border-bottom:1px solid var(--cab-paper)}
.kind{display:inline-block;min-width:5.5rem;font-size:.8em;text-transform:uppercase;letter-spacing:.06em;color:var(--cab-blue-text);font-weight:700}
.beat.stopped .kind,.beat.error .kind,.beat.planted .kind{color:var(--cab-red-text)}
.beat.answered .kind,.beat.read .kind,.beat.drew .kind{color:var(--cab-green-text)}
ul.detail{color:var(--cab-ink-muted);font-size:.92em;margin:.25rem 0 0 5.5rem}
.chapter .chapter{margin-left:1.25rem;border-left:3px solid var(--cab-ink-muted);padding-left:1rem}
pre{background:var(--cab-paper);padding:.75rem;overflow:auto;border:1px solid var(--cab-ink-muted)}
@media print{body{background:#fff;padding:0}}`;
	const ending = story.ending;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(story.subject.title)} — a story</title>
<style>${css}</style>
</head>
<body>
<main>
<h1>${escape(story.subject.title)}</h1>
<p class="meta">${story.subject.kind === 'run' ? 'Run' : 'Journey'} <code>${escape(story.subject.id)}</code></p>
<dl class="facts">${story.facts.map((fact) => `<dt>${escape(fact.label)}</dt><dd>${escape(fact.value)}</dd>`).join('')}</dl>
${story.chapters.map((chapter) => chapterHtml(chapter, 2)).join('\n')}
<section class="chapter"><h2>How it ended</h2>
<p><strong>Outcome:</strong> ${escape(ending.outcome)}${ending.reason ? ` — ${escape(ending.reason)}` : ''}</p>
<p><strong>The truth:</strong> ${escape(ending.truthNote)}</p>
${ending.truth !== undefined ? `<pre>${escape(JSON.stringify(ending.truth, null, 2))}</pre>` : ''}
${ending.marks.length > 0 ? `<h3>The evaluators</h3><ul>${ending.marks.map((mark) => `<li><strong>${escape(mark.evaluator)}:</strong> ${escape(mark.verdict)} — ${escape(mark.explanation)}</li>`).join('')}</ul>` : ''}
</section>
</main>
</body>
</html>
`;
}
