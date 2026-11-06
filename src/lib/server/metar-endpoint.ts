/** The METAR proxy, separate from the framework so it can be tested. */
import { WeatherError, type WeatherProvider, type WeatherQuery } from '../weather/provider.ts';

/** 15 minutes, as the provider recommends. Shared caching also protects the free request limit. */
export const CACHE_SECONDS = 900;

export function parseQuery(params: URLSearchParams): WeatherQuery | null {
	const station = params.get('station');
	if (station !== null) {
		const code = station.trim().toUpperCase();
		return /^[A-Z][A-Z0-9]{3}$/.test(code) ? { station: code } : null;
	}
	const lat = Number(params.get('lat')), lon = Number(params.get('lon'));
	if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	// About 1 km is plenty to find a station, and means the exact position is never sent on.
	return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

const json = (body: unknown, status: number, cache: string) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

export async function metarResponse(url: URL, provider: WeatherProvider, fetchSite: string | null): Promise<Response> {
	// Only this app may use the proxy, so others can't spend the Operator's request limit from a browser.
	if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return json({ error: 'forbidden' }, 403, 'no-store');
	const query = parseQuery(url.searchParams);
	if (!query) return json({ error: 'badRequest' }, 400, 'no-store');
	try {
		const report = await provider(query);
		return json(report, 200, `public, max-age=60, s-maxage=${CACHE_SECONDS}`);
	} catch (error) {
		if (error instanceof WeatherError) {
			const status = error.code === 'noStation' ? 404 : error.code === 'notConfigured' ? 501 : 502;
			return json({ error: error.code }, status, 'no-store');
		}
		return json({ error: 'unavailable' }, 502, 'no-store');
	}
}
