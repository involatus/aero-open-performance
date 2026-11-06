/** What the app needs from any weather provider, so providers can be swapped. */
export type WeatherReport = { raw: string; station: string; stationName: string | null; distanceKm: number | null };
export type WeatherQuery = { station: string } | { lat: number; lon: number };
export class WeatherError extends Error {
	constructor(public code: 'notConfigured' | 'unavailable' | 'noStation') {
		super(code);
	}
}
export type WeatherProvider = (query: WeatherQuery) => Promise<WeatherReport>;
