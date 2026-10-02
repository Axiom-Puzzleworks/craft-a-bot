/**
 * **The Gate's presets beside the harness's packs** (WP157, `111-TESTABLE-CONTROLS-PLAN.md`
 * §5 D5): the default install plus `GATE_CONTENT`, so a design can name a
 * preset as a guard level and the register can read its claims. Pass it to
 * the command that runs the presets' design:
 *
 *     npm run craftabot -- experiment run --config packages/gate/craftabot.config.mjs --file experiments/gate-presets.json
 *
 * Without `--config`, the harness runs exactly as before; `craftabot controls`
 * already adds the presets on its own.
 */
import { defaultPacks } from '@craftabot/harness';
import { GATE_CONTENT } from './dist/presets.js';

export default { packs: [...defaultPacks(), GATE_CONTENT] };
