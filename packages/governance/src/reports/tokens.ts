/**
 * The colour tokens the standalone HTML renderings inline — in a module of their own so the story (which only needs these) does not pull the whole assurance renderer into the Run Lab's route (WP161).
 */
/** The app's colour tokens, inlined (`apps/workbench/src/lib/styles/tokens.css`; a test keeps them equal). */
export const ASSURANCE_TOKENS: Readonly<Record<string, string>> = {
	cream: '#f3e9d2',
	paper: '#efe3c8',
	ink: '#2b2620',
	'ink-muted': '#5c5348',
	blue: '#2456a6',
	'blue-text': '#1c4485',
	red: '#c93a2e',
	'red-text': '#a72e24',
	green: '#4e8a3c',
	'green-text': '#3a6e2c',
	yellow: '#e9b62f',
	teal: '#3e8f8a'
};
