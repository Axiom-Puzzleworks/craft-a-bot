import { createHash, createHmac } from 'node:crypto';

/**
 * **AWS Signature Version 4** for one `POST` with a JSON body (WP99,
 * `30-SECOND-VENDORS.md`): the canonical request, the string to sign, the
 * derived key, the `Authorization` header — nothing more than Bedrock's
 * `ApplyGuardrail` needs. Node's `crypto`, which is why this pack is a
 * harness pack: the signing needs the secret key in hand, and a browser
 * edition would have to carry it, which hard rule 2 forbids. The secret
 * never leaves this module except inside the signature.
 */
export interface SigV4Credentials {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
}

export interface SigV4Request {
	method: 'POST';
	url: URL;
	body: string;
	region: string;
	service: string;
	/** The signing instant; `Date.now()` when absent — a test pins it. */
	now?: Date;
}

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer =>
	createHmac('sha256', key).update(data, 'utf8').digest();

function amzDate(now: Date): { date: string; dateTime: string } {
	const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	return { date: iso.slice(0, 8), dateTime: iso };
}

/** The headers a signed request carries: `host`, `x-amz-date`, `x-amz-content-sha256`, `authorization`, and a session token when there is one. */
export function signRequest(
	request: SigV4Request,
	credentials: SigV4Credentials
): Record<string, string> {
	const now = request.now ?? new Date();
	const { date, dateTime } = amzDate(now);
	const host = request.url.host;
	const payloadHash = sha256(request.body);
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		host,
		'x-amz-content-sha256': payloadHash,
		'x-amz-date': dateTime,
		...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {})
	};
	const signedHeaderNames = Object.keys(headers).sort();
	const canonicalHeaders = signedHeaderNames
		.map((name) => `${name}:${headers[name]!.trim()}\n`)
		.join('');
	const signedHeaders = signedHeaderNames.join(';');
	const canonicalUri = request.url.pathname
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	const canonicalRequest = [
		request.method,
		canonicalUri,
		'',
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n');
	const scope = `${date}/${request.region}/${request.service}/aws4_request`;
	const stringToSign = ['AWS4-HMAC-SHA256', dateTime, scope, sha256(canonicalRequest)].join('\n');
	const kDate = hmac(`AWS4${credentials.secretAccessKey}`, date);
	const kRegion = hmac(kDate, request.region);
	const kService = hmac(kRegion, request.service);
	const kSigning = hmac(kService, 'aws4_request');
	const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
	const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
	return { ...headers, authorization };
}

/**
 * The vault holds one string per credential id; AWS needs two (and
 * sometimes three). The convention: `accessKeyId:secretAccessKey` or
 * `accessKeyId:secretAccessKey:sessionToken` — the harness reads it from
 * `CRAFTABOT_CREDENTIAL_AWS_BEDROCK`.
 */
export function parseCredential(secret: string | undefined): SigV4Credentials | undefined {
	if (!secret) return undefined;
	const [accessKeyId, secretAccessKey, sessionToken] = secret.split(':');
	if (!accessKeyId || !secretAccessKey) return undefined;
	return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
}
