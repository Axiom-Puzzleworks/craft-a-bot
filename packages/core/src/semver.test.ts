import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion, satisfiesRange } from './semver.js';

describe('parseVersion / compareVersions', () => {
	it('reads x.y.z with an optional prerelease and build, and orders them', () => {
		expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
		expect(parseVersion('v1.0.0-rc.1+build')).toEqual({
			major: 1,
			minor: 0,
			patch: 0,
			prerelease: 'rc.1'
		});
		expect(parseVersion('1.2')).toBeUndefined();
		expect(parseVersion('nope')).toBeUndefined();
		const v = (text: string) => parseVersion(text)!;
		expect(compareVersions(v('1.0.0'), v('1.0.0'))).toBe(0);
		expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0'))).toBeLessThan(0);
		expect(compareVersions(v('1.0.0'), v('1.0.0-rc.1'))).toBeGreaterThan(0);
		expect(compareVersions(v('1.0.0-rc.1'), v('1.0.0-rc.2'))).toBeLessThan(0);
		expect(compareVersions(v('2.0.0'), v('1.9.9'))).toBeGreaterThan(0);
		expect(compareVersions(v('1.1.0'), v('1.0.9'))).toBeGreaterThan(0);
	});
});

describe('satisfiesRange', () => {
	it('handles the comparators, the star and an exact version', () => {
		expect(satisfiesRange('0.2.0', '>=0.0.1')).toBe(true);
		expect(satisfiesRange('0.0.1', '>0.0.1')).toBe(false);
		expect(satisfiesRange('1.0.0', '<=1.0.0')).toBe(true);
		expect(satisfiesRange('1.0.1', '<1.0.1')).toBe(false);
		expect(satisfiesRange('1.0.0', '=1.0.0')).toBe(true);
		expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true);
		expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false);
		expect(satisfiesRange('9.9.9', '*')).toBe(true);
		expect(satisfiesRange('9.9.9', '')).toBe(true);
	});

	it('handles caret and tilde, including the zero-major cases', () => {
		expect(satisfiesRange('1.5.0', '^1.2.3')).toBe(true);
		expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
		expect(satisfiesRange('0.2.9', '^0.2.0')).toBe(true);
		expect(satisfiesRange('0.3.0', '^0.2.0')).toBe(false);
		expect(satisfiesRange('0.0.1', '^0.0.1')).toBe(true);
		expect(satisfiesRange('0.0.2', '^0.0.1')).toBe(false);
		expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true);
		expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
		expect(satisfiesRange('1.9.0', '^1')).toBe(true);
		expect(satisfiesRange('1.2.5', '~1.2')).toBe(true);
	});

	it('joins comparators with AND, alternatives with ||, and refuses what it cannot read', () => {
		expect(satisfiesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
		expect(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
		expect(satisfiesRange('3.0.0', '^1.0.0 || ^3.0.0')).toBe(true);
		expect(satisfiesRange('2.0.0', '^1.0.0 || ^3.0.0')).toBe(false);
		expect(satisfiesRange('1.0.0', '>=abc')).toBe(false);
		expect(satisfiesRange('one', '>=1.0.0')).toBe(false);
		expect(satisfiesRange('1.0.0', '1.x')).toBe(false);
	});

	it('treats a release candidate as before its release', () => {
		expect(satisfiesRange('1.0.0-rc.1', '>=1.0.0')).toBe(false);
		expect(satisfiesRange('1.0.0-rc.1', '>=1.0.0-rc.1')).toBe(true);
		expect(satisfiesRange('1.0.0', '>=1.0.0-rc.1')).toBe(true);
	});
});
