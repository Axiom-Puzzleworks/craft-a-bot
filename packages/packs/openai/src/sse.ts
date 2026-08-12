/**
 * Incremental Server-Sent Events parsing (06-LLM-PROVIDERS.md §4).
 *
 * Pure on purpose: no `fetch`, no streams, just text in and frames out. Network
 * chunks split wherever TCP feels like it — mid-frame, mid-JSON, between the
 * `data:` and its payload — and getting that wrong produces corruption that
 * only shows up under load. Keeping it a pure function means every awkward
 * split is an ordinary unit test.
 */

/** OpenAI's end-of-stream sentinel. */
export const DONE = '[DONE]';

export interface SseFrame {
	/** Raw payload after `data: `. `[DONE]` is surfaced as `done`, not as data. */
	data: string;
}

export interface SseParser {
	/** Feed a chunk; get back whatever complete frames it completed. */
	push(chunk: string): SseFrame[];
	/** Flush anything left when the stream ends without a trailing blank line. */
	flush(): SseFrame[];
	/** True once `[DONE]` has been seen. */
	readonly done: boolean;
}

export function createSseParser(): SseParser {
	let buffer = '';
	let done = false;

	function drain(final: boolean): SseFrame[] {
		const frames: SseFrame[] = [];

		// Events are separated by a blank line; tolerate CRLF as well as LF.
		let separator = findSeparator(buffer);
		while (separator) {
			const block = buffer.slice(0, separator.index);
			buffer = buffer.slice(separator.index + separator.length);
			const frame = parseBlock(block);
			if (frame) {
				if (frame.data === DONE) done = true;
				else frames.push(frame);
			}
			separator = findSeparator(buffer);
		}

		if (final && buffer.trim() !== '') {
			const frame = parseBlock(buffer);
			buffer = '';
			if (frame) {
				if (frame.data === DONE) done = true;
				else frames.push(frame);
			}
		}
		return frames;
	}

	return {
		push(chunk) {
			buffer += chunk;
			return drain(false);
		},
		flush() {
			return drain(true);
		},
		get done() {
			return done;
		}
	};
}

function findSeparator(text: string): { index: number; length: number } | undefined {
	const lf = text.indexOf('\n\n');
	const crlf = text.indexOf('\r\n\r\n');
	if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
	if (lf !== -1) return { index: lf, length: 2 };
	return undefined;
}

/**
 * One event block into a frame. Comment lines (`:` keep-alives) and any field
 * that is not `data` are ignored — we only care about payloads. Multi-line
 * `data:` fields are joined with newlines, per the SSE spec.
 */
function parseBlock(block: string): SseFrame | undefined {
	const dataLines: string[] = [];
	for (const rawLine of block.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (line === '' || line.startsWith(':')) continue;
		if (!line.startsWith('data:')) continue;
		dataLines.push(line.slice('data:'.length).trimStart());
	}
	if (dataLines.length === 0) return undefined;
	return { data: dataLines.join('\n') };
}
