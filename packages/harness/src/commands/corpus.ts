import { readFile, writeFile } from 'node:fs/promises';
import {
	corpusDigest,
	parseCorpus,
	secondLabelsSchema,
	type Annotator,
	type Corpus,
	type SecondLabels
} from '@craftabot/core';
import { cohensKappa } from '@craftabot/metrics';

/**
 * **`craftabot corpus freeze | label | agreement`** (WP119, `105-CORPORA.md`
 * §6): the labelling tools. `freeze` writes a corpus's digest; `label` walks
 * its rows for a second annotator and never shows a label; `agreement`
 * computes κ per label against the primary and records the annotator.
 */
async function readCorpus(file: string): Promise<Corpus> {
	return parseCorpus(JSON.parse(await readFile(file, 'utf8')));
}
const writeJson = (file: string, value: unknown) =>
	writeFile(file, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');

/**
 * `freeze`: the digest over the labels and rows, written into the file, which
 * must parse as a corpus. `checkCorpus` (`pack-testkit`) holds the rest in the
 * pack's own tests; the CLI does not load a test kit.
 */
export async function freezeCorpus(file: string): Promise<{ corpus: Corpus; digest: string }> {
	const raw = JSON.parse(await readFile(file, 'utf8')) as Corpus;
	const digest = corpusDigest(raw);
	const corpus = parseCorpus({ ...raw, digest });
	await writeJson(file, corpus);
	return { corpus, digest };
}

export interface LabelCorpusOptions {
	corpus: Corpus;
	/** The annotator's id, as `agreement` will record it. */
	as: string;
	/** Asks one question and returns what the annotator typed. */
	ask: (prompt: string) => Promise<string>;
	/** Where the walk is shown. Only the guide, the options and the rows' ids, tags and states ever reach it. */
	write: (text: string) => void;
}

/**
 * **`label`** (`105-…` §6): the corpus guide once, each label's guide and
 * options, then every row by its id, tags and state — never its labels, its
 * `contested` or anything computed from them — asking one option per label.
 * An answer is the option's number or its name; `?` first asks for a note.
 * Asks again on anything else.
 */
export async function labelCorpus(options: LabelCorpusOptions): Promise<SecondLabels> {
	const { corpus, ask, write } = options;
	write(`${corpus.name} (${corpus.id}), ${corpus.rows.length} rows.\n\n${corpus.guide}\n`);
	for (const [name, label] of Object.entries(corpus.labels)) {
		write(`\n${name}: ${label.guide}\n`);
		label.options.forEach((option, index) => write(`  ${index + 1}. ${option}\n`));
	}
	const labels: SecondLabels['labels'] = [];
	for (const row of corpus.rows) {
		write(`\n— ${row.id} [${row.tags.join(', ')}]\n${stateText(row.state)}\n`);
		const answers: Record<string, string> = {};
		let note: string | undefined;
		for (const [name, label] of Object.entries(corpus.labels)) {
			for (;;) {
				const typed = (await ask(`${name}? `)).trim();
				if (typed === '?') {
					note = (await ask('note: ')).trim();
					continue;
				}
				const byNumber = label.options[Number(typed) - 1];
				const chosen = label.options.includes(typed) ? typed : byNumber;
				if (chosen !== undefined) {
					answers[name] = chosen;
					break;
				}
				write(`  one of 1–${label.options.length} or a name: ${label.options.join(', ')}\n`);
			}
		}
		labels.push({ id: row.id, labels: answers, ...(note ? { note } : {}) });
	}
	return secondLabelsSchema.parse({
		corpusId: corpus.id,
		corpusDigest: corpus.digest,
		annotator: options.as,
		blind: true,
		labels
	});
}

const stateText = (state: unknown): string =>
	typeof state === 'string' ? state : JSON.stringify(state, null, 2);

export interface AgreementReport {
	annotator: string;
	kappa: Record<string, number>;
	/** Per label, the rows the two disagree on: the row's id, the primary's label and the second's. */
	disagreements: Record<string, Array<{ id: string; primary: string; second: string }>>;
}

/**
 * **`agreement`** (`105-…` §6): Cohen's κ per label between the primary (the
 * rows' own labels) and a second-label file over the same frozen corpus, on
 * the rows both labelled; the corpus with the annotator recorded (blind, κ to
 * four places), replacing an earlier record of the same annotator.
 */
export function agreementOf(
	corpus: Corpus,
	second: SecondLabels
): { report: AgreementReport; corpus: Corpus } {
	if (second.corpusId !== corpus.id || second.corpusDigest !== corpus.digest)
		throw new Error(
			`corpus agreement: the labels are for ${second.corpusId} at ${second.corpusDigest}, not ${corpus.id} at ${corpus.digest}`
		);
	const byId = new Map(second.labels.map((entry) => [entry.id, entry.labels]));
	const kappa: Record<string, number> = {};
	const disagreements: AgreementReport['disagreements'] = {};
	for (const name of Object.keys(corpus.labels)) {
		const both = corpus.rows.filter((row) => byId.get(row.id)?.[name] !== undefined);
		if (both.length === 0) continue;
		const primary = both.map((row) => row.labels[name]!);
		const other = both.map((row) => byId.get(row.id)![name]!);
		const result = cohensKappa(primary, other);
		kappa[name] = Number(result.value.toFixed(4));
		disagreements[name] = result.disagreements.map((index) => ({
			id: both[index]!.id,
			primary: primary[index]!,
			second: other[index]!
		}));
	}
	const annotator: Annotator = { id: second.annotator, blind: second.blind, kappa };
	const annotators = [
		...corpus.annotators.filter((entry) => entry.id !== second.annotator),
		annotator
	];
	return {
		report: { annotator: second.annotator, kappa, disagreements },
		corpus: parseCorpus({ ...corpus, annotators })
	};
}

export async function agreementForFiles(
	corpusFile: string,
	labelsFile: string
): Promise<AgreementReport> {
	const corpus = await readCorpus(corpusFile);
	const second = secondLabelsSchema.parse(JSON.parse(await readFile(labelsFile, 'utf8')));
	const { report, corpus: recorded } = agreementOf(corpus, second);
	await writeJson(corpusFile, recorded);
	return report;
}

export async function labelCorpusFile(
	options: Omit<LabelCorpusOptions, 'corpus'> & { file: string; out: string }
): Promise<SecondLabels> {
	const corpus = await readCorpus(options.file);
	const labels = await labelCorpus({ ...options, corpus });
	await writeJson(options.out, labels);
	return labels;
}

export function renderAgreement(report: AgreementReport): string {
	const lines = [`${report.annotator}, blind:`];
	for (const [name, kappa] of Object.entries(report.kappa)) {
		const differ = report.disagreements[name] ?? [];
		lines.push(`  ${name}: κ ${kappa.toFixed(2)}, ${differ.length} disagreement(s)`);
		for (const row of differ) lines.push(`    ${row.id}: ${row.primary} / ${row.second}`);
	}
	return `${lines.join('\n')}\n`;
}
