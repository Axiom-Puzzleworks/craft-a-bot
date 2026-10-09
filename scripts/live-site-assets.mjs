/**
 * **The live tier, served from the site** (WP196's remainder, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`; G134, G194): the
 * recordings a Workshop edition needs to show the live column — each design's committed result, the design itself, and the
 * cassette the Worker replays it from — as files the build emits beside the app. Nothing is copied into the repository: the
 * evidence stays where it is, under `docs/evidence/`, and the build reads it.
 *
 *   `cassettes/<cassette path as the campaign writes it>`   what `loadCassettes` fetches (`apps/workbench/src/lib/worker/cassettes.ts`)
 *   `live/index.json`                                       what the Experiments page lists
 *   `live/<id>.experiment-result.json`, `live/<id>.experiment.json`   the result to open and the design to replay
 *
 * The 122B suite and the oversight suite are served (their ids are unique); the 35B suite has the same ids in other folders and is
 * left out, so the page never offers two recordings under one name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SERVED_SUITES = [
	{ id: 'giant', experiments: 'experiments/live', evidence: 'docs/evidence/live' },
	{
		id: 'oversight',
		experiments: 'experiments/live-oversight',
		evidence: 'docs/evidence/live-oversight'
	}
];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The retired design the first suite keeps as a record: it has no design file and is not offered. */
const hasDesign = (suite, id, root) => existsSync(join(root, suite.experiments, `${id}.json`));

export function liveSiteAssets(root) {
	const files = [];
	const entries = [];
	for (const suite of SERVED_SUITES) {
		const timingsFile = join(root, suite.evidence, 'timings.json');
		if (!existsSync(timingsFile)) continue;
		const timings = readJson(timingsFile);
		for (const id of Object.keys(timings).sort()) {
			if (!hasDesign(suite, id, root)) continue;
			const dir = join(root, suite.evidence, id);
			const resultFile = join(dir, `${id}.experiment-result.json`);
			const cassetteFile = join(dir, `${id}.provider-cassette.json`);
			if (!existsSync(resultFile) || !existsSync(cassetteFile)) continue;
			const design = readJson(join(root, suite.experiments, `${id}.json`));
			const result = readJson(resultFile);
			const cassettePath = design.design?.template?.brains?.find(
				(brain) => brain.cassette
			)?.cassette;
			if (typeof cassettePath !== 'string') continue;
			files.push(
				{ fileName: `cassettes/${cassettePath}`, source: readFileSync(cassetteFile) },
				{ fileName: `live/${id}.experiment-result.json`, source: readFileSync(resultFile) },
				{
					fileName: `live/${id}.experiment.json`,
					source: readFileSync(join(root, suite.experiments, `${id}.json`))
				}
			);
			entries.push({
				id,
				suite: suite.id,
				title: result.title,
				model: timings[id].model,
				recordedOn: timings[id].recordedOn,
				verdict: result.verdict,
				cells: timings[id].cells,
				trials: timings[id].trials ?? 1,
				result: `live/${id}.experiment-result.json`,
				design: `live/${id}.experiment.json`
			});
		}
	}
	files.push({ fileName: 'live/index.json', source: `${JSON.stringify(entries, null, '\t')}\n` });
	return files;
}
