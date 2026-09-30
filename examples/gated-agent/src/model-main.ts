import { startScriptedModel } from './model.js';

/** `npm run model`: the scripted model on 127.0.0.1:8128, for the Gate to stand in front of. */
const model = await startScriptedModel(Number(process.env['MODEL_PORT'] ?? 8128));
console.log(`scripted model on ${model.url}`);
