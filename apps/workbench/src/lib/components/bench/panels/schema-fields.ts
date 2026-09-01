import type { ControlHint, ControlHints, ControlSource } from '@craftabot/core';
import type { ZodType } from 'zod';

/**
 * **What controls a brick's config schema asks for** (WP14 slice 4a).
 *
 * The half of the panel that needs no Svelte: a `ZodType` and its kind's
 * `ControlHints` in, a list of controls out. Pure, so the interesting part —
 * *what a brick with no hand-written panel gets* — is unit-testable without
 * mounting anything.
 *
 * The division of labour with `ControlHints` is the point. The **schema** knows
 * the shape: this field is a number between 0 and 2, that one is a list of
 * strings, this one may be absent. The **hints** know what it means to a
 * builder: that the number wants a dial reading "relaxed" through
 * "hair-trigger", that the list is a set of world actions. Neither is
 * sufficient, and a brick that declares no hints still gets working controls
 * from the schema alone, which is the line `14-…` §2.1 draws.
 */

export type FieldControl =
	| { kind: 'switch' }
	| { kind: 'text' }
	| { kind: 'number'; min?: number; max?: number; step: number }
	| { kind: 'dial'; min: number; max: number; step: number; bands?: ReadonlyArray<Band> }
	| { kind: 'choice'; options: ReadonlyArray<{ value: unknown; label: string }> }
	/**
	 * A set of ids to tick.
	 *
	 * Either from one of core's catalogues (`source`) or from a list the kind
	 * declared itself (`entries`). The second exists because the Watchbot
	 * prototype found the first insufficient: its `watchFor` is a list of *its
	 * own* rule ids, which is content no core catalogue has, and it was rendering
	 * as a text box for the builder to type ids into.
	 */
	| { kind: 'checklist'; source?: ControlSource; entries?: ReadonlyArray<Entry> }
	| { kind: 'idList' };

/** One tickable option a kind declared for itself. */
export interface Entry {
	id: string;
	name: string;
	/** Kinds may explain an option; the catalogues do, so the shape matches. */
	description?: string;
}

/** A dial's word for everything up to `upTo`, ascending. */
export interface Band {
	upTo: number;
	label: string;
}

export interface FieldDescriptor {
	name: string;
	label: string;
	hint?: string;
	optional: boolean;
	control: FieldControl;
}

/** Zod 4 keeps the shape and the checks on `def`; this is the whole of what we read. */
interface ZodInternals {
	def: {
		type: string;
		shape?: Record<string, ZodType>;
		innerType?: ZodType;
		element?: ZodType;
		options?: ZodType[];
		values?: unknown[];
		/** `z.enum(...)`'s own values live here, keyed by themselves — real zod 4 has no `values` for an enum def. */
		entries?: Record<string, unknown>;
		checks?: Array<{ _zod?: { def?: NumericCheck }; def?: NumericCheck }>;
	};
}

interface NumericCheck {
	check?: string;
	value?: number;
	inclusive?: boolean;
}

const internals = (schema: ZodType): ZodInternals['def'] => (schema as unknown as ZodInternals).def;

/**
 * The fields of a brick's config, in the order the schema declares them.
 *
 * Schema order rather than hint order: the schema is the thing that cannot go
 * stale, and a kind that hints only half its fields should still show all of
 * them.
 */
export function describeFields(schema: ZodType, hints: ControlHints = {}): FieldDescriptor[] {
	const shape = internals(schema).shape;
	if (!shape) return [];

	return Object.entries(shape).map(([name, field]) => {
		const hint = hints[name] ?? {};
		const { inner, optional } = unwrap(field);
		return {
			name,
			label: hint.label ?? humanise(name),
			...(hint.hint !== undefined ? { hint: hint.hint } : {}),
			optional,
			control: controlFor(inner, hint)
		};
	});
}

/** `z.number().optional()` is a number that may be absent, not a separate kind of thing. */
function unwrap(schema: ZodType): { inner: ZodType; optional: boolean } {
	const def = internals(schema);
	if (
		(def.type === 'optional' || def.type === 'nullable' || def.type === 'default') &&
		def.innerType
	) {
		return { inner: unwrap(def.innerType).inner, optional: true };
	}
	return { inner: schema, optional: false };
}

