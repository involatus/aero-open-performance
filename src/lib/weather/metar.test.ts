import { describe, expect, it, vi } from 'vitest';
import { parseMetar } from './metar.ts';
import { checkWx } from '../server/checkwx.ts';
import { metarResponse, parseQuery } from '../server/metar-endpoint.ts';
import { WeatherError } from './provider.ts';

const NOW = Date.UTC(2026, 10, 6, 15, 0);
const parse = (raw: string) => parseMetar(raw, NOW);

describe('reading a METAR', () => {
	it('reads a normal report', () => {
		const m = parse('METAR LSZH 061450Z 06009KT 020V100 9999 BKN020 07/02 Q1023 NOSIG');
		expect(m).toMatchObject({ station: 'LSZH', qnh: 1023, oat: 7, windDirection: 60, windSpeed: 9, observed: '2026-11-06T14:50:00.000Z' });
	});
	it('works without the METAR prefix, and with AUTO and COR', () => {
		expect(parse('LSMD 061450Z AUTO 09007KT 07/03 Q1023').windSpeed).toBe(7);
		expect(parse('METAR COR LSMD 061450Z 09007KT 07/03 Q1023').station).toBe('LSMD');
	});
	it('reads below-zero temperatures', () => {
		expect(parse('LSXX 061450Z 00000KT M05/M08 Q1030').oat).toBe(-5);
		expect(parse('LSXX 061450Z 00000KT M00/M02 Q1030').oat === 0).toBe(true);
	});
	it('reads calm wind as zero', () => {
		const m = parse('LSXX 061450Z 00000KT 10/05 Q1013');
		expect([m.windDirection, m.windSpeed]).toEqual([0, 0]);
	});
	it('leaves direction empty on variable wind, and says so', () => {
		const m = parse('LSXX 061450Z VRB03KT 10/05 Q1013');
		expect(m.windDirection).toBeNull();
		expect(m.windSpeed).toBe(3);
		expect(m.flags.join()).toContain('variable');
	});
	it('prefills main direction and flags a range', () => {
		const m = parse('LSXX 061450Z 24008KT 200V280 10/05 Q1013');
		expect(m.windDirection).toBe(240);
		expect(m.flags.join()).toContain('200° to 280°');
	});
	it('prefills steady wind and flags a gust', () => {
		const m = parse('LSXX 061450Z 24015G28KT 10/05 Q1013');
		expect(m.windSpeed).toBe(15);
		expect(m.flags.join()).toContain('Gusts to 28 kt');
	});
	it('converts other wind units and says so', () => {
		const m = parse('UUEE 061450Z 24005MPS 10/05 Q1013');
		expect(m.windSpeed).toBe(10);
		expect(m.flags.join()).toContain('MPS');
	});
	it('converts inches of mercury and says so', () => {
		const m = parse('KJFK 061451Z 24008KT 10SM 10/05 A2992');
		expect(m.qnh).toBe(1013);
		expect(m.flags.join()).toContain('inches');
	});
	it('leaves out anything missing or unreadable', () => {
		const m = parse('LSXX 061450Z /////KT //// ///// Q////');
		expect(parse('LSXX 061450Z 24008KT 10/// Q1013').oat).toBe(10);
		expect([m.qnh, m.oat, m.windDirection, m.windSpeed]).toEqual([null, null, null, null]);
		expect(parse('LSXX 061450Z ///05KT 10/05 Q1013').windDirection).toBeNull();
	});
	it('ignores groups in remarks and trends', () => {
		const m = parse('LSXX 061450Z 24008KT 10/05 RMK Q0999 A2800 30050KT');
		expect(m.qnh).toBeNull();
		expect(parse('LSXX 061450Z 24008KT 10/05 Q1013 TEMPO 30050KT').windSpeed).toBe(8);
	});
	it('does not read visibility or runway groups as anything else', () => {
		const m = parse('LSZH 061450Z 24008KT 9999 R14/1200 BKN020 10/05 Q1013');
		expect(m.oat).toBe(10);
		expect(m.qnh).toBe(1013);
	});
	it('resolves a report from the previous month', () => {
		const m = parseMetar('LSXX 302350Z 24008KT 10/05 Q1013', Date.UTC(2026, 10, 1, 0, 5));
		expect(m.observed).toBe('2026-10-30T23:50:00.000Z');
	});
});

