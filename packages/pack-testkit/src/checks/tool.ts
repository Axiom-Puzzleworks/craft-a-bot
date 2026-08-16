import type { NotebookAccess, ToolContext, ToolDefinition } from '@craftabot/core';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ConformanceIssue } from '../types.js';

const ajv = new Ajv2020({ strict: false });

/** A small deterministic generator — same seed, same sequence, every time. */
function seededRandom(seed: number): () => number {
	let state = seed || 1;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
}

function stubContext(seed: number): ToolContext {
	const lines: string[] = [];
	const notebook: NotebookAccess = {
		read: () => [...lines],
		append: (line) => lines.push(line)
	};
	return { tick: 0, notebook, random: seededRandom(seed) };
}

/**
 * "Every tool: executes offline; deterministic under injected random; output
 * non-empty; schema honest" (`13-…` §7).
 *
 * "Deterministic under injected random" is checked by running `execute` twice
 * with two independently-built contexts seeded identically and comparing the
 * results — a tool that only draws from `context.random()` (hard rule 5)
 * produces the same result both times; one that reaches for `Math.random` or
 * the clock will not.
 */
export async function checkTool(
	tool: ToolDefinition,
	exampleArgs: unknown
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];

	try {
		const validate = ajv.compile(tool.parameters);
		if (!validate(exampleArgs)) {
			issues.push({
				check: 'tool.schema-honest',
				message: `"${tool.id}"'s example args do not satisfy its own declared parameters schema: ${ajv.errorsText(validate.errors)}`
			});
		}
	} catch (error) {
		issues.push({
			check: 'tool.schema-valid',
			message: `"${tool.id}"'s parameters is not valid JSON Schema: ${describeError(error)}`
		});
	}

	let first;
	try {
		first = await tool.execute(exampleArgs, stubContext(1));
	} catch (error) {
		issues.push({
			check: 'tool.executes-offline',
			message: `"${tool.id}".execute threw: ${describeError(error)}`
		});
		return issues;
	}

	if (!first.output || first.output.trim() === '') {
		issues.push({ check: 'tool.output-non-empty', message: `"${tool.id}" returned empty output` });
	}

	let second;
	try {
		second = await tool.execute(exampleArgs, stubContext(1));
	} catch (error) {
		issues.push({
			check: 'tool.executes-offline',
			message: `"${tool.id}".execute threw on its second call: ${describeError(error)}`
		});
		return issues;
	}

	if (JSON.stringify(first) !== JSON.stringify(second)) {
		issues.push({
			check: 'tool.deterministic',
			message: `"${tool.id}" returned different results across two identically-seeded calls`
		});
	}

	return issues;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