function controlFor(schema: ZodType, hint: ControlHint): FieldControl {
	const def = internals(schema);

	/*
	 * A hint naming a source settles it: only the hint can know that an array of
	 * strings is a set of tool ids. Everything else the schema can answer, so the
	 * hint only chooses between honest renderings of the same type.
	 */
	if (hint.source && (hint.control === 'checklist' || hint.control === undefined)) {
		return { kind: 'checklist', source: hint.source };
	}

	/*
	 * A checklist over the kind's *own* options. No core catalogue can supply
	 * these — a monitor rule id is content the pack invented — so the kind lists
	 * them itself, and this is what stops such a field falling back to a text box.
	 */
	if (hint.control === 'checklist' && hint.options && hint.options.length > 0) {
		return {
			kind: 'checklist',
			entries: hint.options.map((option) => ({ id: String(option.value), name: option.label }))
		};
	}

	switch (def.type) {
		case 'boolean':
			return { kind: 'switch' };

		case 'number': {
			const { min, max } = numericBounds(def.checks);
			const step = 1;
			/*
			 * A dial needs both ends: 270° of travel between unknown bounds is not a
			 * control, it is a guess. An unbounded number stays a number field.
			 */
			if (hint.control === 'dial' && min !== undefined && max !== undefined) {
				const bands = hint.options ? toBands(hint.options) : undefined;
				return { kind: 'dial', min, max, step: dialStep(min, max), ...(bands ? { bands } : {}) };
			}
			return {
				kind: 'number',
				...(min !== undefined ? { min } : {}),
				...(max !== undefined ? { max } : {}),
				step
			};
		}

		case 'union':
		case 'literal': {
			const values = literalValues(schema);
			if (values.length > 0) {
				return { kind: 'choice', options: values.map((value) => labelled(value, hint)) };
			}
			return { kind: 'text' };
		}

		case 'enum': {
			const values = def.entries ? Object.values(def.entries) : [];
			return { kind: 'choice', options: values.map((value) => labelled(value, hint)) };
		}

		case 'array':
			// No source, so nothing here knows what these strings are. A list of ids
			// the builder types is a poor control and an honest one — and it is the
			// case a `source` hint exists to prevent.
			return { kind: 'idList' };

		default:
			return { kind: 'text' };
	}
}

/** `z.union([z.literal(3), z.literal(10)])` and a bare `z.literal` both enumerate. */
function literalValues(schema: ZodType): unknown[] {
	const def = internals(schema);
	if (def.type === 'literal') return def.values ?? [];
	return (def.options ?? []).flatMap((option) => literalValues(option));
}

function labelled(value: unknown, hint: ControlHint): { value: unknown; label: string } {
	const declared = hint.options?.find((option) => option.value === value);
	return { value, label: declared?.label ?? String(value) };
}

function toBands(options: NonNullable<ControlHint['options']>): Band[] {
	return options
		.filter(
			(option): option is { value: number; label: string } => typeof option.value === 'number'
		)
		.map((option) => ({ upTo: option.value, label: option.label }))
		.sort((a, b) => a.upTo - b.upTo);
}

function numericBounds(checks: ZodInternals['def']['checks']): {
	min?: number;
	max?: number;
} {
	let min: number | undefined;
	let max: number | undefined;
	for (const entry of checks ?? []) {
		const check = entry._zod?.def ?? entry.def;
		if (check?.value === undefined) continue;
		if (check.check === 'greater_than') min = check.value;
		if (check.check === 'less_than') max = check.value;
	}
	return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

/** Ten stops across the range, rounded to something a builder would type. */
function dialStep(min: number, max: number): number {
	const span = max - min;
	if (span <= 2) return 0.1;
	if (span <= 20) return 1;
	return 5;
}

/** `maxTicks` → "Max ticks". A last resort: a kind should give its fields labels. */
export function humanise(name: string): string {
	const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** The word a dial shows for a value, from its bands. */
export function bandLabel(
	value: number,
	bands: ReadonlyArray<Band> | undefined
): string | undefined {
	if (!bands || bands.length === 0) return undefined;
	return bands.find((band) => value <= band.upTo)?.label ?? bands[bands.length - 1]?.label;
}
