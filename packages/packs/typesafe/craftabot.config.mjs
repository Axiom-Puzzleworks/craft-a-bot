/**
 * **The optional install** (`98-JEV.md` §8): the harness's default packs,
 * plus TypeSafe (Jev), the builder's DGX Sparks (whose classifier two of its
 * readers ask; opt-in since WP120) and the LLM readers (whose keyword stand-in
 * one configuration reads with). Pass it to any command that should see the
 * experiment:
 *
 *     npm run craftabot -- experiment run --config packages/packs/typesafe/craftabot.config.mjs --file experiments/servicing-readers.json
 *
 * Without `--config`, Craft A Bot runs exactly as it did before these packs existed.
 */
import { defaultPacks } from '@craftabot/harness';
import dgxSparkPack from '@craftabot/pack-dgx-spark';
import readersLlmPack from '@craftabot/pack-readers-llm';
import typesafePack from './dist/index.js';

export default { packs: [...defaultPacks(), dgxSparkPack, readersLlmPack, typesafePack] };
