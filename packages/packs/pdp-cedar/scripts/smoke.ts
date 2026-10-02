/**
 * Live checkpoint for Cedar through Amazon Verified Permissions (WP144,
 * `110-CONTROL-SUITE-PLAN.md` §10) — pending until someone with a policy
 * store runs it. **Never runs in CI** (`10-…` §5); invoked deliberately:
 *
 *     CRAFTABOT_CREDENTIAL_AWS_VERIFIED_PERMISSIONS=accessKeyId:secretAccessKey AWS_VP_REGION=eu-west-2 \
 *       AWS_VP_POLICY_STORE_ID=… AWS_VP_DENIED_ACTION=send_email npm run smoke:cedar
 *
 * The store needs a policy forbidding `CraftABot::Action::"<denied action>"`;
 * the checkpoint passes when a real decision parses and reads DENY for it.
 * It never prints the credential (hard rule 2).
 */
import {
	cedarConfigSchema,
	createCedarClient,
	isAuthorizedRequest,
	readDecision
} from '../dist/index.js';

async function main(): Promise<number> {
	const credential = process.env['CRAFTABOT_CREDENTIAL_AWS_VERIFIED_PERMISSIONS'];
	const action = process.env['AWS_VP_DENIED_ACTION'];
	const config = cedarConfigSchema.safeParse({
		region: process.env['AWS_VP_REGION'],
		policyStoreId: process.env['AWS_VP_POLICY_STORE_ID']
	});
	if (!credential || credential.trim() === '' || !action || !config.success) {
		console.log(
			'CRAFTABOT_CREDENTIAL_AWS_VERIFIED_PERMISSIONS, AWS_VP_REGION, AWS_VP_POLICY_STORE_ID and AWS_VP_DENIED_ACTION are not all set — skipping the checkpoint.'
		);
		return 0;
	}
	const client = createCedarClient({
		config: config.data,
		fetch: globalThis.fetch,
		credential: () => credential
	});
	const request = isAuthorizedRequest(
		{
			version: 1,
			hook: 'pre-act',
			tick: 1,
			agent: { id: 'smoke', name: 'Smoke', goalCardId: 'smoke' },
			proposed: { kind: 'action', name: action, arguments: {} },
			usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
			world: { predicates: {} }
		} as never,
		config.data
	);
	const start = performance.now();
	const result = await client.isAuthorized(request);
	const ms = Math.round(performance.now() - start);
	if ('error' in result) {
		console.error(`✗ ${result.error.kind}: ${result.error.message} (${ms} ms)`);
		return 1;
	}
	const reading = readDecision(result.body);
	console.log(`✓ answered in ${ms} ms — ${result.body.decision}`);
	if (!reading.matched) {
		console.error(`✗ ${action} was allowed — add a forbid policy for it to the store.`);
		return 1;
	}
	console.log('Record the date and the timing in 110-CONTROL-SUITE-PLAN.md’s WP144 note.');
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
