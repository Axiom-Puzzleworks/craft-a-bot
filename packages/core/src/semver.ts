/**
 * **Semver ranges, evaluated** (`40-DEBTS.md` §4.2, WP52; `12-…` D13). The
 * subset this tree uses and a kit file might carry: `*`, an exact version,
 * the comparators `>=` `>` `<=` `<` `=`, the caret `^x.y.z` and the tilde
 * `~x.y.z`, space-joined comparators as AND, `||` as OR. Anything this cannot
 * read is `false`, never a throw — a range that cannot be read cannot be
 * satisfied. A prerelease tag (`1.0.0-rc.1`) sorts before its release and
 * compares as a string after the numbers, which is all the tree needs.
 */

export interface Version {
	major: number;
	minor: number;
	patch: number;
	prerelease?: string;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text: string): Version | undefined {
	const match = VERSION.exec(text.trim());
	if (!match) return undefined;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		...(match[4] !== undefined ? { prerelease: match[4] } : {})
	};
}

/** Negative, zero or positive as `a` is before, the same as, or after `b`. */
export function compareVersions(a: Version, b: Version): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;
	if (a.prerelease === b.prerelease) return 0;
	// A release is after any of its prereleases.
	if (a.prerelease === undefined) return 1;
	if (b.prerelease === undefined) return -1;
	return a.prerelease < b.prerelease ? -1 : 1;
}

type Comparator = (version: Version) => boolean;

/** A partial version on the right of `^`/`~` (`^1`, `~1.2`) is filled with zeros. */
function parseLoose(text: string): Version | undefined {
	const parts = text.split('.');
	if (parts.length < 1 || parts.length > 3) return undefined;
	const padded = [...parts, '0', '0'].slice(0, 3).join('.');
	return parseVersion(padded);
}

function comparatorFor(token: string): Comparator | undefined {
	if (token === '*' || token === '') return () => true;
	const caret = /^\^(.+)$/.exec(token);
	if (caret) {
		const base = parseLoose(caret[1] ?? '');
		if (!base) return undefined;
		const upper: Version =
			base.major > 0
				? { major: base.major + 1, minor: 0, patch: 0 }
				: base.minor > 0
					? { major: 0, minor: base.minor + 1, patch: 0 }
					: { major: 0, minor: 0, patch: base.patch + 1 };
		return (version) => compareVersions(version, base) >= 0 && compareVersions(version, upper) < 0;
	}
	const tilde = /^~(.+)$/.exec(token);
	if (tilde) {
		const base = parseLoose(tilde[1] ?? '');
		if (!base) return undefined;
		const upper: Version = { major: base.major, minor: base.minor + 1, patch: 0 };
		return (version) => compareVersions(version, base) >= 0 && compareVersions(version, upper) < 0;
	}
	const cmp = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
	if (!cmp) return undefined;
	const operator = cmp[1] ?? '=';
	const bound = parseVersion(cmp[2] ?? '');
	if (!bound) return undefined;
	switch (operator) {
		case '>=':
			return (version) => compareVersions(version, bound) >= 0;
		case '>':
			return (version) => compareVersions(version, bound) > 0;
		case '<=':
			return (version) => compareVersions(version, bound) <= 0;
		case '<':
			return (version) => compareVersions(version, bound) < 0;
		default:
			return (version) => compareVersions(version, bound) === 0;
	}
}

/** Whether `version` satisfies `range`; `false` for anything unreadable. */
export function satisfiesRange(version: string, range: string): boolean {
	const parsed = parseVersion(version);
	if (!parsed) return false;
	const alternatives = range.split('||').map((part) => part.trim());
	for (const alternative of alternatives) {
		const tokens = alternative.split(/\s+/).filter((token) => token !== '');
		const comparators = tokens.length === 0 ? [comparatorFor('*')] : tokens.map(comparatorFor);
		if (comparators.some((comparator) => comparator === undefined)) return false;
		if (comparators.every((comparator) => comparator!(parsed))) return true;
	}
	return false;
}
