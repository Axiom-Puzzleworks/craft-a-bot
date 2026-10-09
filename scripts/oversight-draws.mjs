#!/usr/bin/env node
/**
 * **What the person did** (WP198, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): the reviewer model's draws in the oversight suite's live
 * stores (`recordings/oversight/`, local), counted per design and arm — how many approvals and decisions reached the person, and
 * how many they refused, asked about first, or answered late. Writes `docs/evidence/live-oversight/person.json`, which is committed
 * because the stores are not.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORES = join(ROOT, 'recordings', 'oversight');
const OUT = join(ROOT, 'docs/evidence/live-oversight/person.json');

function* files(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else if (entry.name === 'events.jsonl') yield path;
	}
}

const result = {};
for (const design of readdirSync(STORES)) {
	for (const trial of readdirSync(join(STORES, design)).filter((t) => t.startsWith('trial-'))) {
		for (const arm of readdirSync(join(STORES, design, trial), { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)) {
			const key = `${design}|${arm.slice(design.length + 2)}`;
			const row = (result[key] ??= {
				design,
				arm: arm.slice(design.length + 2),
				draws: 0,
				paths: {},
				late: 0,
				seconds: 0
			});
			for (const file of files(join(STORES, design, trial, arm))) {
				for (const line of readFileSync(file, 'utf8').split('\n')) {
					if (!line.includes('"reviewer.drew"')) continue;
					const { payload } = JSON.parse(line).event;
					row.draws += 1;
					row.paths[payload.path] = (row.paths[payload.path] ?? 0) + 1;
					if (payload.late) row.late += 1;
					row.seconds += payload.seconds ?? 0;
				}
			}
		}
	}
}
const rows = Object.values(result).sort((a, b) =>
	`${a.design}${a.arm}`.localeCompare(`${b.design}${b.arm}`)
);
if (!existsSync(STORES)) throw new Error('no live stores');
writeFileSync(OUT, `${JSON.stringify(rows, null, '\t')}\n`);
for (const r of rows)
	console.log(
		r.design.padEnd(28),
		r.arm.padEnd(62),
		r.draws,
		JSON.stringify(r.paths),
		'late',
		r.late
	);