describe('METAR proxy', () => {
	const report = { raw: 'METAR LSXX 061450Z 24008KT 10/05 Q1013', station: 'LSXX', stationName: 'X', distanceKm: null };
	const url = (q: string) => new URL(`https://x/api/metar?${q}`);

	it('accepts only station codes or valid coordinates', () => {
		expect(parseQuery(new URLSearchParams('station=lszh'))).toEqual({ station: 'LSZH' });
		for (const bad of ['station=', 'station=LS', 'station=../../x', 'station=LSZH/decoded', 'lat=91&lon=0', 'lat=a&lon=0', 'lat=1', '']) expect(parseQuery(new URLSearchParams(bad))).toBeNull();
	});
	it('rounds coordinates, so an exact position is never sent on', () => {
		expect(parseQuery(new URLSearchParams('lat=47.37123&lon=8.68456'))).toEqual({ lat: 47.37, lon: 8.68 });
	});
	it('returns a report cached for 15 minutes', async () => {
		const r = await metarResponse(url('station=LSXX'), async () => report, 'same-origin');
		expect(r.status).toBe(200);
		expect(r.headers.get('cache-control')).toContain('s-maxage=900');
		expect(await r.json()).toEqual(report);
	});
	it('refuses other websites without calling the provider', async () => {
		const provider = vi.fn(async () => report);
		expect((await metarResponse(url('station=LSXX'), provider, 'cross-site')).status).toBe(403);
		expect(provider).not.toHaveBeenCalled();
	});
	it('rejects a bad request without calling the provider', async () => {
		const provider = vi.fn(async () => report);
		expect((await metarResponse(url('station=x'), provider, 'same-origin')).status).toBe(400);
		expect(provider).not.toHaveBeenCalled();
	});
	it.each([['notConfigured', 501], ['noStation', 404], ['unavailable', 502]] as const)('maps %s, uncached', async (code, status) => {
		const r = await metarResponse(url('station=LSXX'), async () => { throw new WeatherError(code); }, null);
		expect(r.status).toBe(status);
		expect(r.headers.get('cache-control')).toBe('no-store');
	});
});

describe('CheckWX provider', () => {
	const ok = (data: unknown[]) => new Response(JSON.stringify({ data }));
	it('needs a key, and does not call out without one', async () => {
		const f = vi.fn();
		await expect(checkWx(undefined, f)({ station: 'LSXX' })).rejects.toMatchObject({ code: 'notConfigured' });
		expect(f).not.toHaveBeenCalled();
	});
	it('sends the key only in a header', async () => {
		const f = vi.fn(async () => ok([{ raw_text: 'R', icao: 'LSXX', station: { name: 'N' }, position: { distance: { meters: 8600 } } }]));
		const r = await checkWx('SECRET', f as unknown as typeof fetch)({ station: 'LSXX' });
		expect(r).toEqual({ raw: 'R', station: 'LSXX', stationName: 'N', distanceKm: 8.6 });
		const [address, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(address).toBe('https://api.checkwx.com/v2/metar/LSXX/decoded');
		expect(address).not.toContain('SECRET');
		expect((init.headers as Record<string, string>)['X-API-Key']).toBe('SECRET');
	});
	it('uses coordinates for nearest', async () => {
		const f = vi.fn(async () => ok([{ raw_text: 'R', icao: 'LSXX' }]));
		await checkWx('K', f as unknown as typeof fetch)({ lat: 47.37, lon: 8.68 });
		expect((f.mock.calls[0] as unknown as [string])[0]).toBe('https://api.checkwx.com/v2/metar/lat/47.37/lon/8.68/decoded');
	});
	it('treats an empty answer as no station, and failures as errors', async () => {
		const provider = (r: Response) => checkWx('K', (async () => r) as unknown as typeof fetch)({ station: 'ZZZZ' });
		await expect(provider(ok([]))).rejects.toMatchObject({ code: 'noStation' });
		await expect(provider(new Response('{}', { status: 401 }))).rejects.toMatchObject({ code: 'notConfigured' });
		await expect(provider(new Response('{}', { status: 500 }))).rejects.toMatchObject({ code: 'unavailable' });
		await expect(checkWx('K', (async () => { throw new Error('down'); }) as unknown as typeof fetch)({ station: 'X' })).rejects.toMatchObject({ code: 'unavailable' });
	});
});
