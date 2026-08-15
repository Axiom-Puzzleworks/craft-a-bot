/** Entry point for `npm run evals`. Kept separate so `cli.ts` stays importable. */
import { main } from './cli.js';

process.exitCode = await main();
