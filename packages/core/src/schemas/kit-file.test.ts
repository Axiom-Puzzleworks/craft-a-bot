import { describe, expect, it } from 'vitest';
import validKitFileV1 from '../fixtures/kit-file.v1.valid.json';
import invalidKitFileV1 from '../fixtures/kit-file.v1.invalid.json';
import validKitFile from '../fixtures/kit-file.v2.valid.json';
import invalidKitFile from '../fixtures/kit-file.v2.invalid.json';
import { migrateKitFile, parseKitFile, safeParseKitFile, type MigrationError } from './kit-file.js';

describe('kitFileSchema', () => {
	it('parses the valid v2 fixture', () => {
		const kit = parseKitFile(validKitFile);
		expect(kit.format).toBe('craftabot-kit');
		expect(kit.agent.name).toBe('Snackbot 3000');
	});

	it('rejects the invalid v2 fixture', () => {
		const result = safeParseKitFile(invalidKitFile);
		expect(result.success).toBe(false);
	});

	it('round-trips parse → serialize → parse to an identical object', () => {
		const first = parseKitFile(validKitFile);
		const roundTripped = parseKitFile(JSON.parse(JSON.stringify(first)));
		expect(roundTripped).toEqual(first);
	});

	it('preserves unknown fields on round-trip (passthrough)', () => {
		const withExtra = { ...validKitFile, futureField: { anything: true } };
		const kit = parseKitFile(withExtra);
		expect((kit as unknown as { futureField: unknown }).futureField).toEqual({ anything: true });
	});

	it('never contains an apiKey field on the fixture (kit files are safe to share)', () => {
		expect(JSON.stringify(validKitFile)).not.toMatch(/apiKey/i);
	});
});

describe('migrateKitFile', () => {
	it('passes a valid v2 kit file through unchanged', () => {
		const result = migrateKitFile(validKitFile);
		expect((result as { format: string }).format).toBe('craftabot-kit');
	});

	it('upgrades a v1 kit file, spec and all', () => {
		const result = migrateKitFile(validKitFileV1);
		expect('kind' in result).toBe(false);
		if ('kind' in result) return;
		expect(result.formatVersion).toBe(2);
		expect(result.agent.schemaVersion).toBe(2);
		// The one thing v1 could not say, worked out from the bricks it did carry.
		expect(result.requires.brickKinds['starter/memory']).toBe('starter');
	});

	it('returns a MigrationError for an invalid v1 kit file', () => {
		const result = migrateKitFile(invalidKitFileV1) as MigrationError;
		expect(result.kind).toBe('migration-error');
	});

	it('returns a MigrationError for an invalid v2 kit file', () => {
		const result = migrateKitFile(invalidKitFile) as MigrationError;
		expect(result.kind).toBe('migration-error');
	});

	it('returns a MigrationError for an unrecognised formatVersion', () => {
		const result = migrateKitFile({ ...validKitFile, formatVersion: 99 }) as MigrationError;
		expect(result.kind).toBe('migration-error');
		expect(result.detectedVersion).toBe(99);
	});

	it('returns a MigrationError when formatVersion is not a number at all', () => {
		const result = migrateKitFile({ ...validKitFile, formatVersion: 'one' }) as MigrationError;
		expect(result.kind).toBe('migration-error');
		expect(result.detectedVersion).toBe('one');
	});

	it('returns a MigrationError for non-object input', () => {
		const result = migrateKitFile('not an object') as MigrationError;
		expect(result.kind).toBe('migration-error');
	});
});
