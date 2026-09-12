import {
	guardrailCatalogueSchema,
	type CatalogueEntry,
	type GuardrailCatalogue,
	type PackRegistry
} from '@craftabot/core';

export interface CatalogueIssue {
	/** `catalogue.parses` · `catalogue.cited` · `catalogue.component` · `catalogue.status` · `catalogue.unique` */
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
 */
export function checkCatalogue(
	catalogue: GuardrailCatalogue,
	registry: Pick<PackRegistry, 'getGuardrailComponent'>
): CatalogueIssue[] {
	const issues: CatalogueIssue[] = [];
	const parsed = guardrailCatalogueSchema.safeParse(catalogue);
	if (!parsed.success) {
		issues.push({ check: 'catalogue.parses', message: parsed.error.message });
		return issues;
	}
	const seen = new Set<string>();
	for (const entry of catalogue.entries) {
		if (seen.has(entry.id)) {
			issues.push({ check: 'catalogue.unique', entryId: entry.id, message: 'listed twice' });
		}
		seen.add(entry.id);
		issues.push(...checkEntry(entry, registry));
	}
	return issues;
}

/** One entry's refusals — what `checkCatalogue` folds over the edition. */
export function checkEntry(
	entry: CatalogueEntry,
	registry: Pick<PackRegistry, 'getGuardrailComponent'>
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
