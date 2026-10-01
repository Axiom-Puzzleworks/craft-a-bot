import {
	guardrailCatalogueSchema,
	isReviewed,
	latestReviews,
	type Review,
	type CatalogueEntry,
	type GuardrailCatalogue
} from '@craftabot/core';
import { resolveControlRef, type ControlRefRegistry } from '../controls/refs.js';

/** One problem `checkCatalogue` found with an entry: the check and the message. */
export interface CatalogueIssue {
	/** `catalogue.parses` · `catalogue.cited` · `catalogue.component` · `catalogue.implemented-by` · `catalogue.status` · `catalogue.unique` · `catalogue.review-pending` */
	check: string;
	entryId?: string;
	message: string;
}

/**
 * **`checkCatalogue`** (WP98, `86-CATALOGUE.md` §6; `83-…` §6.4.3): the
 * catalogue is honest or refused. Every entry parses; every entry cites at
 * least one source with a year; every `componentIds` entry resolves to a
 * registered component; a `shipped` entry names at least one component or
 * mechanism; a `not-applicable` entry says why; ids are unique. A `shipped`
 * entry's status is *verified* here, never typed: it is the registry that
 * says the component exists.
 *
 * With `requireReview` (WP129, `108-READINGS.md` §5), an entry still
 * `review: 'pending'` is refused unless a `review` of `catalogue-entry`
 * `<id>` in `reviews` accepts or amends it.
 *
 * Since the second edition (WP132, `110-CONTROL-SUITE-PLAN.md`) every
 * `implementedBy` item is a control reference that must resolve
 * (`resolveControlRef`): a registered card, evaluator, reader, scenario or
 * stack, a guardrail id, a gate kind, an event type, an artefact, or a
 * declared mechanism. `knownGuardrails` names the host's own guardrail ids.
 */
export interface CatalogueCheckOptions {
	requireReview?: boolean;
	reviews?: readonly Review[];
	knownGuardrails?: readonly string[];
}

/** Every entry's refusals over the edition, and — with `requireReview` — every entry no reading has accepted. */
export function checkCatalogue(
	catalogue: GuardrailCatalogue,
	registry: ControlRefRegistry,
	options: CatalogueCheckOptions = {}
): CatalogueIssue[] {
	const issues: CatalogueIssue[] = [];
	const parsed = guardrailCatalogueSchema.safeParse(catalogue);
	if (!parsed.success) {
		issues.push({ check: 'catalogue.parses', message: parsed.error.message });
		return issues;
	}
	const seen = new Set<string>();
	const reviews = latestReviews(options.reviews ?? []);
	for (const entry of catalogue.entries) {
		if (seen.has(entry.id)) {
			issues.push({ check: 'catalogue.unique', entryId: entry.id, message: 'listed twice' });
		}
		seen.add(entry.id);
		issues.push(...checkEntry(entry, registry, options));
		if (
			options.requireReview &&
			entry.review === 'pending' &&
			!isReviewed(reviews, { kind: 'catalogue-entry', id: entry.id })
		)
			issues.push({
				check: 'catalogue.review-pending',
				entryId: entry.id,
				message: 'awaiting review — a reader has not read it against its sources'
			});
	}
	return issues;
}

/** One entry's refusals — what `checkCatalogue` folds over the edition. */
export function checkEntry(
	entry: CatalogueEntry,
	registry: ControlRefRegistry,
	options: Pick<CatalogueCheckOptions, 'knownGuardrails'> = {}
): CatalogueIssue[] {
	const issues: CatalogueIssue[] = [];
	const at = (check: string, message: string) => issues.push({ check, entryId: entry.id, message });
	if (entry.sources.length === 0) at('catalogue.cited', 'cites no source');
	for (const source of entry.sources) {
		if (source.title.trim() === '' || source.publisher.trim() === '') {
			at('catalogue.cited', 'a source has no title or publisher');
		}
	}
	for (const componentId of entry.coverage.componentIds ?? []) {
		if (!registry.getGuardrailComponent(componentId)) {
			at('catalogue.component', `names component "${componentId}", which nothing ships`);
		}
	}
	for (const ref of entry.coverage.implementedBy ?? []) {
		const problem = resolveControlRef(ref, registry, options);
		if (problem) at('catalogue.implemented-by', `names ${problem}`);
	}
	const named =
		(entry.coverage.componentIds?.length ?? 0) + (entry.coverage.implementedBy?.length ?? 0);
	switch (entry.coverage.status) {
		case 'shipped':
			if (named === 0) at('catalogue.status', 'is shipped but names nothing that implements it');
			break;
		case 'connectable':
			if ((entry.coverage.componentIds?.length ?? 0) === 0)
				at('catalogue.status', 'is connectable but names no component with a connection');
			for (const componentId of entry.coverage.componentIds ?? []) {
				const component = registry.getGuardrailComponent(componentId);
				if (component && !component.connection)
					at(
						'catalogue.status',
						`is connectable through "${componentId}", which declares no connection`
					);
			}
			break;
		case 'not-applicable':
			if (
				!/\b(because|since|as|:)\b|—/.test(entry.coverage.note) &&
				entry.coverage.note.length < 40
			)
				at('catalogue.status', 'is not applicable but gives no reason');
			break;
		case 'blueprint':
			if (named > 0)
				at(
					'catalogue.status',
					'is a blueprint yet names an implementation — it is bespoke or shipped'
				);
			break;
		case 'bespoke':
			break;
	}
	if (entry.coverage.status !== 'shipped' && entry.coverage.status !== 'connectable') {
		if ((entry.coverage.componentIds?.length ?? 0) > 0 && entry.coverage.status !== 'bespoke')
			at('catalogue.status', 'names components without being shipped, connectable or bespoke');
	}
	return issues;
}
