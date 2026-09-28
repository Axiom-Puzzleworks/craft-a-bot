/**
 * **The optional install** (`98-JEV.md` §8): the harness's default packs,
 * plus TypeSafe (Jev). Pass it to any command that should see the
 * experiment:
 *
 *     npm run craftabot -- experiment run --config packages/packs/typesafe/craftabot.config.mjs --file experiments/servicing-jev.json
 *
 * Without `--config`, Craft A Bot runs exactly as it did before this pack existed.
 */
import { defaultPacks } from '@craftabot/harness';
import typesafePack from './dist/index.js';

export default { packs: [...defaultPacks(), typesafePack] };
