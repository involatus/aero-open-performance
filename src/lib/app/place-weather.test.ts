import { describe, expect, it } from 'vitest';
import { nearestFrom, stationLine, weatherOnReturn } from './place-weather.ts';
import { isFromMetar } from './calculation.ts';

const NOW = Date.UTC(2026, 10, 15, 10, 0);
const report = (minutesOld: number) => ({ raw: 'x', station: 'LSZS', stationName: 'Engadin', distanceKm: null, observed: new Date(NOW - minutesOld * 60000).toISOString(), flags: [] });

describe('weather for an airfield', () => {
	it('fetches on return when there is no report yet', () => {
		expect(weatherOnReturn(null, 0, NOW)).toEqual({ fetch: true, note: '' });
	});
	it('refreshes an old report only while its values are unconfirmed, and says so', () => {
		expect(weatherOnReturn(report(75), 2, NOW)).toEqual({ fetch: true, note: 'Weather refreshed: the earlier report was 75 minutes old.' });
		expect(weatherOnReturn(report(75), 0, NOW)).toEqual({ fetch: false });
		expect(weatherOnReturn(report(30), 2, NOW)).toEqual({ fetch: false });
	});
	it('looks for the nearest station from the airfield, the device only at the departure', () => {
		expect(nearestFrom('landing', { lat: 46.5, lon: 9.9 }, false)).toEqual({ from: 'airfield', lat: 46.5, lon: 9.9 });
		expect(nearestFrom('departure', null, true)).toEqual({ from: 'device' });
		expect(nearestFrom('landing', null, true).from).toBe('none');
		expect(nearestFrom('departure', null, false).from).toBe('none');
	});
	it('names the station, with its distance only when it is elsewhere', () => {
		expect(stationLine(report(0), 'LSZS')).toBe('LSZS Engadin');
		expect(stationLine({ station: 'LSZH', stationName: 'Zurich', distanceKm: 14.25 }, 'LSZK')).toBe('LSZH Zurich, 14.3 km away');
		expect(stationLine({ station: 'LSZH', stationName: null, distanceKm: null }, 'LSZK')).toBe('LSZH, not LSZK');
	});
	it('knows a value came from a METAR by the source applyWeather writes', () => {
		expect(isFromMetar({ sources: { wdir: 'METAR LSZS' } }, 'wdir')).toBe(true);
		expect(isFromMetar({ sources: { wdir: 'airfield list LSZS' } }, 'wdir')).toBe(false);
		expect(isFromMetar({ sources: {} }, 'wdir')).toBe(false);
	});
});

describe('variation for an airfield', () => {
	it('uses the chosen airfield\'s, and none without one', async () => {
		const { variationFor } = await import('./place-weather.ts');
		expect(variationFor(null, NOW)).toBeNull();
		expect(variationFor({ lat: 47.38, lon: 8.65 }, NOW)!).toBeGreaterThan(2);
	});
});
