import { seededRandom, type CounterpartRule, type CounterpartScript } from '@craftabot/desk';
import type { AgeBand, Customer, DigitalConfidence } from './model.js';
import { persona, type PersonaId, type PersonaOptions } from './personas.js';

/**
 * **A persona drawn from the case's own cohort** (WP174, `112-REAL-ENOUGH-PLAN.md`
 * §5; G152): the ten hand-written people stay as anchors, and `personaFor` picks
 * one by what the customer is (their age band, their support needs, how
 * confident they are with the app) and gives them a **voice** — a register, a
 * verbosity and a patience — drawn from the case's seed, so no two callers say a
 * line the same way and the same case always says it the same way. The words are
 * restyled, not rewritten: a model-written voice per persona is the cassette
 * work of WP168 and waits on the Sparks, and the restyling keeps every rule's
 * trigger, pressure and tags exactly as the anchor wrote them. Lines that carry
 * an attack (tagged `prompt-injection` or `ASI01`) are never restyled: an
 * injection must reach the desk as it was written.
 *
 * How confident the customer is with the app is read from the customer's own
 * `digitalConfidence` (the population draws it, WP74); the plan's "new synthetic
 * field" was already there.
 */
export type Register = 'formal' | 'casual' | 'terse';

export interface Voice {
	register: Register;
	/** 1 says it and stops; 3 adds a sentence of its own. */
	verbosity: 1 | 2 | 3;
	/** How many ticks before the rules that wait on the clock fire; below 1 is impatient, above is patient. */
	patience: number;
}

export interface DrawnPersona {
	/** The anchor the persona is a restyling of. */
	anchor: PersonaId;
	voice: Voice;
	digitalConfidence: DigitalConfidence;
	script: CounterpartScript;
}

const OLD: ReadonlySet<AgeBand> = new Set(['65-74', '75+']);
const YOUNG: ReadonlySet<AgeBand> = new Set(['18-24', '25-34']);

/** The anchor a customer is most like, with a draw among the near ones. */
function anchorFor(customer: Customer, random: () => number): PersonaId {
	const { cohort } = customer;
	if (cohort.supportNeeds) return random() < 0.5 ? 'vulnerable' : 'distressed-genuine';
	if (customer.digitalConfidence === 'low') return 'first-timer';
	if (cohort.incomeBand === 'over-100k' || cohort.incomeBand === '60-100k')
		return random() < 0.5 ? 'guarantee-seeker' : 'pushy';
	const among: PersonaId[] = ['first-timer', 'pushy', 'complainant'];
	return among[Math.floor(random() * among.length)]!;
}

/** The voice a cohort speaks in, with a draw so two like callers differ. */
export function voiceFor(
	cohort: Customer['cohort'],
	digital: DigitalConfidence,
	random: () => number
): Voice {
	const register: Register = OLD.has(cohort.ageBand)
		? 'formal'
		: YOUNG.has(cohort.ageBand)
			? 'casual'
			: random() < 0.4
				? 'terse'
				: 'formal';
	const verbosity = (digital === 'low' ? 3 : random() < 0.5 ? 2 : 1) as Voice['verbosity'];
	// Patience: the support-need caller is given more room; a high-income, high-confidence caller less.
	const patience = cohort.supportNeeds ? 1.5 : digital === 'high' ? 0.7 : 1;
	return { register, verbosity, patience };
}

const EXPAND: ReadonlyArray<[RegExp, string]> = [
	[/\bI’m\b/g, 'I am'],
	[/\bI’ve\b/g, 'I have'],
	[/\bdon’t\b/g, 'do not'],
	[/\bdoesn’t\b/g, 'does not'],
	[/\bhaven’t\b/g, 'have not'],
	[/\bisn’t\b/g, 'is not'],
	[/\bcan’t\b/g, 'cannot'],
	[/\bwon’t\b/g, 'will not'],
	[/\bwouldn’t\b/g, 'would not']
];
const CONTRACT: ReadonlyArray<[RegExp, string]> = [
	[/\bI am\b/g, 'I’m'],
	[/\bI have\b/g, 'I’ve'],
	[/\bdo not\b/g, 'don’t'],
	[/\bdoes not\b/g, 'doesn’t'],
	[/\bcannot\b/g, 'can’t']
];
const FILLER: Record<Register, readonly string[]> = {
	formal: ['I hope that is clear.', 'Thank you for your patience.'],
	casual: ['Hope that makes sense.', 'Cheers.'],
	terse: ['That is all.', 'Thanks.']
};

/** One line in a voice: the register's contractions, the first sentence only when terse, a filler when verbose. */
export function styleLine(text: string, voice: Voice): string {
	let out = text;
	for (const [pattern, replacement] of voice.register === 'formal' ? EXPAND : CONTRACT)
		out = out.replace(pattern, replacement);
	if (voice.register === 'terse') out = out.split(/(?<=[.?!])\s+/)[0] ?? out;
	if (voice.verbosity === 3 && /[.?!]$/.test(out)) {
		const fillers = FILLER[voice.register];
		out = `${out} ${fillers[out.length % fillers.length]}`;
	}
	return out;
}

const carriesAnAttack = (rule: CounterpartRule): boolean =>
	(rule.tags ?? []).some((tag) => tag === 'prompt-injection' || tag === 'ASI01');

function restyle(script: CounterpartScript, voice: Voice): CounterpartScript {
	const say = (line: string | readonly string[] | undefined) =>
		line === undefined
			? undefined
			: typeof line === 'string'
				? styleLine(line, voice)
				: line.map((entry) => styleLine(entry, voice));
	return {
		...script,
		...(script.opening !== undefined ? { opening: styleLine(script.opening, voice) } : {}),
		fallback: styleLine(script.fallback, voice),
		rules: script.rules.map((rule): CounterpartRule => {
			if (carriesAnAttack(rule)) return rule;
			const lines = say(rule.say);
			const when =
				rule.when.kind === 'tick-at-least'
					? { ...rule.when, tick: Math.max(1, Math.round(rule.when.tick * voice.patience)) }
					: rule.when;
			return { ...rule, when, ...(lines !== undefined ? { say: lines } : {}) };
		})
	};
}

/**
 * The persona for a customer, drawn from the seed: an anchor chosen by the
 * cohort, a voice drawn for it, the anchor's words restyled in that voice.
 * Deterministic in `(customer, seed)`.
 */
export function personaFor(
	customer: Customer,
	seed: number,
	options?: PersonaOptions
): DrawnPersona {
	const random = seededRandom(seed ^ 0x51ed270b);
	const anchor = anchorFor(customer, random);
	const voice = voiceFor(customer.cohort, customer.digitalConfidence, random);
	return {
		anchor,
		voice,
		digitalConfidence: customer.digitalConfidence,
		script: restyle(persona(anchor, customer, options), voice)
	};
}
