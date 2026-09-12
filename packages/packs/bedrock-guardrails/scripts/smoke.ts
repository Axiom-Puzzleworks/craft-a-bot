/**
 * Live smoke test against Amazon Bedrock Guardrails — the checkpoint
 * `30-SECOND-VENDORS.md`'s WP99 note carries as pending. **Never runs in CI**
 * (`10-…` §5); invoked deliberately:
 *
 *     CRAFTABOT_CREDENTIAL_AWS_BEDROCK=accessKeyId:secretAccessKey AWS_BEDROCK_REGION=eu-west-2 \
 *       AWS_BEDROCK_GUARDRAIL_ID=… AWS_BEDROCK_GUARDRAIL_VERSION=DRAFT npm run smoke:bedrock
 *
 * The one thing only a live call can prove is that a real `ApplyGuardrail`
 * answer parses and intervenes on the known attack. It never prints the
 * credential (hard rule 2). There is no browser half: SigV4 is why this
 * pack is the harness's (`30-…` D1).
 */
import { KNOWN_ATTACK, bedrockConfigSchema, createBedrockClient } from '../dist/index.js';

async function main(): Promise<number> {
	const credential = process.env['CRAFTABOT_CREDENTIAL_AWS_BEDROCK'];
	const config = bedrockConfigSchema.safeParse({
		region: process.env['AWS_BEDROCK_REGION'],
		guardrailId: process.env['AWS_BEDROCK_GUARDRAIL_ID'],
		guardrailVersion: process.env['AWS_BEDROCK_GUARDRAIL_VERSION'] ?? 'DRAFT'
	});
	if (!credential || credential.trim() === '' || !config.success) {
		console.log(
			'CRAFTABOT_CREDENTIAL_AWS_BEDROCK, AWS_BEDROCK_REGION and AWS_BEDROCK_GUARDRAIL_ID are not all set — skipping the live smoke test.'
		);
		return 0;
	}
	const client = createBedrockClient({
		config: config.data,
		fetch: globalThis.fetch,
		credential: () => credential
	});
	console.log(
		`Applying guardrail ${config.data.guardrailId} (${config.data.region}) to a known-attack prompt…`
	);
	const start = performance.now();
	const result = await client.apply(KNOWN_ATTACK, 'INPUT');
	const ms = Math.round(performance.now() - start);
	if ('error' in result) {
		console.error(`✗ ${result.error.kind}: ${result.error.message} (${ms} ms)`);
		return 1;
	}
	console.log(`✓ answered in ${ms} ms — action: ${result.body.action}`);
	if (result.body.action !== 'GUARDRAIL_INTERVENED') {
		console.error(
			'✗ the known attack did not make the guardrail intervene — enable the prompt-attack filter.'
		);
		return 1;
	}
	console.log('Record the date and the timing in 30-SECOND-VENDORS.md’s WP99 note.');
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
