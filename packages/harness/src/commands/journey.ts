import { readFile } from 'node:fs/promises';
import { parseWorkflowRun, type JourneyLayout, type PackRegistry } from '@craftabot/core';
import { journeyLayout, renderJourneySvg } from '@craftabot/workflow';

/**
 * `craftabot journey render` (WP100, `87-JOURNEY-CANVAS.md` §7): one
 * journey's layout and its SVG — unlit, under a configuration, or lit by a
 * stored workflow run — for the manual and the site. The same fold the
 * Workshop draws.
 */
export interface JourneyRenderOptions {
	workflowId: string;
	configuration?: string | undefined;
	/** A stored workflow run file (`{ run, … }`) or a bare run, to light the path. */
	runPath?: string | undefined;
}

export async function journeyRender(
	registry: PackRegistry,
	options: JourneyRenderOptions
): Promise<{ layout: JourneyLayout; svg: string }> {
	const spec = registry.getWorkflow(options.workflowId);
	if (!spec) throw new Error(`no workflow '${options.workflowId}' is registered`);
	const config =
		options.configuration === undefined ? undefined : spec.configurations?.[options.configuration];
	if (options.configuration !== undefined && !config) {
		throw new Error(
			`'${options.workflowId}' has no configuration '${options.configuration}' (has ${Object.keys(spec.configurations ?? {}).join(', ') || 'none'})`
		);
	}
	const run = options.runPath ? await readRun(options.runPath) : undefined;
	const layout = journeyLayout(spec, config, run, { registry });
	return { layout, svg: renderJourneySvg(layout) };
}

async function readRun(path: string) {
	const raw = JSON.parse(await readFile(path, 'utf8')) as { run?: unknown };
	return parseWorkflowRun(raw.run ?? raw);
}
