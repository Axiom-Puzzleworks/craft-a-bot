import type { BrickKindDefinition } from './brick.js';
import type { EgressDeclaration } from './guardrail-service.js';
import type { QuestionType, ReaderResponse, TypedQuestion } from '../schemas/reader.js';

/**
 * **A reader** (WP117, `104-READERS.md` §3.3; `100-TARGET-DESIGN-V7.md` §6.3,
 * D16): anything that answers typed questions about a subject — a desk's
 * rule, a hosted classifier over a service line, a chat model, a person. The
 * stage does not care which: a `reader` executor asks, a gate reads the
 * confidence, and the record says who answered and how. Registered content
 * (`PackManifest.readers`); the adapters that build one live in
 * `@craftabot/governance` (`readers/*`).
 *
 * A reader never reads truth. It sees the subject its executor shows it.
 */
export interface Reader {
	/** Qualified like every pack contribution: `fs-servicing/reader/category`. */
	id: string;
	name: string;
	description: string;
	kind: 'rule' | 'hosted' | 'llm' | 'human';
	/** The hosts it calls; empty for a rule. */
	egress: EgressDeclaration[];
	credential?: BrickKindDefinition['credential'];
	/** Whether it can run in the Workbench (a hosted reader behind CORS cannot). */
	browserCapable: boolean;
	/** The question types it answers; a stage asking another is refused before it asks. */
	answers: QuestionType[];
	ask(
		subject: unknown,
		questions: Record<string, TypedQuestion>,
		ctx: ReaderContext
	): Promise<ReaderResponse>;
	/** A stand-in that answers with no network, for CI and the offline edition. */
	createOffline?(): Reader;
}

export interface ReaderContext {
	/** The session's egress-guarded fetch; a rule never uses it. */
	fetch?: typeof fetch;
	/** The credential the reader declared, read by the host at call time — never recorded. */
	credential?: string;
	signal?: AbortSignal;
}
