/**
 * "The Encyclopedia of the Playroom" — the small body of world knowledge the
 * `look_up_manual` tool queries (02-AGENT-MODEL.md §2.3). It teaches retrieval:
 * facts the model cannot know from its training, only by looking them up.
 *
 * The data lives here in WP2 because it is world knowledge; the tool that reads
 * it is wired up with the rest of the Tools brick in a later work package.
 */

export type ManualEntry = {
	id: string;
	/** Words that should match this entry, lower-case. */
	keywords: string[];
	text: string;
};

export const playroomManual: ManualEntry[] = [
	{
		id: 'toy-chest',
		keywords: ['chest', 'toy chest', 'lid', 'locked', 'lock', 'padlock'],
		text: 'The toy chest has a chunky padlock on it. The red key opens it — you must be carrying the red key before the lid will lift.'
	},
	{
		id: 'red-key',
		keywords: ['key', 'red key'],
		text: 'The red key is bright red and hard to miss, though it has a habit of ending up in corners of the room.'
	},
	{
		id: 'carrying',
		keywords: ['carry', 'carrying', 'hands', 'hold', 'holding'],
		text: 'You have one pair of hands, so you can carry exactly one thing at a time. Put something down before you pick something else up.'
	},
	{
		id: 'reach',
		keywords: ['reach', 'far', 'distance', 'next to', 'adjacent'],
		text: 'You can reach anything in your own square or the eight squares around it — the same squares you can see.'
	},
	{
		id: 'teddy',
		keywords: ['teddy', 'bear'],
		text: 'Teddy sits patiently and does not move about. Teddy likes snacks and being talked to.'
	},
	{
		id: 'table',
		keywords: ['table', 'snack', 'biscuit', 'food'],
		text: 'The low round table is where snacks get left. You cannot stand on the table, but you can reach across it.'
	},
	{
		id: 'shelf',
		keywords: ['shelf', 'shelves'],
		text: 'The low shelf is where the blocks are meant to live when they are not all over the rug.'
	},
	{
		id: 'blocks',
		keywords: ['block', 'blocks', 'letter block'],
		text: 'There are three letter blocks: a red C, a blue A, and a yellow B. Tidying means all three go inside the toy chest.'
	},
	{
		id: 'ball',
		keywords: ['ball'],
		text: 'The stripy ball is just a ball. It is not part of any job you have been given.'
	}
];

/** Case-insensitive keyword match; returns every entry whose keywords appear in the query. */
export function searchManual(query: string): ManualEntry[] {
	const needle = query.toLowerCase();
	return playroomManual.filter((entry) =>
		entry.keywords.some((keyword) => needle.includes(keyword))
	);
}
