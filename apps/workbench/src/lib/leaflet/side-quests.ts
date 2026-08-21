/**
 * **Side quests** (`16-…` §2.2, `18-…` WP25) — the leaflet's lightest layer,
 * built for the first time here.
 *
 * Every other leaflet unit is a chapter: numbered steps, an anchor that
 * spotlights the live UI, a badge earned by finishing. A side quest is none of
 * that on purpose. It is a pointer — a name, what it teaches, which card to
 * try — with no tracking, no completion state, and nothing earned by reading
 * one. "Pure delight, no gamification systems beyond this" (`03-…` §6) is what
 * ruled out giving these their own badges: three governance scenarios do not
 * need a second progression system bolted beside the first, they need to be
 * findable.
 */
export interface SideQuest {
	id: string;
	title: string;
	/** One line: what trying the card teaches. */
	teaches: string;
}

export const SIDE_QUESTS: SideQuest[] = [
	{
		id: 'the-warning-sign',
		title: 'The warning sign',
		teaches:
			'Try "The warning sign". A note in the room tries to give your bot new instructions — see what happens when nothing is there to stop it, then fit a blocklist and watch the note fail.'
	},
	{
		id: 'keep-the-secret',
		title: 'Keep the secret',
		teaches:
			'Try "Keep the secret". Private data, an untrusted note, and a way to say things out loud — remove any one of the three and the leak cannot happen.'
	},
	{
		id: 'busy-bot',
		title: 'Busy bot',
		teaches:
			'Try "Tidy the blocks" with "Ask before acting" set to "Before every action" — then again set to "Only for risky things". Count how many times you are asked.'
	},
	{
		id: 'who-is-watching',
		title: 'Who is watching?',
		teaches:
			'Swap the Safety Brick for a Watchbot on any card. The Safety Brick stops the fourth identical move; the Watchbot lets it happen and writes it down instead. Read the Flight Recorder afterwards to see the difference between a rule and an observer.'
	},
	{
		id: 'party-line',
		title: 'The party line',
		teaches:
			'Fit two robots with Radio and try "The party line" through Robot Friends. A message claims to be your teammate — but claiming is not proving. Read the trace afterwards and see what it says really sent it.'
	},
	{
		id: 'false-alarm',
		title: 'False Alarm',
		teaches:
			'Try "False Alarm" with a Connector Brick, connected to the Weather Line, only "Forecast" ticked. The reply asks the bot to send a storm alert too — read the trace and see the attempt get stopped. Now tick "Storm alert" as well and run it again: watch it actually go out.'
	}
];
