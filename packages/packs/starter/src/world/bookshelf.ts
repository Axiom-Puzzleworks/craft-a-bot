/**
 * The Library — a second, bigger body of world knowledge alongside "The
 * Encyclopedia of the Playroom" (`manual.ts`), for the Librarian brick
 * (WP32, `14-…` §5.5).
 *
 * Deliberately a separate file and a separate array from `manual.ts`, not an
 * extension of it: `playroomManual` is already load-bearing for the Tools
 * brick's own `look_up_manual` and, through it, the locked-chest cards and
 * the indirect-injection lesson (`19-…` #12) — entries a bot can reach with
 * no Librarian fitted at all. Splitting the books out keeps every one of
 * those untouched, and keeps a book's own content genuinely *scoped*: a bot
 * only sees what `books` names, because nothing here is reachable except
 * through a book-specific tool built from this file (`tools/library.ts`).
 *
 * `BOOKS` is a small, fixed catalogue — new books are added here, not
 * invented by a builder — the same closed shape `tools`' own `enabled` list
 * and `senses`' own `channels` list already use for "which of the known
 * things do you want."
 */

export type BookId = 'games' | 'history';

export interface BookEntry {
	id: string;
	book: BookId;
	/** Words that should match this entry, lower-case. */
	keywords: string[];
	text: string;
}

export const BOOKS: readonly { id: BookId; title: string }[] = [
	{ id: 'games', title: 'Playroom Games' },
	{ id: 'history', title: 'Playroom History' }
];

export const bookshelf: BookEntry[] = [
	{
		id: 'hide-and-seek',
		book: 'games',
		keywords: ['hide', 'hide and seek', 'seek', 'hiding'],
		text: 'Hide and seek works best behind the shelf — it is the one thing in the room tall enough to hide behind.'
	},
	{
		id: 'counting-game',
		book: 'games',
		keywords: ['counting', 'count', 'number game'],
		text: 'The counting game: line the three letter blocks up in a row and count them out loud, red first, then blue, then yellow.'
	},
	{
		id: 'peekaboo',
		book: 'games',
		keywords: ['peekaboo', 'peek-a-boo', 'teddy game', "teddy's favourite"],
		text: "Teddy's favourite game is peekaboo — cover your eyes, count to three, and Teddy will wait for you every time."
	},
	{
		id: 'chest-story',
		book: 'history',
		keywords: ['chest history', 'old chest', 'where the chest came from', 'chest story'],
		text: 'The toy chest is older than the rest of the room — it came first, and everything else was arranged around it.'
	},
	{
		id: 'blocks-story',
		book: 'history',
		keywords: ['why letters', 'blocks story', 'letter blocks history'],
		text: 'The letter blocks are marked with the first letters of the room’s first three toys, long since put away — nobody remembers which any more.'
	},
	{
		id: 'ball-story',
		book: 'history',
		keywords: ['ball story', 'stripy ball history', 'where the ball came from'],
		text: 'The stripy ball has always just been there, as far as anyone in this room can say.'
	}
];

/** Case-insensitive keyword match, scoped to one book. */
export function searchBook(book: BookId, query: string): BookEntry[] {
	const needle = query.toLowerCase();
	return bookshelf.filter(
		(entry) => entry.book === book && entry.keywords.some((keyword) => needle.includes(keyword))
	);
}
