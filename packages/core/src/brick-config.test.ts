import { describe, expect, it } from 'vitest';
import { migrateBrickConfig } from './brick-config.js';

describe('migrateBrickConfig', () => {
	it('returns the config unchanged when already at the target version', () => {
		const config = { a: 1 };
		expect(migrateBrickConfig(config, 2, { configVersion: 2 })).toBe(config);
	});

	it('runs a single step to reach the target version', () => {
		const config = { approvalMode: true };
		const migrated = migrateBrickConfig(config, 1, {
			configVersion: 2,
			migrateConfig: { 1: (raw) => ({ approval: raw.approvalMode ? 'everything' : 'off' }) }
		});
		expect(migrated).toEqual({ approval: 'everything' });
	});

	it('chains steps across more than one version gap', () => {
		const migrated = migrateBrickConfig({ n: 1 }, 1, {
			configVersion: 3,
			migrateConfig: {
				1: (raw) => ({ n: (raw.n as number) + 10 }),
				2: (raw) => ({ n: (raw.n as number) + 100 })
			}
		});
		expect(migrated).toEqual({ n: 111 });
	});

	it('stops at the first missing step rather than guessing', () => {
		const config = { n: 1 };
		const migrated = migrateBrickConfig(config, 1, { configVersion: 3, migrateConfig: {} });
		expect(migrated).toBe(config);
	});
});
