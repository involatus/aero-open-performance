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

describe('the weather as a short list', () => {
	it('writes each row as read, waits for missing values, and knows which are still the METAR\'s', async () => {
		const { weatherRows, weatherConfirmed, distancesUseText } = await import('./place-weather.ts');
		const calc = { values: { qnh: '1015', oat: '3', wdir: '40', wspd: '2' } as Record<string, string>, status: { qnh: 'pre', oat: 'pilot', wdir: 'pre', wspd: 'pre' } as Record<string, 'pre' | 'ok' | 'pilot'>, sources: { qnh: 'METAR LSMD', oat: 'METAR LSMD', wdir: 'METAR LSMD', wspd: 'METAR LSMD' } as Record<string, string> };
		const rows = weatherRows(calc, 'departure');
		expect(rows.map((r) => [r.id, r.value, r.fromMetar])).toEqual([['qnh', '1015 hPa', true], ['oat', '3 °C', false], ['wind', '040° / 2 kt', true]]);
		calc.values.wdir = 'VRB';
		expect(weatherRows(calc, 'departure')[2].value).toBe('VRB / 2 kt');
		delete calc.values.wspd;
		expect(weatherRows(calc, 'departure')[2].value).toBeNull();
		expect(weatherConfirmed(calc, 'departure')).toBe(false);
		calc.status.qnh = 'ok'; calc.status.wdir = 'ok'; calc.status.wspd = 'ok';
		expect(weatherConfirmed(calc, 'departure')).toBe(true);
		expect(distancesUseText({ headwind: -2.4, crosswind: 1 }, 30)).toBe('tailwind 2 kt on runway 30');
		expect(distancesUseText({ headwind: 0.3, crosswind: 0 }, 8)).toBe('no wind on runway 08');
		expect(distancesUseText(null, 8)).toBeNull();
	});
});
