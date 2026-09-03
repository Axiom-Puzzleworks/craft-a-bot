import { runPlainAgent } from './index.js';

/** `node dist/main.js`: the loop, printed. */
const steps = await runPlainAgent((line) => console.log(line));
const stopped = steps.filter((step) => step.stoppedBy !== undefined);
console.log(
	`\n${steps.length} proposals, ${steps.length - stopped.length} allowed, ${stopped.length} refused by: ${[
		...new Set(stopped.map((step) => step.stoppedBy))
	].join(', ')}`
);
