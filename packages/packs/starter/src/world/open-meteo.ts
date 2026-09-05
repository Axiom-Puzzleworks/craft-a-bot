import { parseCassetteFile, type ServiceLine } from '@craftabot/core';
import recording from '../cassettes/starter-open-meteo.craftabot-cassette.json' with { type: 'json' };

/**
 * **Open-Meteo** (WP58 stage B, `47-SERVICE-LINES.md` §4.4): the first
 * *recorded* line — a real, keyless, CORS-open forecast API
 * (`api.open-meteo.com`) reached only by `craftabot record`, under an egress
 * guard that allows that one host. In a session it answers from the
 * cassette the recording wrote (`cassettes/starter-open-meteo…`, from stage
 * C's live checkpoint) — and until one is shipped, every call is a loud
 * miss, never a call out. What leaves is the tool's arguments (a
 * decision's): a latitude and a longitude.
 */
export const OPEN_METEO_LINE_ID = 'starter/open-meteo';
export const OPEN_METEO_HOST = 'api.open-meteo.com';

const WEATHER_CODES: Record<number, string> = {
	0: 'clear sky',
	1: 'mainly clear',
	2: 'partly cloudy',
	3: 'overcast',
	45: 'fog',
	48: 'rime fog',
	51: 'light drizzle',
	53: 'drizzle',
	55: 'dense drizzle',
	61: 'light rain',
	63: 'rain',
	65: 'heavy rain',
	71: 'light snow',
	73: 'snow',
	75: 'heavy snow',
	80: 'rain showers',
	81: 'rain showers',
	82: 'violent rain showers',
	95: 'a thunderstorm'
};

export const openMeteoLine: ServiceLine = {
	id: OPEN_METEO_LINE_ID,
	name: 'Open-Meteo',
	description:
		'A real forecast service, recorded: the current weather for a latitude and longitude.',
	operations: [
		{
			id: 'forecast',
			name: 'Forecast',
			description:
				'The current temperature and sky for a place, by latitude and longitude. Read-only.',
			parameters: {
				type: 'object',
				properties: {
					latitude: { type: 'number', description: 'Degrees north, -90 to 90.' },
					longitude: { type: 'number', description: 'Degrees east, -180 to 180.' }
				},
				required: ['latitude', 'longitude'],
				additionalProperties: false
			},
			riskTier: 'observe'
		}
	],
	// Recorded 2026-09-05 by `craftabot record` over two places (`47-…` §4.4): what a session replays.
	cassette: parseCassetteFile(recording),
	live: {
		// The live checkpoint, 2026-09-05 (`47-…` §4.4): `craftabot record` under the
		// egress guard, one host allowed, two calls at 38–355 ms, the response
		// carrying `access-control-allow-origin: *` — a browser could call this line.
		browserCapable: true,
		egress: [
			{
				host: OPEN_METEO_HOST,
				purpose: 'the current weather for a latitude and longitude',
				sends: ['decision']
			}
		],
		async call(op, args, deps) {
			if (op !== 'forecast') return { ok: false, output: `Open-Meteo has no "${op}".` };
			const { latitude, longitude } = (args ?? {}) as { latitude?: number; longitude?: number };
			if (typeof latitude !== 'number' || typeof longitude !== 'number') {
				return { ok: false, output: 'A forecast needs a latitude and a longitude.' };
			}
			const url = `https://${OPEN_METEO_HOST}/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
			let response: Response;
			try {
				response = await deps.fetch(url, {
					...(deps.signal ? { signal: deps.signal } : {}),
					headers: { accept: 'application/json' }
				});
			} catch {
				// A refused or failed call is a plain failure — never the transport's own words,
				// which a recording would otherwise keep (`47-…` §4.3, `no-secret-leaks`).
				return { ok: false, output: 'Open-Meteo could not be reached.' };
			}
			if (!response.ok) {
				return { ok: false, output: `Open-Meteo answered ${response.status}.` };
			}
			const body = (await response.json()) as {
				current?: { temperature_2m?: number; weather_code?: number };
				current_units?: { temperature_2m?: string };
			};
			const temperature = body.current?.temperature_2m;
			const code = body.current?.weather_code;
			const sky =
				code !== undefined ? (WEATHER_CODES[code] ?? `weather code ${code}`) : 'an unknown sky';
			return {
				ok: true,
				output: `At ${latitude}, ${longitude} it is ${temperature ?? '?'}${body.current_units?.temperature_2m ?? '°C'} with ${sky}.`,
				data: { latitude, longitude, temperature, weatherCode: code }
			};
		}
	}
};
