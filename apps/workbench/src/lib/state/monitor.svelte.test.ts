import { describe, expect, it } from 'vitest';
import { packs } from '$edition-packs';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from '$lib/worker/campaign-host.js';
import { inProcessWorker } from '$lib/worker/campaign-client.js';
import { createMonitor, type MonitorSetup } from './monitor.svelte.js';

/**
 * The Monitor store's promises (WP84, `75-THE-MONITOR.md` §5): a day streams
 * in run by run and the fold follows it; Pause freezes the fold while the
 * runs keep coming; Step folds one; Play catches up; Replay draws the same
 * picture from the kept runs; the day ends with its `BankRun`.
 */
const spawn = () =>
	inProcessWorker((post) => createCampaignHost({ packs, plans: workshopPlans }, post));

const SETUP: MonitorSetup = {
	seed: 1,
	size: 1_500,
	from: '2026-06-10',
	to: '2026-06-19',
	acceleration: Infinity,
	desks: [
		{
			id: 'lending',
			workflowId: 'fs-lending/lending',
			kinds: ['application'],
			configuration: 'bot-everywhere',
			concurrency: 3
		}
	],
	window: 200,
	minimum: 40
};

const settled = (monitor: ReturnType<typeof createMonitor>) =>
	new Promise<void>((resolve) => {
		const tick = () => {
			if (monitor.status !== 'running') resolve();
			else setTimeout(tick, 20);
		};
		tick();
	});

describe('the Monitor store', { timeout: 300_000 }, () => {
	it('follows the day while playing, ends with the BankRun, and replays the same picture', async () => {
		const monitor = createMonitor({
			spawn,
			setInterval: ((fn: () => void) => {
				fn();
				return 0;
			}) as unknown as typeof setInterval,
			clearInterval: () => {},
			replayBatch: 10_000
		});
		expect(monitor.state).toBeUndefined();
		monitor.start(SETUP);
		expect(monitor.status).toBe('running');
		await settled(monitor);
		expect(monitor.status).toBe('done');
		expect(monitor.bank?.counts.routed).toBe(monitor.kept.length);
		expect(monitor.kept.length).toBeGreaterThan(0);
		expect(monitor.arrivals.length).toBe(monitor.bank?.counts.arrivals['application']);
		expect(monitor.folded).toBe(monitor.kept.length);
		const before = monitor.state;
		expect(before?.readouts.runs).toBe(monitor.kept.length);
		expect(before?.readouts.decided).toBe(monitor.kept.length);
		expect(before?.queues[0]).toMatchObject({
			desk: 'lending',
			done: monitor.kept.length,
			waiting: 0
		});
		expect(before?.now).toBe(monitor.clock);
		// Replay: emptied and refilled at once (the interval fires on schedule here) — the same state.
		monitor.replay();
		expect(monitor.replaying).toBe(false);
		expect(monitor.folded).toBe(monitor.kept.length);
		expect(monitor.state).toEqual(before);
		expect(monitor.wallMs).toBeGreaterThanOrEqual(0);
	});

	it('freezes the fold on Pause while the runs keep landing, folds one on Step, and catches up on Play', async () => {
		const monitor = createMonitor({ spawn });
		monitor.start(SETUP);
		monitor.pause();
		await settled(monitor);
		expect(monitor.kept.length).toBeGreaterThan(1);
		expect(monitor.folded).toBe(0);
		expect(monitor.state?.readouts.runs).toBe(0);
		// The arrivals the fold shows stop at the fold's clock too: nothing folded, nothing arrived.
		expect(monitor.state?.queues[0]?.arrived).toBe(0);
		monitor.step();
		expect(monitor.folded).toBe(1);
		expect(monitor.state?.readouts.runs).toBe(1);
		expect(monitor.state?.queues[0]?.done).toBe(1);
		monitor.play();
		expect(monitor.mode).toBe('play');
		expect(monitor.folded).toBe(monitor.kept.length);
		expect(monitor.state?.readouts.runs).toBe(monitor.kept.length);
	});
});
