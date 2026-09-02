import { describe, expect, it } from 'vitest';
import { obedient } from '@craftabot/core/testing';
import { buildSpec, runGroupToCompletion } from './harness.js';

/**
 * **Hearing per seat** (`36-BUNDLE-AND-GROUPS.md` §4.3, WP48; the `23-…` §9
 * risk row): a duo card fitting Hearing on both robots, a message delivered
 * between their turns — and both of them hear it.
 */

const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';

const listener = (id: string, name: string) =>
	buildSpec({
		id,
		name,
		goalCardId: 'starter/tidy-together',
		senses: ['sight', 'compass', 'hearing'],
		safety: { maxTicks: 6, blockedActions: [], approvalMode: false }
	});

const idle = () =>
	obedient(
		Array.from({ length: 4 }, () => ({ say: 'Listening.', call: 'say', args: { text: 'hm' } }))
	);

describe('a duo with Hearing on both seats (WP48)', () => {
	it('delivers a mid-episode message to both robots, once each', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: idle(), spec: listener(ROBO, 'Robo') },
				{ script: idle(), spec: listener(BOLT, 'Bolt') }
			],
			deliverAfterRound: { round: 1, text: 'Meet me at the toy chest.' },
			roundLimit: 4
		});
		const heardBy = (runId: string) =>
			run.events.filter(
				(event) =>
					event.type === 'sense' &&
					event.runId === runId &&
					event.payload.observation.text.includes('Meet me at the toy chest.')
			);
		const [roboRun, boltRun] = run.memberEvents.map((events) => events[0]?.runId ?? '');
		expect(heardBy(roboRun ?? '')).toHaveLength(1);
		expect(heardBy(boltRun ?? '')).toHaveLength(1);
	});
});
