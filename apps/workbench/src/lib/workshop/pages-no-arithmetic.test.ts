import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **Every number is a call** (WP88, `79-CONDUCT-AND-MODEL-RISK.md` §2): the
 * Conduct and Model-risk pages hold no arithmetic — every rate, spread,
 * interval and share is the report's own row or a call into
 * `@craftabot/metrics` through `lib/workshop/conduct.ts` and
 * `lib/workshop/model-risk.ts`. The instruments' rule (`44-…` principle 2),
 * applied to a page: the script block is grepped for an arithmetic operator
 * between two operands and finds none.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = ['conduct', 'model-risk', 'experiments'].map((route) =>
	join(HERE, '..', '..', 'routes', 'workshop', route, '+page.svelte')
);

/** `a * b`, `a / b`, `a % b`, `a + b`, `a - b` — an operator with whitespace either side, an operand on each. */
const ARITHMETIC = /[\w)\]]\s+[*/%+-]\s+[\w($]/;

describe('the Conduct, Model-risk and Experiments pages', () => {
	it.each(PAGES)('%s holds no arithmetic in its script', (path) => {
		const source = readFileSync(path, 'utf8');
		const script = source.slice(source.indexOf('<script'), source.indexOf('</script>'));
		const offenders = script
			.split('\n')
			.map((line, index) => ({ line: line.trim(), index: index + 1 }))
			.filter(({ line }) => !line.startsWith('*') && !line.startsWith('//'))
			.filter(({ line }) => ARITHMETIC.test(line));
		expect(offenders).toEqual([]);
	});
});
