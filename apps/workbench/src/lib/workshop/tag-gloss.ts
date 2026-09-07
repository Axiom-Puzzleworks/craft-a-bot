/**
 * **What an internal tag means to a reader** (UX-16, `docs/manual/UX-AND-GAPS.md`,
 * 2026-09-07). Scenarios carry two kinds of tag: obligation tags
 * (`fca:cobs-9:suitability`), which a conduct reviewer recognises, and
 * references into `19-AI-SAFETY-GOVERNANCE-REFERENCE.md`'s control catalogue
 * (`19/#25`), which nobody outside the repo does. The raw id stays — it is
 * what campaigns filter on and what the design documents cite — and the
 * screen shows the control's own name beside it.
 *
 * Only the rows a pack actually tags are listed; an unglossed tag renders as
 * itself, so a new tag is never hidden by a missing entry.
 */
const CONTROL_NAMES: Readonly<Record<string, string>> = {
	'19/#11': 'the lethal trifecta',
	'19/#12': 'indirect prompt injection',
	'19/#25': 'policy compliance under pressure',
	'19/#38': 'MCP security'
};

const CONTROL_TAG = /^19\/#(\d+)$/;

export interface TagGloss {
	/** The tag as written on the scenario. */
	raw: string;
	/** What the screen shows. */
	label: string;
	/** The longer form for a tooltip, when there is one. */
	title?: string;
}

/** The tag as a reader should see it: the control's name for a catalogue reference, the tag itself otherwise. */
export function glossTag(tag: string): TagGloss {
	const match = CONTROL_TAG.exec(tag);
	if (!match) return { raw: tag, label: tag };
	const name = CONTROL_NAMES[tag];
	return name
		? { raw: tag, label: name, title: `control ${match[1]} in the governance reference (${tag})` }
		: {
				raw: tag,
				label: `control ${match[1]}`,
				title: `control ${match[1]} in the governance reference (${tag})`
			};
}

/** Every tag glossed, for a text cell. */
export function glossTags(tags: readonly string[]): string {
	return tags.map((tag) => glossTag(tag).label).join(' · ');
}
