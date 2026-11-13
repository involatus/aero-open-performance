import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAircraft } from '../aircraft/validate.ts';
import type { Aircraft } from '../aircraft/schema.ts';
import { calculate } from '../engine/index.ts';
import { newCalculation, setByPilot, toInput, type Calculation } from '../app/calculation.ts';
import { chartSvg } from './chart.ts';
import { RESPONSIBILITY, createReportData, deliveryLabel, fingerprint, isExpired, newReportId, reportDocument } from './report.ts';

const load = (name: string): Aircraft => {
	const r = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${name}.json`, 'utf8')));
	if (!r.ok) throw new Error(r.problems.join());
	return r.aircraft;
};
const NOW = Date.UTC(2026, 10, 6, 12, 30);
function ready(a: Aircraft): Calculation {
	const c = newCalculation(a, 'x', NOW);
	const inPounds = a.units.mass === 'lb';
	setByPilot(c, `load:${a.stations[0].id}`, inPounds ? '170' : '80');
	a.tanks.forEach((t) => setByPilot(c, `fuel:${t.id}`, inPounds ? '30' : '20'));
	for (const [k, v] of [['time', '1'], ['flow', '20'], ['elev', '100'], ['rwy', '9'], ['qnh', '1013'], ['oat', '15'], ['wdir', '90'], ['wspd', '5']]) setByPilot(c, k, v);
	c.values.place = 'LSXX'; c.values.name = 'A Pilot';
	a.notes.forEach((n) => { c.notes[n.id] = true; });
	return c;
}
const meta = (a: Aircraft, c: Calculation, r = calculate(a, toInput(a, c))) => ({ id: 'AOP-TEST', now: NOW, toolVersion: '0.1.0', dataRelease: 'Demo data', lastDataCheck: 'n/a', preRelease: true, chartSvg: chartSvg(a, r, c.configuration) });
const NAMES = ['test-dr-style', 'test-sr22-style', 'test-glastar-style', 'test-kitfox-style'];

describe('creating a Report', () => {
	const a = load('test-dr-style');
	it('refuses until everything is confirmed', () => {
		const c = ready(a); c.values.name = '';
		expect(() => createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c))).toThrow();
	});
	it('refuses when a limit is exceeded, with no way around it', () => {
		const c = ready(a); setByPilot(c, 'load:rear', '101');
		expect(() => createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c))).toThrow();
	});
	it('shows the same numbers as the engine', () => {
		const c = ready(a), r = calculate(a, toInput(a, c)), d = createReportData(a, c, r, meta(a, c));
		expect(d.results.takeoff.headline).toBe(`${r.takeoff.total} m`);
		expect(d.results.landing.headline).toBe(`${r.landing.groundRoll} m`);
		expect(d.massBalance.takeoff.mass).toBe(r.massBalance.takeoff.mass.toFixed(1));
		expect(d.massBalance.landing.arm).toBe(r.massBalance.landing.arm.toFixed(3));
	});
	it('is a snapshot that later changes cannot touch', () => {
		const c = ready(a), r = calculate(a, toInput(a, c)), d = createReportData(a, c, r, meta(a, c)), before = JSON.stringify(d);
		setByPilot(c, 'load:pilot', '90'); c.values.name = 'Someone Else'; r.massBalance.limits.length = 0; r.takeoff.warnings.push('x');
		expect(JSON.stringify(d)).toBe(before);
	});
	it('records each value\'s source', () => {
		const c = newCalculation(a, 'x', NOW);
		Object.assign(c, ready(a), { sources: { flow: 'aircraft data' } });
		c.status.flow = 'ok';
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.massBalance.flow!.source).toBe('From aircraft data');
		expect(d.conditions.find((x) => x.label === 'QNH')!.source).toBe('Entered by pilot');
	});
	it('records which wind the distances use', () => {
		const c = ready(a);
		expect(createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c)).results.windShort).toEqual({ reported: '090° 5 kt', used: 'HW 5 kt · XW 0 kt', choice: null });
		c.windForDistances = 'tail3';
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.results.windShort).toEqual({ reported: '090° 5 kt', used: 'TW 3 kt · XW 0 kt', choice: 'TW 3 kt chosen' });
		expect(d.results.wind).toContain('Distances use: Tailwind 3 kt');
	});
	it('writes a variable wind as a METAR does, applied as a tailwind', () => {
		const c = ready(a); setByPilot(c, 'wdir', 'VRB');
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.conditions.find((x) => x.label === 'Wind')!.value).toBe('VRB 5 kt');
		expect(d.results.windShort).toMatchObject({ reported: 'VRB 5 kt', used: 'TW 5 kt' });
	});
	it('records the landing airfield and its conditions when landing elsewhere', () => {
		const c = ready(a);
		expect(createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c)).landing).toBeNull();
		c.landingElsewhere = true;
		for (const [k, v] of [['elev', '450'], ['rwy', '25'], ['qnh', '1005'], ['oat', '20'], ['wdir', '250'], ['wspd', '10']]) setByPilot(c, `land:${k}`, v);
		c.values['land:place'] = 'LSYY';
		const before = fingerprint(a, c);
		c.landingWindForDistances = 'none';
		expect(fingerprint(a, c)).not.toBe(before);
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.landing).toMatchObject({ airfield: 'LSYY', runway: '25', wind: '10 kt head. Crosswind 0 kt. Distances use: No wind', rawMetar: null });
		expect(d.landing?.windShort).toEqual({ reported: '250° 10 kt', used: 'HW 0 kt · XW 0 kt', choice: 'No wind chosen' });
		const row = (label: string) => d.conditions.find((x) => x.label === label)!;
		expect(row('Runway')).toEqual({ label: 'Runway', value: '09 (090°)', source: 'Entered by pilot', landing: { value: '25 (250°)', source: 'Entered by pilot' } });
		expect(d.conditions.map((x) => x.label)).toEqual(['Elevation', 'Runway', 'QNH', 'OAT', 'Wind']);
		const doc = JSON.stringify(reportDocument(d));
		expect(doc).toContain('LSXX RWY 09 → LSYY RWY 25');
	});
	it('says so when a result has no data, without blocking', () => {
		const c = ready(a); c.landingCondition = 'grass';
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.results.landing.headline).toBe("No data: pilot's judgement");
	});
	it('carries the raw METAR and each value\'s station', () => {
		const c = ready(a);
		c.status.qnh = 'pre'; delete c.status.qnh; c.status.oat = 'ok'; c.sources.oat = 'METAR LSXX';
		c.status.qnh = 'pilot';
		c.weather = { raw: 'METAR LSXX 061250Z 24008KT 12/06 Q1009', station: 'LSXX', stationName: null, distanceKm: null, observed: null, flags: [] };
		const d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.rawMetar).toBe('METAR LSXX 061250Z 24008KT 12/06 Q1009');
		expect(d.conditions.find((x) => x.label === 'OAT')!.source).toBe('From METAR LSXX, confirmed');
		const doc = JSON.stringify(reportDocument(d));
		expect(doc).toContain('unmarked: entered by pilot');
		expect(doc).not.toContain(', confirmed');
		expect(doc).toContain('METAR LSXX 061250Z 24008KT 12/06 Q1009');
	});
	it('keeps warnings and cites manual sources in the working', () => {
		const c = ready(a), d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.results.takeoff.warnings.join()).toContain('did not change');
		expect(d.working[0].rows[0].source).toContain('Fictional test manual');
		expect(d.working[0].rows[0].step).toContain('Table values');
	});
});

describe('Report layout', () => {
	const text = (x: unknown): string => JSON.stringify(x);
	it.each(NAMES)('%s has every required section', (name) => {
		const a = load(name), c = ready(a);
		const r = calculate(a, toInput(a, c));
		const doc = reportDocument(createReportData(a, c, r, meta(a, c, r))), all = text(doc);
		for (const s of ['Takeoff', 'Landing', 'DA', 'Wind', 'Conditions', 'Mass and balance', 'Burn plan', 'Limits', 'Working', RESPONSIBILITY, 'AOP-TEST', 'PRE-RELEASE, NOT FOR FLIGHT', 'FICTIONAL']) expect(all).toContain(s);
		expect(all).toContain('A Pilot');
		expect(all).toContain('LSXX');
	});
	it('puts fuel on its tank row and the burn on one line', () => {
		const a = load('test-dr-style'), c = ready(a), d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		expect(d.massBalance.rows.filter((r) => r.fuel).map((r) => r.fuel!.value)).toEqual(a.tanks.map(() => '20 L'));
		expect(d.massBalance.time).toEqual({ value: '1 h', source: 'Entered by pilot' });
	});
	it('shows each table a result read, with where the result falls', () => {
		const a = load('test-sr22-style'), c = ready(a), d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		const takeoff = d.working[0].tables!;
		expect(takeoff).toHaveLength(1);
		expect(takeoff[0].caption).toMatch(/^Total distance, ft, as printed in /);
		expect(takeoff[0].view.grids.length).toBeGreaterThan(0);
		const all = text(reportDocument(d));
		expect(all).toContain('printed values used');
		expect(all).toContain('#1D5C96');
	});
	it('still renders Reports made before the lookup tables', () => {
		const a = load('test-dr-style'), c = ready(a), d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		d.working.forEach((w) => delete w.tables);
		const all = text(reportDocument(d));
		expect(all).toContain('Working');
		expect(all).not.toContain('printed values used');
	});
	it('still renders Reports made before the compact layout', () => {
		const a = load('test-dr-style'), c = ready(a), d = createReportData(a, c, calculate(a, toInput(a, c)), meta(a, c));
		delete d.results.windShort; delete d.massBalance.time; delete d.massBalance.flow; delete d.results.takeoff.mass;
		d.massBalance.rows.forEach((r) => delete r.fuel);
		d.conditions.push({ label: 'Fuel flow', value: '20 L/h', source: 'From aircraft data' });
		const all = text(reportDocument(d));
		expect(all).toContain('Burned');
		expect(all).toContain('Fuel flow');
	});
	it('drops the pre-release line only when asked', () => {
		const a = { ...load('test-dr-style'), fictional: false }, c = ready(a), r = calculate(a, toInput(a, c));
		expect(text(reportDocument(createReportData(a, c, r, { ...meta(a, c, r), preRelease: false })))).not.toContain('NOT FOR FLIGHT');
	});
});

describe('the permanent record', () => {
	it('cannot be changed through the PDF document, as pdfmake does', () => {
		const a = load('test-dr-style'), c = ready(a), r = calculate(a, toInput(a, c)), data = createReportData(a, c, r, meta(a, c, r)), before = JSON.stringify(data);
		const walk = (node: unknown) => {
			if (Array.isArray(node)) node.forEach((item, i) => { walk(item); node[i] = { changed: () => 1, was: item }; });
			else if (node && typeof node === 'object') Object.values(node).forEach(walk);
		};
		walk(reportDocument(data));
		expect(JSON.stringify(data)).toBe(before);
		expect(() => structuredClone(data)).not.toThrow();
	});
});

describe('chart', () => {
	it.each(NAMES)('%s draws to scale with no invalid numbers', (name) => {
		const a = load(name), c = ready(a), svg = chartSvg(a, calculate(a, toInput(a, c)), c.configuration);
		expect(svg).toContain('<polygon');
		expect(svg).not.toMatch(/NaN|Infinity|undefined/);
	});
});

describe('identity and retention', () => {
	it('makes readable, unique IDs', () => {
		expect(newReportId(NOW, new Uint8Array([1, 2, 171, 255]))).toBe('AOP-20261106123000-0102ABFF');
		expect(newReportId(NOW, new Uint8Array([1, 2, 3, 4]))).not.toBe(newReportId(NOW, new Uint8Array([1, 2, 3, 5])));
	});
	const day = 86400000;
	it('removes delivered Reports after 90 days', () => {
		expect(isExpired({ created: NOW, delivery: 'sent' }, NOW + 90 * day)).toBe(false);
		expect(isExpired({ created: NOW, delivery: 'sent' }, NOW + 90 * day + 1)).toBe(true);
		expect(isExpired({ created: NOW, delivery: 'shared' }, NOW + 91 * day)).toBe(true);
	});
	it('never removes an unsent Report', () => expect(isExpired({ created: NOW, delivery: 'notSent' }, NOW + 1000 * day)).toBe(false));
	it('labels delivery in words', () => {
		expect(deliveryLabel('notSent')).toBe('Not sent');
		expect(deliveryLabel('sent')).toBe('Sent');
		expect(deliveryLabel('shared')).toBe('Shared, delivery unknown');
	});
	it('notices when inputs change after a Report', () => {
		const a = load('test-dr-style'), c = ready(a), f = fingerprint(a, c);
		expect(fingerprint(a, c)).toBe(f);
		setByPilot(c, 'qnh', '1000');
		expect(fingerprint(a, c)).not.toBe(f);
	});
});
