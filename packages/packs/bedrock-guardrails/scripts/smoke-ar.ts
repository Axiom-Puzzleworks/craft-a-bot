/**
 * Live checkpoint for Bedrock's automated-reasoning checks (WP144,
 * `110-CONTROL-SUITE-PLAN.md` §10) — pending until someone with an AWS
 * account and an automated-reasoning policy runs it. **Never runs in CI**
 * (`10-…` §5); invoked deliberately:
 *
 *     CRAFTABOT_CREDENTIAL_AWS_BEDROCK=accessKeyId:secretAccessKey AWS_BEDROCK_REGION=eu-west-2 \
 *       AWS_BEDROCK_AR_GUARDRAIL_ID=… AWS_BEDROCK_AR_CLAIM='…' npm run smoke:bedrock-ar
 *
 * `AWS_BEDROCK_AR_CLAIM` is a sentence the policy's rules contradict; the
 * checkpoint passes when a real answer parses and the claim reads
 * contradicted. It never prints the credential (hard rule 2).
 */
import {
	automatedReasoningConfigSchema,
	automatedReasoningReading,
	createBedrockClient
} from '../dist/index.js';

async function main(): Promise<number> {
	const credential = process.env['CRAFTABOT_CREDENTIAL_AWS_BEDROCK'];
	const claim = process.env['AWS_BEDROCK_AR_CLAIM'];
	const config = automatedReasoningConfigSchema.safeParse({
		region: process.env['AWS_BEDROCK_REGION'],
		guardrailId: process.env['AWS_BEDROCK_AR_GUARDRAIL_ID'],
		guardrailVersion: process.env['AWS_BEDROCK_AR_GUARDRAIL_VERSION'] ?? 'DRAFT'
	});
	if (!credential || credential.trim() === '' || !claim || !config.success) {
		console.log(
			'CRAFTABOT_CREDENTIAL_AWS_BEDROCK, AWS_BEDROCK_REGION, AWS_BEDROCK_AR_GUARDRAIL_ID and AWS_BEDROCK_AR_CLAIM are not all set — skipping the checkpoint.'
		);
		return 0;
	}
	const client = createBedrockClient({
		config: config.data,
		fetch: globalThis.fetch,
		credential: () => credential
	});
	const start = performance.now();
	const result = await client.apply(claim, 'OUTPUT');
	const ms = Math.round(performance.now() - start);
	if ('error' in result) {
		console.error(`✗ ${result.error.kind}: ${result.error.message} (${ms} ms)`);
		return 1;
	}
	const reading = automatedReasoningReading(result.body);
	console.log(
		`✓ answered in ${ms} ms — ${reading.findings.map((finding) => finding.vendorLabel).join(', ') || 'no findings'}`
	);
	if (!reading.matched) {
		console.error('✗ the claim did not read contradicted — check the policy and the claim.');
		return 1;
	}
	console.log('Record the date and the timing in 110-CONTROL-SUITE-PLAN.md’s WP144 note.');
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
