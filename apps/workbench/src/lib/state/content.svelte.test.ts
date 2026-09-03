import { createMemoryStorage, type Storage } from '@craftabot/core';
import { makeContent } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { createContentStore } from './content.svelte.js';

describe('the content store (WP46)', () => {
	function open() {
		const storage: Storage = createMemoryStorage();
		return { storage, store: createContentStore(() => Promise.resolve(storage)) };
	}

	it('starts empty and unloaded, loads what the store holds, and shadows it as the local pack', async () => {
		const { storage, store } = open();
		expect(store.loaded).toBe(false);
		expect(store.localPack.policyCards).toBeUndefined();
		await storage.putContent(makeContent());
		await store.load();
		expect(store.loaded).toBe(true);
		expect(store.records.map((r) => r.id)).toEqual(['local/policy/no-shouting']);
		expect(store.localPack.policyCards?.map((c) => c.id)).toEqual(['local/policy/no-shouting']);
		expect(store.of('policy-card')).toHaveLength(1);
		expect(store.of('scenario')).toHaveLength(0);
	});

	it('save, saveAll and remove write through and refresh', async () => {
		const { storage, store } = open();
		await store.save(makeContent());
		await store.saveAll([
			makeContent({ id: 'local/policy/second', title: 'Second' }),
			makeContent({ id: 'local/policy/third', title: 'Third' })
		]);
		expect((await storage.listContent()).map((r) => r.id)).toEqual([
			'local/policy/no-shouting',
			'local/policy/second',
			'local/policy/third'
		]);
		await store.remove('local/policy/second');
		expect(store.records.map((r) => r.id)).toEqual([
			'local/policy/no-shouting',
			'local/policy/third'
		]);
	});
});
