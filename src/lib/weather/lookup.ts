/**
 * Getting a METAR for the pilot: a station or a position in, a report or a message the pilot
 * can act on out. Network and connectivity come in from outside, so every message is testable.
 */
import type { WeatherQuery, WeatherReport } from './provider.ts';

export type WeatherLookup = { ok: true; report: WeatherReport } | { ok: false; message: string };
export type WeatherDevice = { fetch: typeof fetch; online: () => boolean };

const MANUAL = 'Enter the values from ATIS or the aircraft.';
export const WEATHER_MESSAGES: Record<string, string> = {
	notConfigured: `Weather isn't set up for this app. ${MANUAL}`,
	unavailable: `Weather is unavailable right now. ${MANUAL}`,
	noStation: `No report found. Try another station code, or use Nearest. Or ${MANUAL.toLowerCase()}`,
	badRequest: 'Enter a four-character station code, such as LSZH.',
	forbidden: `Weather is unavailable right now. ${MANUAL}`,
	offline: `No connection. ${MANUAL}`
};

const toParams = (q: WeatherQuery) => ('station' in q ? `station=${encodeURIComponent(q.station.trim().toUpperCase())}` : `lat=${q.lat}&lon=${q.lon}`);

export async function lookUpWeather(query: WeatherQuery, device: WeatherDevice = { fetch: (...a) => fetch(...a), online: () => navigator.onLine }): Promise<WeatherLookup> {
	if (!device.online()) return { ok: false, message: WEATHER_MESSAGES.offline };
	try {
		const response = await device.fetch(`/api/metar?${toParams(query)}`, { signal: AbortSignal.timeout(12000) });
		const body = await response.json();
		if (!response.ok) return { ok: false, message: WEATHER_MESSAGES[body?.error] ?? WEATHER_MESSAGES.unavailable };
		return { ok: true, report: body as WeatherReport };
	} catch {
		return { ok: false, message: device.online() ? WEATHER_MESSAGES.unavailable : WEATHER_MESSAGES.offline };
	}
}
