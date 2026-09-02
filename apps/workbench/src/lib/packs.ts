import { createPackRegistry, type PackRegistry } from '@craftabot/core';
import anthropicPack from '@craftabot/pack-anthropic';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import geminiPack from '@craftabot/pack-gemini';
import monitorPack from '@craftabot/pack-monitor';
import ollamaPack from '@craftabot/pack-ollama';
import openAiPack from '@craftabot/pack-openai';
import personasPack from '@craftabot/pack-personas';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';
import { demoPack } from './demo-pack.js';

/**
 * The explicit pack registry (01-ARCHITECTURE.md §4, 05-TECH-STACK.md §3).
 * Packs are listed here by hand — no dynamic loading, no marketplace, nothing
 * magical. A future private pack installs into the same slot by being added to
 * this list in a private build of the app, which is the whole public/private
 * split mechanism (01 §5).
 *
 * **`monitorPack` joins the box, 2026-08-16 (WP27).** Built in WP14 as the
 * open brick contract's own proof — a genuinely new kind of brick, in the
 * `safety` slot, that no core change was needed for — and deliberately left
 * uninstalled since: shipping a seventh brick changes what V1.0 *is*, and
 * expansion packs are Phase E work (`18-…` §3). Phase D is done; this is that
 * work. It occupies the same `safety` slot as `starter/safety` — swap one for
 * the other, per V1's one-brick-per-socket rule — rather than the reference
 * design's target "2nd chest socket" (`14-…` §5.3), which needs a new core
 * slot and chassis art neither of which exist yet; the dated note in `14-…`
 * §5.3 records that as deferred, not dropped.
 *
 * **`workshopPack` joins the box, 2026-08-16 (WP28)** — the second world
 * (`14-…` §4.5's `riskTier: 'irreversible'` proved in real content for the
 * first time). It ships no bricks of its own; a builder fits `starter`'s
 * Hands & Wheels and Eyes & Ears and enables the Workshop's action/sense ids
 * on them (`session/harness.ts`'s own dated note explains why that is the
 * only shape a v1 spec's fixed brick keys can ever resolve to).
 *
 * **`personasPack` joins the box, 2026-08-18 (WP26).** Six persona cartridges
 * (Storyteller, Creator, Explainer, Planner, Researcher, Coder) for the Brain
 * brick's picker — the LLM Multi-Pack's cartridge content, scoped to the
 * OpenAI provider that already exists rather than waiting on the three real
 * wire-protocol integrations the box art also promises (Anthropic, Gemini,
 * Ollama — still open, `18-…` §7). Ships no provider of its own; each
 * cartridge rides one of `pack-openai`'s three models with a different
 * `personality` and job.
 *
 * **`anthropicPack` joins the box, 2026-08-18 (WP26).** The first of the
 * three real wire-protocol integrations the Multi-Pack box art promises —
 * Anthropic's Messages API, streamed, with its own translation for the
 * system prompt, tool calls and tool results (`@craftabot/pack-anthropic`,
 * `06-…` §8's dated amendment). Registers its own `ProviderFactory`; the
 * battery compartment for it appears in Settings automatically.
 *
 * **`geminiPack` joins the box, 2026-08-18 (WP26).** The second real
 * provider integration — Google's `generateContent`, with its own
 * translation (roles `user`/`model`, `functionCall`/`functionResponse`
 * matched by name rather than id). Its key goes in the `x-goog-api-key`
 * header, never the `?key=` query parameter Google's own docs default to —
 * a URL is exactly where hard rule 2 says a key must never be.
 *
 * **`ollamaPack` joins the box, 2026-08-18 (WP26)** — the third and last of
 * the LLM Multi-Pack's real provider integrations, and the only keyless one.
 * Runs against Ollama's OpenAI-compatible endpoint on `localhost:11434`
 * (fixed, not user-configurable — `06-…` §5's SSRF caution about a custom
 * endpoint field is still unresolved, recorded as deferred rather than
 * quietly built around). Gets no battery compartment: `keyRequirement:
 * 'none'` means Settings has nothing to render for it.
 *
 * **`geapPack` joins the box, 2026-09-01 (WP35 stage D).** The Armour Brick,
 * `geap/armor` — the first `audience: 'workshop'` kind (`25-ARMOUR-BRICK.md`
 * §4.8): installed exactly like every other kind above, so a kit file
 * carrying it validates and runs anywhere, but offered on the bench and in
 * Settings only while the Workshop door is open (`PartsTray.svelte`'s own
 * `audience` filter, WP35 stage C). Occupies the `safety` slot beside
 * `starter/safety` and `monitor/watchbot` — a third posture in the same
 * socket (local rules, observe-only, hosted service), swap one for another
 * per V1's one-brick-per-socket rule.
 */
export const installedPacks = [
	starterPack,
	openAiPack,
	personasPack,
	anthropicPack,
	geminiPack,
	ollamaPack,
	monitorPack,
	workshopPack,
	geapPack,
	// WP42 (`30-SECOND-VENDORS.md`): two more guard services, fitted through `workshop/guard`.
	guardLocalPack,
	azureContentSafetyPack,
	demoPack
];

export function createRegistry(): PackRegistry {
	const registry = createPackRegistry();
	for (const pack of installedPacks) registry.registerPack(pack);
	return registry;
}

/** Pack ids and versions, for kit-file `requires` blocks and run records. */
export function packVersions(): Record<string, string> {
	return Object.fromEntries(installedPacks.map((pack) => [pack.id, pack.version]));
}

/**
 * Every brick kind this build can assemble, for the kit-file `requires` check.
 *
 * Read from the packs rather than the registry because import happens before
 * anything has been built — there is no bench, and no reason to stand a
 * registry up to answer one question.
 */
export function installedBrickKinds(): string[] {
	return installedPacks.flatMap((pack) => (pack.brickKinds ?? []).map((kind) => kind.id));
}
