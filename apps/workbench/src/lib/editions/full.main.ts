import type { PackManifest } from '@craftabot/core';
import { desk, type EditionSlot } from './slots.js';
import anthropicPack from '@craftabot/pack-anthropic';
import geminiPack from '@craftabot/pack-gemini';
import monitorPack from '@craftabot/pack-monitor';
import ollamaPack from '@craftabot/pack-ollama';
import openAiPack from '@craftabot/pack-openai';
import personasPack from '@craftabot/pack-personas';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';
import { demoPack } from '../demo-pack.js';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import evaluatorsPack from '@craftabot/pack-evaluators';
import { evidencePack } from '@craftabot/evidence';
import { GENERIC_CONTROL_MAP_MANIFEST } from '@craftabot/governance/reports';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import pdpOpaPack from '@craftabot/pack-pdp-opa';
import fsBankPack from '@craftabot/pack-fs-bank';

/**
 * **The `full` edition's packs on the main thread** (WP112, `101-…`; `59-EDITIONS.md` §4.1):
 * the list `full.ts` holds, in its order, with each desk pack a dynamic import —
 * its own chunk, fetched by `loadDesks` (`edition.ts`) when a route that needs
 * the bank's desks is visited, never on the Kit's first page. `full.ts` keeps
 * the static list the Worker bundles (an iife Worker cannot split) and every
 * test reads; `edition.test.ts` holds the two lists to one order.
 */
export const slots: EditionSlot[] = [
	starterPack,
	openAiPack,
	personasPack,
	anthropicPack,
	geminiPack,
	ollamaPack,
	monitorPack,
	workshopPack,
	geapPack,
	guardLocalPack,
	azureContentSafetyPack,
	pdpOpaPack,
	evaluatorsPack,
	fsBankPack,
	desk('fs-advice', () => import('@craftabot/pack-fs-advice')),
	desk('fs-fraud', () => import('@craftabot/pack-fs-fraud')),
	desk('fs-lending', () => import('@craftabot/pack-fs-lending')),
	desk('fs-onboarding', () => import('@craftabot/pack-fs-onboarding')),
	desk('fs-disputes', () => import('@craftabot/pack-fs-disputes')),
	desk('fs-collections', () => import('@craftabot/pack-fs-collections')),
	desk('fs-servicing', () => import('@craftabot/pack-fs-servicing')),
	evidencePack,
	GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest,
	demoPack
];
