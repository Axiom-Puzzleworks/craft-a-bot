import type { PackManifest } from '@craftabot/core';
import anthropicPack from '@craftabot/pack-anthropic';
import geminiPack from '@craftabot/pack-gemini';
import monitorPack from '@craftabot/pack-monitor';
import ollamaPack from '@craftabot/pack-ollama';
import openAiPack from '@craftabot/pack-openai';
import personasPack from '@craftabot/pack-personas';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';
import { demoPack } from '../demo-pack.js';

/**
 * **The `simulator` edition's packs** (`59-EDITIONS.md` §4.1, WP69): the Kit's box — the starter bricks, the four
 * model brands and the personas, the Safety Patrol, the Explorer's World.
 * `vite.config.ts` aliases `$edition-packs` to this file for that build, so
 * a bundle carries these packs and no other — the exclusion is the module
 * graph's, not a run-time check.
 */
export const packs: PackManifest[] = [
	starterPack,
	openAiPack,
	personasPack,
	anthropicPack,
	geminiPack,
	ollamaPack,
	monitorPack,
	workshopPack,
	demoPack
];
