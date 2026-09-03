import type {
	EngineEvent,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	Observation,
	PolicyCard,
	PolicyRule,
	PredicateExpr,
	ProposedStep,
	WorldState
} from '@craftabot/core';

/**
 * **The policy-card compiler** (`14-…` §4.6, WP22): "a `PolicyCard` is data …
 * compiled … into ordinary guardrails." One `Guardrail` per rule, so a fired
 * rule points at exactly the sentence that fired it in the trace, and the
 * chain-runner's "first non-allow wins" behaviour (`08-…` §2) applies rule by
 * rule within a card exactly as it does between bricks.
 *
 * The `Guardrail` interface does not change shape: a compiled rule is
 * indistinguishable from a hand-written one except for carrying
 * `policyCardId`, which is how `@craftabot/core` knows to copy it onto the
 * trace (`types/guardrail.ts`).
 */

/** What a `PredicateExpr` evaluates against — exactly what `GuardrailContext` already carries. */
export interface PredicateEvalContext {
	proposed?: ProposedStep | undefined;
	usage: { ticks: number; inputTokens: number; outputTokens: number };
	/** The rest of what a v2 leaf reads (WP45, `33-…` §4.2) — all optional, all straight off `GuardrailContext`. */
	hook?: GuardrailHook;
	worldState?: Readonly<WorldState>;
	history?: ReadonlyArray<EngineEvent>;
	observation?: Observation;
	world?: GuardrailContext['world'];
}

/** The evaluation context a full guardrail context yields — every field a leaf can read. */
export function predicateContextFor(ctx: GuardrailContext): PredicateEvalContext {
	return {
		proposed: ctx.proposed,
		usage: ctx.usage,
		hook: ctx.hook,
		worldState: ctx.worldState,
		history: ctx.history,
		...(ctx.observation !== undefined ? { observation: ctx.observation } : {}),
		...(ctx.world !== undefined ? { world: ctx.world } : {})
	};
}

const patterns = new Map<string, RegExp>();
function patternFor(source: string): RegExp {
	let compiled = patterns.get(source);
	if (!compiled) {
		compiled = new RegExp(source);
		patterns.set(source, compiled);
	}
	return compiled;
}

function eventName(event: EngineEvent): string | undefined {
	const payload = event.payload as { name?: unknown } | undefined;
	return typeof payload?.name === 'string' ? payload.name : undefined;
}

/** A single-level-or-dotted lookup into a call's arguments, without assuming they are an object. */
function getPath(value: unknown, path: string): unknown {
	let current: unknown = value;
	for (const part of path.split('.')) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/**
 * The name a card author writes and the name a call arrives under can
 * differ: `ctx.proposed.name` is world-qualified (`starter/playroom/open`),
 * because that is what the model actually called, while a card says `open` —
 * the same short form `createActionBlocklistGuardrail` compares against, and
 * for the same reason (E6, `14-…` §3): a card written against `open` should
 * not silently match nothing the day a world action gets qualified.
 */
function callName(id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(lastSlash + 1);
}

/**
 * Pure and total over the closed `PredicateExpr` union — "OPA in miniature"
 * (`14-…` §4.6). Nothing here can reach world state or history, which is
 * what keeps a card auditable by *reading* it rather than by running it.
 */
export function evaluatePredicate(expr: PredicateExpr, ctx: PredicateEvalContext): boolean {
	switch (expr.kind) {
		case 'call-kind-is':
			return ctx.proposed?.kind === expr.value;
		case 'call-name-is':
			return ctx.proposed !== undefined && callName(ctx.proposed.name) === expr.value;
		case 'argument-equals':
			return getPath(ctx.proposed?.arguments, expr.path) === expr.value;
		case 'usage-at-least':
			return ctx.usage[expr.field] >= expr.value;
		case 'argument-contains': {
			const value = getPath(ctx.proposed?.arguments, expr.path);
			if (typeof value === 'string') return value.includes(expr.value);
			return Array.isArray(value) && value.includes(expr.value);
		}
		case 'argument-matches': {
			const value = getPath(ctx.proposed?.arguments, expr.path);
			return typeof value === 'string' && patternFor(expr.pattern).test(value);
		}
		case 'observation-contains':
			return ctx.observation?.text.includes(expr.value) ?? false;
		case 'world-predicate':
			return ctx.world?.test(expr.predicateId) === true;
		case 'history-count': {
			const events = ctx.history ?? [];
			let count = 0;
			for (const event of events) {
				if (event.type !== expr.type) continue;
				if (expr.name !== undefined && eventName(event) !== expr.name) continue;
				count += 1;
				if (count >= expr.atLeast) return true;
			}
			return false;
		}
		case 'hook-is':
			return ctx.hook === expr.hook;
		case 'and':
			return expr.all.every((sub) => evaluatePredicate(sub, ctx));
		case 'or':
			return expr.any.some((sub) => evaluatePredicate(sub, ctx));
		case 'not':
			return !evaluatePredicate(expr.expr, ctx);
	}
}

function compileRule(card: PolicyCard, rule: PolicyRule, index: number): Guardrail {
	return {
		id: `${card.id}#rule-${index}`,
		name: card.title,
		description: rule.reason,
		hooks: [rule.hook],
		policyCardId: card.id,
		check(ctx) {
			const fires = evaluatePredicate(rule.when, predicateContextFor(ctx));
			if (!fires) return { allow: true };

			switch (rule.then) {
				case 'block-action':
					return { allow: false, reason: rule.reason, disposition: 'block-action' };
				case 'stop-run':
					return { allow: false, reason: rule.reason, disposition: 'stop-run' };
				case 'require-approval':
					return { pause: true, reason: rule.reason };
			}
		}
	};
}

/** Every guardrail a policy card installs, one per rule, in the card's own rule order. */
export function compilePolicyCard(card: PolicyCard): Guardrail[] {
	return card.rules.map((rule, index) => compileRule(card, rule, index));
}
