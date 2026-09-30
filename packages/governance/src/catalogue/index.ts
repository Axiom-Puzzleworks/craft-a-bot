/**
 * **The Guardrail Catalogue** (WP98, `86-CATALOGUE.md`): the first edition
 * as content, and the check that keeps its coverage honest.
 */
export { CATALOGUE_ENTRIES, GUARDRAIL_CATALOGUE } from './entries.js';
export {
	checkCatalogue,
	checkEntry,
	type CatalogueCheckOptions,
	type CatalogueIssue
} from './check.js';
