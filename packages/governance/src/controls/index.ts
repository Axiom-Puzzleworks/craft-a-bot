/**
 * **Controls** (WP132, `110-CONTROL-SUITE-PLAN.md` §4): the declared
 * mechanisms and the resolution of a control reference — what the
 * catalogue's `implementedBy` and the Control Inventory cite.
 */
export { CONTROL_MECHANISMS, getControlMechanism, type ControlMechanism } from './mechanisms.js';
export {
	REGISTERED_REF_KINDS,
	resolveControlRef,
	type ControlRefOptions,
	type ControlRefRegistry
} from './refs.js';
