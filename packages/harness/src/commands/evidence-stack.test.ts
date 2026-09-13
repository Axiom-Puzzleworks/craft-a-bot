import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evidenceItemFor, type Stack } from '@craftabot/core';
import { memoryEvidenceStore } from '@craftabot/evidence';
import { itemToPush, pullEvidence, pulledPathFor } from './evidence.js';
import { createRegistry, defaultConfig } from '../config.js';
import { createFileStorage } from '../storage/file-storage.js';

/**
 * **A stack through the evidence store** (WP97, `89-STACKS.md` §6): pushed
 * from a file under its own id with a digest over its canonical JSON, pulled
 * back verified and byte-equal.
 */
const registry = createRegistry(defaultConfig());

describe('a stack as evidence', () => {
	it('pushes from a file and pulls back verified, the payload the stack it was', async () => {
		const stack = registry.getStack('fs-lending/stack/policy-cards') as Stack;
		expect(stack).toBeDefined();
		const root = await mkdtemp(join(tmpdir(), 'cab-stack-'));
		const file = join(root, 'stack.json');
		await writeFile(file, JSON.stringify(stack), 'utf8');
		const storage = await createFileStorage(join(root, 'store'));
		const item = await itemToPush({
			storage,
			registry,
			secrets: [],
			what: { kind: 'stack', file },
			now: () => Date.parse('2026-09-12T00:00:00Z')
		});
		expect(item.kind).toBe('stack');
		expect(item.id).toBe(stack.id);
		const direct = await evidenceItemFor('stack', stack.id, stack, {
			now: () => Date.parse('2026-09-12T00:00:00Z')
		});
		expect(item.digest).toBe(direct.digest);

		const instance = memoryEvidenceStore.create({
			config: { workspace: 't' },
			fetch: globalThis.fetch,
			getCredential: () => undefined
		});
		await instance.push(item);
		const dir = join(root, 'evidence');
		const pulled = await pullEvidence({ instance, query: {}, dir });
		expect(pulled).toHaveLength(1);
		expect(pulled[0]).toMatchObject({
			kind: 'stack',
			id: stack.id,
			digest: item.digest,
			verified: true
		});
		const back = JSON.parse(await readFile(pulledPathFor(dir, item), 'utf8')) as Stack;
		expect(back).toEqual(stack);
	});
});
