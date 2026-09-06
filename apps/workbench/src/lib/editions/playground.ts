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
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import evaluatorsPack from '@craftabot/pack-evaluators';
import { evidencePack } from '@craftabot/evidence';
import { GENERIC_CONTROL_MAP_MANIFEST } from '@craftabot/governance/reports';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import pdpOpaPack from '@craftabot/pack-pdp-opa';
import fsAdvicePack from '@craftabot/pack-fs-advice';
import fsBankPack from '@craftabot/pack-fs-bank';
import fsFraudPack from '@craftabot/pack-fs-fraud';
import fsLendingPack from '@craftabot/pack-fs-lending';

/**
 * **The `playground` edition's packs** (`59-EDITIONS.md` §4.1, WP69): the Workshop's box plus the synthetic bank
 * and the three desks.
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
	geapPack,
	guardLocalPack,
	azureContentSafetyPack,
	pdpOpaPack,
	evaluatorsPack,
	fsBankPack,
	fsAdvicePack,
	fsFraudPack,
	fsLendingPack,
	evidencePack,
	GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest,
	demoPack
];
