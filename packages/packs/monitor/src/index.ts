import { z } from 'zod';
import type { BrickKindDefinition, PackManifest } from '@craftabot/core';
import { MONITOR_RULE_IDS, MONITOR_RULE_LABELS, isMonitorRule, rulesFor } from './rules.js';
export {
	GROUP_CIRCUIT_BREAKER_ID,
	createGroupCircuitBreaker,
	createGroupWatchbot,
	type GroupWatchbot,
	type GroupWatchbotOptions
} from './rules.js';

/**
 * **`@craftabot/pack-monitor` — the Watchbot** (`14-…` §5.3).
 *
 * The WP14 definition of done, and the only part of it that is not a change to
 * something already here: *"a Monitor-brick prototype builds against the
 * contract with no core edits."*
 *
 * This package is that prototype, and it is deliberately a **separate
 * workspace package** rather than a fixture tucked inside `pack-starter` or
 * `core`. A fixture living next to the thing it tests can lean on internals
 * without anyone noticing; a package can only reach what `@craftabot/core`
 * actually exports. If the contract were not open, this would not compile.
 *
 * What it proves, end to end and in one artefact:
 *
 * - a pack registers **a new kind of brick** — not a tool, world or cartridge,
 *   which packs could always do, but a genuinely new *kind of part*;
 * - the brick **contributes policy** through `contributeGuardrails` (slice 3d),
 *   which is what a Monitor is for and what no brick but `starter/safety` could
 *   do before;
 * - it **validates its own config** through `validateConfig` (slice 3d), since
 *   core has no idea what a monitor rule id is;
 * - it **describes itself** to the bot through `describeFitted` (slice 3a);
 * - it **draws its own controls** from `configSchema` + `controlHints`, with no
 *   hand-written panel anywhere (slice 4a);
 * - and it **reaches the tray, the socket and the trace** with nothing in the
 *   workbench written for it (slice 4b).
 *
 * It is **not** in `installedPacks`. Shipping a seventh brick would change what
 * V1.0 *is* — six bricks, six chapters, one teaching arc — and expansion packs
 * are Phase E work (`18-…` §3). This exists to prove the contract, and it is
 * exercised by tests that install it exactly as the workbench would.
 *
 * Note what this pack does **not** depend on: `@craftabot/governance`. The
 * starter pack composes its rules from governance's factories, which is the
 * sensible thing when the mechanism already exists. A Monitor's rules are its
 * own, written straight against core's `Guardrail` interface — so this also
 * proves a pack can bring genuinely new policy, not merely re-dial somebody
 * else's.
 */

/**
 * What a Watchbot is set to watch for.
 *
 * `z.array(z.string())` rather than an enum of the known ids, deliberately: an
 * id from a *newer* version of this pack should parse and then be reported by
 * `validateConfig` as "this workbench has not got that rule", which is a
 * warning the builder can act on. An enum would fail the whole config instead,
 * and `bad-brick-config` blocks GO — a bot that could have run with two of its
 * three watches would refuse to start at all.
 */
export const watchbotConfigSchema = z.object({
	watchFor: z.array(z.string().min(1))
});

export type WatchbotConfig = z.infer<typeof watchbotConfigSchema>;

const watchbot: BrickKindDefinition<WatchbotConfig> = {
	id: 'monitor/watchbot',
	slot: 'safety',

	name: 'Watchbot',
	description: 'Watches what your robot does and writes down anything odd.',
	realName: 'Runtime Monitor',
	realExplanation:
		'A read-only observer that reads the agent’s own trace as it runs and raises flags. It never blocks anything — its whole job is to notice, so that somebody can look afterwards. Real systems put a monitor beside an agent for exactly this reason: the agent is judged on what it did, not only on what it was allowed to do.',

	configSchema: watchbotConfigSchema,
	configVersion: 1,
	/** A fresh Watchbot watches for the one thing that is always worth noticing. */
	defaults: { watchFor: ['monitor/going-in-circles'] },

	controlHints: {
		watchFor: {
			control: 'checklist',
			label: 'Watch out for',
			hint: 'The Watchbot never stops your robot — it just makes a note in the trace.',
			options: MONITOR_RULE_IDS.map((id) => ({ value: id, label: MONITOR_RULE_LABELS[id] }))
		}
	},

	describeFitted: (config) =>
		config.watchFor.length > 0 ? 'a watchbot keeping an eye on you' : 'a watchbot, switched off',

	/**
	 * Core cannot check this: it does not know a monitor rule id from any other
	 * string. A warning rather than blocking — the bot runs, watching for the
	 * rules it does recognise, which is better than refusing to start.
	 */
	validateConfig: (config) =>
		config.watchFor
			.filter((id) => !isMonitorRule(id))
			.map((id) => ({
				code: 'bad-brick-config' as const,
				severity: 'warning' as const,
				message: `The Watchbot is set to watch for "${id}", which this workbench does not know how to watch for.`,
				details: { ruleId: id }
			})),

	createRuntime: (config) => ({
		contributeGuardrails: () => rulesFor(config.watchFor)
	})
};

const pack: PackManifest = {
	id: 'monitor',
	name: 'Safety Patrol',
	version: '0.0.1',
	requiresCore: '>=0.0.1',
	brickKinds: [watchbot as BrickKindDefinition]
};

export default pack;
export { watchbot };
export {
	MONITOR_RULE_IDS,
	MONITOR_RULE_LABELS,
	isMonitorRule,
	rulesFor,
	createAllTalkRule,
	createGoingInCirclesRule,
	createRefusalStormRule,
	type MonitorRuleId
} from './rules.js';
