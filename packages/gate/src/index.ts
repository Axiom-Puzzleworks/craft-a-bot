/**
 * **`@craftabot/gate`** (WP127, `107-THE-GATE.md`): a Craft A Bot stack over
 * the OpenAI chat-completions wire, in front of any agent. A reference
 * implementation — unauthenticated, loopback by default, in memory.
 */
export {
	GATE_SPEC,
	createGate,
	type EchoedVerdict,
	type Gate,
	type GateMode,
	type GateOptions,
	type GateReply
} from './gate.js';
export { GATE_CONTENT, GATE_PRESETS, NO_OUTSIDE_MAIL_CARD } from './presets.js';
export { assertBindable, serveGate, type ServeOptions } from './server.js';
export { parseStackFile } from './stack-file.js';
export {
	fromChatMessages,
	fromChatResponse,
	toChatMessages,
	toChatResponse,
	wireRequestSchema,
	wireResponseSchema,
	type WireMessage,
	type WireRequest,
	type WireResponse
} from './wire.js';
