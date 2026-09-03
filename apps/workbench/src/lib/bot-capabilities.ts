/**
 * "What a bot can do" moved into `@craftabot/core` as `capabilitiesOf` (WP36
 * stage B, `26-TARGET-DESIGN-V3.md` §6.14): it only ever read a bot through
 * core's own machinery, and the safety case — which a headless host must be
 * able to produce — depends on it. Re-exported here for one release.
 */
export { capabilitiesOf, offers, type BotCapabilities } from '@craftabot/core';
