/**
 * **How the wave 1 art gets onto the page** (`22-…` §5, `20-…` §3).
 *
 * The assets are imported as markup rather than as URLs because the delivery
 * contract is built on things an `<img src>` cannot reach: named groups
 * (`#face-slot`, `#icon-slot`, `#state-*`, `#emboss`), baked layers that the app
 * switches between, and a `--part-tint` custom property it inherits from the
 * page. Inline, or the contract is decoration.
 *
 * Inlining the same file twice is the catch. A shelf of six bots is six
 * `box-sticker`s and a badge sheet is seven rosettes, so a document that keeps
 * the delivered ids would carry seven elements called `#emboss` — invalid, and
 * the kind of invalid that only bites later, through `getElementById` or an
 * `aria-labelledby` that resolves to somebody else's badge.
 *
 * So **the ids are the delivery interface, not the runtime one.** Every `id`
 * becomes a `data-part` on the way in. Nothing is lost — no delivered asset
 * refers to an id internally, which this module checks rather than assumes —
 * and the code interface survives the translation: a test still asks for
 * `[data-part="state-open"]`, and it can ask a page with twenty rosettes on it.
 *
 * The two mechanisms that need the ids are done here, in string form, rather
 * than through CSS or the DOM:
 *
 * - **Variants** (`variants`) pick which baked layer paints. CSS could do it,
 *   but only by enumerating every state in a `:global` block — the styles of a
 *   component reaching into markup it did not write.
 * - **Slots** (`slots`) put one asset inside another. A face is a whole `<svg>`
 *   dropped into the pose's `#face-slot` group: nested SVG carries its own
 *   viewBox, so the composition needs no coordinate arithmetic and cannot drift
 *   from `SLOT_ORIGINS`, which is stamped into the file as a `transform`.
 */

/** The opening `<svg …>` tag and its attributes — the outermost one only. */
const ROOT = /^<svg\b([^>]*)>/;

export interface InlineOptions {
	/**
	 * Which baked layer of each variant group paints, keyed by id prefix:
	 * `{ state: 'open' }` shows `#state-open` and hides its siblings. A value
	 * matching nothing hides them all, which is how an unearned rosette is drawn.
	 */
	variants?: Record<string, string>;
	/** Markup to place inside a named empty group, keyed by its id. */
	slots?: Record<string, string>;
	/**
	 * Width and height for the root, in the asset's own units. Omitted, the root
	 * loses both and is sized by CSS — which is what a scene wants. Given, the
	 * asset renders at a fixed size, which is what a *nested* one needs: a slot's
	 * contents have no CSS box to be sized by.
	 */
	size?: number;
	/** Root attributes, added or replaced. `undefined` removes one. */
	attrs?: Record<string, string | number | undefined>;
}

/**
 * Compose one asset's markup for the DOM.
 *
 * Order matters: variants and slots are chosen while the ids are still ids,
 * then every id becomes a `data-part`, then the root is dressed. Slot contents
 * arriving already inlined pass through the id sweep untouched, which is why
 * nesting composes rather than needing a second code path.
 */
export function inlineSvg(source: string, options: InlineOptions = {}): string {
	assertNoInternalReferences(source);

	let svg = source;
	for (const [prefix, chosen] of Object.entries(options.variants ?? {})) {
		svg = selectVariant(svg, prefix, chosen);
	}
	for (const [slot, content] of Object.entries(options.slots ?? {})) {
		svg = fillSlot(svg, slot, content);
	}
	svg = svg.replace(/\bid="([^"]*)"/g, 'data-part="$1"');
	return dressRoot(svg, options);
}

/**
 * An asset that refers to one of its own ids — a gradient, a clip path, a
 * `<use>` — cannot survive the rename, and would fail by rendering *almost*
 * right. Wave 1 contains none, and a later wave that does should discover it
 * here rather than in a screenshot.
 */
function assertNoInternalReferences(svg: string): void {
	const reference = /(url\(#|xlink:href="#|\shref="#)/.exec(svg);
	if (reference) {
		throw new Error(
			`this asset refers to one of its own ids (${reference[1]}), which inlining rewrites — see lib/assets/inline.ts`
		);
	}
}

/**
 * Show one member of a variant group and hide the rest.
 *
 * The delivered files ship the unselected layers with `display="none"` already,
 * so this mostly confirms what is there — but it must also be able to *unhide*,
 * because the file's default is only ever one of the states.
 */
function selectVariant(svg: string, prefix: string, chosen: string): string {
	const group = new RegExp(`<g\\b([^>]*\\bid="${prefix}-([\\w-]+)"[^>]*?)>`, 'g');
	let found = 0;
	const out = svg.replace(group, (_match, attrs: string, name: string) => {
		found += 1;
		const bare = attrs.replace(/\s+display="none"/, '');
		return name === chosen ? `<g${bare}>` : `<g${bare} display="none">`;
	});
	if (found === 0) throw new Error(`this asset has no #${prefix}-* layers to choose between`);
	return out;
}

/**
 * Put `content` inside the empty group called `slot`.
 *
 * Loud on a miss. A slot that is not there means the art and the code have
 * drifted apart, and drawing a bot with no face is a worse outcome than not
 * drawing one at all.
 */
function fillSlot(svg: string, slot: string, content: string): string {
	const empty = new RegExp(
		`<g\\b([^>]*\\bid="${slot}"[^>]*?)\\s*/>|<g\\b([^>]*\\bid="${slot}"[^>]*)></g>`
	);
	const match = empty.exec(svg);
	if (!match) throw new Error(`this asset has no empty #${slot} to fill`);
	// A function replacer: `$&` and friends in SVG path data would otherwise be
	// read as substitution patterns.
	return svg.replace(empty, () => `<g${match[1] ?? match[2] ?? ''}>${content}</g>`);
}

/** Size the root and set its attributes, leaving everything nested alone. */
function dressRoot(svg: string, { size, attrs }: InlineOptions): string {
	const wanted: Record<string, string | number | undefined> = {
		// Decorative by default: every asset in this app sits beside words that
		// carry the same information, and a picture that repeats them is noise in
		// a screen reader. A caller that means the picture *to be* the information
		// passes its own role and label.
		'aria-hidden': 'true',
		// Keeps the shape out of the tab order in browsers that still put it there.
		focusable: 'false',
		width: size,
		height: size,
		...attrs
	};

	return svg.replace(ROOT, (_match, raw: string) => {
		let kept = raw;
		for (const name of Object.keys(wanted)) {
			kept = kept.replace(new RegExp(`\\s+${name}="[^"]*"`), '');
		}
		const added = Object.entries(wanted)
			.filter(([, value]) => value !== undefined)
			.map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`)
			.join('');
		return `<svg${kept}${added}>`;
	});
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
