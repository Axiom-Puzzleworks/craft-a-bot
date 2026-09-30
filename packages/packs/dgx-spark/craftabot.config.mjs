/**
 * **The builder's DGX Sparks, opted in** (WP120, `104-READERS.md` §10.4; G90):
 * the harness's default packs plus this one — a keyless provider over the
 * builder's own four hosts and the classifier line. It left the default list
 * because a default pack that names one person's hardware is not content every
 * user of the harness should carry. Pass it to any command that should see it:
 *
 *     npm run craftabot -- packs --config packages/packs/dgx-spark/craftabot.config.mjs
 */
import { defaultPacks } from '@craftabot/harness';
import dgxSparkPack from './dist/index.js';

export default { packs: [...defaultPacks(), dgxSparkPack] };
