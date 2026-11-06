/** CheckWX as a weather provider. The key stays on the server. */
import { WeatherError, type WeatherProvider } from '../weather/provider.ts';

type CheckWxReport = { raw_text?: string; icao?: string; station?: { name?: string }; position?: { distance?: { meters?: number } } };

export function checkWx(key: string | undefined, doFetch: typeof fetch = fetch): WeatherProvider {
	return async (query) => {
		if (!key) throw new WeatherError('notConfigured');
		const path = 'station' in query ? `${query.station}/decoded` : `lat/${query.lat}/lon/${query.lon}/decoded`;
		let response: Response;
		try {
			response = await doFetch(`https://api.checkwx.com/v2/metar/${path}`, { headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(8000) });
		} catch {
			throw new WeatherError('unavailable');
		}
		if (response.status === 401 || response.status === 403) throw new WeatherError('notConfigured');
		if (!response.ok) throw new WeatherError('unavailable');
		const body = (await response.json().catch(() => null)) as { data?: CheckWxReport[] } | null;
		const report = body?.data?.[0];
		if (!report?.raw_text || !report.icao) throw new WeatherError('noStation');
		const meters = report.position?.distance?.meters;
		return { raw: report.raw_text, station: report.icao, stationName: report.station?.name ?? null, distanceKm: typeof meters === 'number' ? meters / 1000 : null };
	};
}
