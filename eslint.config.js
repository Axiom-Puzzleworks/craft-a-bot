import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['docs/design/**'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Engine/UI boundary (01-ARCHITECTURE.md §1.3, §3; 05-TECH-STACK.md §4):
		// core/governance/packs must stay headless — no Svelte or SvelteKit imports.
		files: ['packages/**/*.{ts,js}'],
		ignores: ['packages/**/*.test.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['svelte', 'svelte/*', '@sveltejs/*'],
							message:
								'Engine/pack code must not import Svelte or SvelteKit — see docs/design/01-ARCHITECTURE.md §1.3.'
						}
					]
				}
			]
		}
	},
	{
		/**
		 * Governance dependency direction (08-GOVERNANCE-GUARDRAILS.md §5, final
		 * paragraph; acceptance criterion §7.4).
		 *
		 * `@craftabot/governance` is the package intended to be published
		 * standalone and dropped into real agent stacks, so it may depend on
		 * `core` for the `Guardrail` contract and on nothing else in this repo.
		 * The doc claimed "CI enforces the dependency direction"; until WP8
		 * nothing did, so a stray import of the Playroom would have gone
		 * unnoticed until someone tried to publish it.
		 */
		files: ['packages/governance/**/*.{ts,js}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@craftabot/pack-*', '@craftabot/workbench', '$lib/*', '$app/*'],
							message:
								'@craftabot/governance may depend only on @craftabot/core — see docs/design/08-GOVERNANCE-GUARDRAILS.md §5.'
						},
						{
							group: ['svelte', 'svelte/*', '@sveltejs/*'],
							message:
								'Engine/pack code must not import Svelte or SvelteKit — see docs/design/01-ARCHITECTURE.md §1.3.'
						}
					]
				}
			]
		}
	},
	{
		/**
		 * Pack-testkit dependency direction (`13-…` §7).
		 *
		 * A conformance kit that special-cased one pack to pass would be testing
		 * itself, not the contract — so it may depend only on `@craftabot/core`,
		 * the same restriction `@craftabot/governance` carries just above.
		 */
		files: ['packages/pack-testkit/**/*.{ts,js}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@craftabot/pack-*', '@craftabot/workbench', '$lib/*', '$app/*'],
							message:
								'@craftabot/pack-testkit may depend only on @craftabot/core — see docs/design-day2/13-BRICK-TEST-STRATEGY.md §7.'
						},
						{
							group: ['svelte', 'svelte/*', '@sveltejs/*'],
							message:
								'Engine/pack code must not import Svelte or SvelteKit — see docs/design/01-ARCHITECTURE.md §1.3.'
						}
					]
				}
			]
		}
	}
);
