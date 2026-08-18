import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse.js';

/**
 * Network chunks split wherever they like. These are the awkward splits that
 * would otherwise only show up under load.
 */

function frames(parser: ReturnType<typeof createSseParser>, chunks: string[]): string[] {
	const out: string[] = [];
	for (const chunk of chunks) out.push(...parser.push(chunk).map((frame) => frame.data));
	out.push(...parser.flush().map((frame) => frame.data));
	return out;
}

describe('the SSE parser', () => {
	it('reads whole frames from one chunk', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: {"a":1}\n\ndata: {"a":2}\n\n'])).toEqual(['{"a":1}', '{"a":2}']);
	});

	it('reassembles a frame split across chunks', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: {"a', '":1}\n', '\n'])).toEqual(['{"a":1}']);
	});

	it('reassembles a frame split mid-separator', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: {"a":1}\n', '\ndata: {"a":2}\n\n'])).toEqual([
			'{"a":1}',
			'{"a":2}'
		]);
	});

	it('handles one byte at a time', () => {
		const parser = createSseParser();
		const stream = 'data: {"a":1}\n\ndata: {"a":2}\n\n';
		expect(frames(parser, [...stream])).toEqual(['{"a":1}', '{"a":2}']);
	});

	it('accepts CRLF line endings', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: {"a":1}\r\n\r\n'])).toEqual(['{"a":1}']);
	});

	it('ignores comment keep-alives', () => {
		const parser = createSseParser();
		expect(frames(parser, [': keep-alive\n\ndata: {"a":1}\n\n'])).toEqual(['{"a":1}']);
	});

	it('ignores fields other than data — including Anthropic’s own event: line', () => {
		const parser = createSseParser();
		expect(frames(parser, ['event: content_block_delta\nid: 7\ndata: {"a":1}\n\n'])).toEqual([
			'{"a":1}'
		]);
	});

	it('joins a multi-line data field, per the SSE spec', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: line one\ndata: line two\n\n'])).toEqual(['line one\nline two']);
	});

	it('treats [DONE] as end of stream, not as data — unused by Anthropic, still honoured', () => {
		const parser = createSseParser();
		const result = frames(parser, ['data: {"a":1}\n\ndata: [DONE]\n\n']);
		expect(result).toEqual(['{"a":1}']);
		expect(parser.done).toBe(true);
	});

	it('flushes a final frame with no trailing blank line', () => {
		const parser = createSseParser();
		expect(frames(parser, ['data: {"a":1}'])).toEqual(['{"a":1}']);
	});

	it('is not done at message_stop — Anthropic ends the stream by closing the body, not a sentinel', () => {
		const parser = createSseParser();
		parser.push('data: {"type":"message_stop"}\n\n');
		expect(parser.done).toBe(false);
	});

	it('produces nothing from an empty stream', () => {
		const parser = createSseParser();
		expect(frames(parser, ['', '\n\n'])).toEqual([]);
	});
});
