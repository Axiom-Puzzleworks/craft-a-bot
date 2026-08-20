import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';
import { BOOKS, searchBook, type BookId } from '../world/bookshelf.js';

/**
 * The Librarian brick's own tools (WP32 stage A, `14-…` §5.5) — one per book
 * in `BOOKS`, not one tool with a `book` argument.
 *
 * `contributeCalls` offers the whole *set* of a bot's tools, filtered to
 * whatever it names (`brick-kinds.ts`'s own `librarianBrickKind`) — the same
 * mechanism the Tools brick's `enabled` list already uses to pick a subset
 * of a fixed catalogue. A single `ask_the_library(book, query)` tool would
 * put the scoping decision inside `execute()`, which has no way to see which
 * brick offered the call or what it was configured with (`ToolContext`
 * carries only `tick`/`notebook`/`random` — nothing brick-specific, by
 * design, since tools are registered once, pack-wide, shared by every bot
 * that has one fitted). One tool per book means the scoping already
 * happened by the time a model ever sees a tool name: a book not on the
 * shelf is a tool that was never offered, not a request an argument check
 * has to refuse.
 */
const argsSchema = z.object({
	query: z.string().min(1).describe(toolStrings.library.query)
});

function libraryTool(bookId: BookId, title: string): ToolDefinition {
	return {
		id: `starter/library_${bookId}`,
		name: toolStrings.library.name(title),
		description: toolStrings.library.description(title),
		parameters: z.toJSONSchema(argsSchema),
		riskTier: 'observe',
		execute(rawArgs) {
			const parsed = argsSchema.safeParse(rawArgs ?? {});
			if (!parsed.success) {
				return { ok: false, output: toolStrings.library.badArgs };
			}
			const entries = searchBook(bookId, parsed.data.query);
			if (entries.length === 0) {
				return {
					ok: true,
					output: toolStrings.library.nothingFound(title, parsed.data.query),
					data: { book: bookId, query: parsed.data.query, entries: [] }
				};
			}
			return {
				ok: true,
				output: entries.map((entry) => entry.text).join(' '),
				data: { book: bookId, query: parsed.data.query, entries: entries.map((entry) => entry.id) }
			};
		}
	};
}

export const libraryTools: ToolDefinition[] = BOOKS.map((book) => libraryTool(book.id, book.title));
