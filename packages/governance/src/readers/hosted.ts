import type {
	EgressDeclaration,
	Reader,
	ReaderResponse,
	TypedAnswer,
	TypedQuestion
} from '@craftabot/core';

/** A hosted reader's definition: who it is, the line and operation it asks, and how to build the line's arguments. */
export interface HostedReaderOptions {
	/** Qualified like every pack contribution: `typesafe/reader/jev`. */
	id: string;
	name: string;
	description: string;
	lineId: string;
	operation: string;
	/** The line's arguments for a subject and its questions — exactly what the line was recorded with. */
	request: (subject: unknown, questions: Record<string, TypedQuestion>) => unknown;
	egress: EgressDeclaration[];
	credential?: Reader['credential'];
	browserCapable?: boolean;
	answers?: Reader['answers'];
}

interface WireAnswer {
	type?: string;
	choice?: string;
	noul?: number;
	score?: number;
	probabilities?: Record<string, number> | number[];
	confidence?: number | null;
}

/**
 * **A service line as a reader** (WP120, `104-READERS.md` §10.3): the line's
 * operation takes a state and typed questions and answers in Jev's wire
 * shape — TypeSafe's System One, and the DGX classifier that copies it. The
 * reader asks it through `ctx.callLine`, which the runtime points at the
 * same synthesised tool a `line` stage calls, so a cassette replays exactly
 * as it did and a live line goes through the session's guarded fetch. A
 * choice and a noul pass through; a score's probabilities, keyed by level
 * index on the wire, become the contract's array.
 */
export function hostedReader(options: HostedReaderOptions): Reader {
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		kind: 'hosted',
		egress: options.egress,
		...(options.credential ? { credential: options.credential } : {}),
		browserCapable: options.browserCapable ?? false,
		answers: options.answers ?? ['choice', 'noul', 'score'],
		async ask(subject, questions, ctx): Promise<ReaderResponse> {
			if (!ctx.callLine) throw new Error(`${options.id} needs a host that calls service lines`);
			const result = await ctx.callLine(
				options.lineId,
				options.operation,
				options.request(subject, questions)
			);
			if (!result.ok) throw new Error(`${options.lineId} answered: ${result.output}`);
			const data = result.data as { model?: unknown; answers?: Record<string, WireAnswer> };
			if (typeof data?.model !== 'string' || !data.answers)
				throw new Error(`${options.lineId} answered off the contract`);
			const answers: Record<string, TypedAnswer> = {};
			for (const [id, wire] of Object.entries(data.answers)) answers[id] = fromWire(id, wire);
			return { model: data.model, method: 'hosted', answers };
		}
	};
}

function fromWire(id: string, wire: WireAnswer): TypedAnswer {
	switch (wire.type) {
		case 'choice':
			return {
				type: 'choice',
				choice: String(wire.choice),
				probabilities: (wire.probabilities ?? {}) as Record<string, number>,
				confidence: wire.confidence ?? null
			};
		case 'noul':
			return { type: 'noul', noul: Number(wire.noul) };
		case 'score': {
			const byLevel = wire.probabilities ?? [];
			const probabilities = Array.isArray(byLevel)
				? byLevel
				: Object.keys(byLevel)
						.sort((a, b) => Number(a) - Number(b))
						.map((level) => byLevel[level]!);
			return {
				type: 'score',
				score: Math.round(Number(wire.score)),
				probabilities,
				confidence: wire.confidence ?? null
			};
		}
		default:
			throw new Error(`the answer to "${id}" has no type the contract knows`);
	}
}
