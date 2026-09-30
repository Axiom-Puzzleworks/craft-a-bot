import { stackSchema, type Stack } from '@craftabot/core';

/**
 * **A stack file** (WP127, `107-THE-GATE.md` §1): a `Stack` as JSON, or a
 * stack the Studio saved — a content record whose `record` is the stack
 * (`stackRecord`, WP101) — so *Use in… the Gate* writes a file the Gate
 * reads as it is.
 */
export function parseStackFile(value: unknown): Stack {
	const candidate =
		typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'stack'
			? (value as { record?: unknown }).record
			: value;
	const parsed = stackSchema.safeParse(candidate);
	if (!parsed.success)
		throw new Error(
			`not a stack, nor a saved one: ${parsed.error.issues[0]?.message ?? 'unreadable'}`
		);
	return parsed.data;
}
