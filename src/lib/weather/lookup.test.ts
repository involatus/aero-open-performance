import { describe, expect, it } from 'vitest';
import { WEATHER_MESSAGES, lookUpWeather } from './lookup.ts';

const reply = (status: number, body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status });
const online = { online: () => true };

describe('weather lookup', () => {
	it('returns the report, and asks by station or by position', async () => {
		const asked: string[] = [];
		const fetch: typeof globalThis.fetch = async (url) => { asked.push(String(url)); return new Response(JSON.stringify({ raw: 'LSZH 081020Z 27005KT', station: 'LSZH', stationName: null, distanceKm: null }), { status: 200 }); };
		expect(await lookUpWeather({ station: ' lszh ' }, { fetch, ...online })).toMatchObject({ ok: true, report: { station: 'LSZH' } });
		await lookUpWeather({ lat: 47.4, lon: 8.2 }, { fetch, ...online });
		expect(asked).toEqual(['/api/metar?station=LSZH', '/api/metar?lat=47.4&lon=8.2']);
	});
	it('turns every failure into something the pilot can act on', async () => {
		for (const code of ['notConfigured', 'noStation', 'badRequest']) expect(await lookUpWeather({ station: 'LSZF' }, { fetch: reply(400, { error: code }), ...online })).toEqual({ ok: false, message: WEATHER_MESSAGES[code] });
		expect(await lookUpWeather({ station: 'LSZF' }, { fetch: reply(502, { error: 'something new' }), ...online })).toEqual({ ok: false, message: WEATHER_MESSAGES.unavailable });
		expect(await lookUpWeather({ station: 'LSZF' }, { fetch: async () => { throw new Error('network'); }, ...online })).toEqual({ ok: false, message: WEATHER_MESSAGES.unavailable });
	});
	it('doesn\'t try without a connection', async () => {
		let called = false;
		const r = await lookUpWeather({ station: 'LSZH' }, { fetch: async () => { called = true; return new Response(); }, online: () => false });
		expect(r).toEqual({ ok: false, message: WEATHER_MESSAGES.offline });
		expect(called).toBe(false);
	});
});
