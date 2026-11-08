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
		expect(d.conditions.find((x) => x.label === 'Fuel flow')!.source).toBe('From aircraft data, confirmed');
		expect(d.conditions.find((x) => x.label === 'QNH')!.source).toBe('Entered by pilot');
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
		expect(JSON.stringify(reportDocument(d))).toContain('Raw METAR: METAR LSXX');
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
		for (const s of ['RESULTS', 'CONDITIONS', 'MASS AND BALANCE', 'LIMITS', 'WORKING', 'CONFIRMATION', RESPONSIBILITY, 'AOP-TEST', 'PRE-RELEASE, NOT FOR FLIGHT', 'FICTIONAL']) expect(all).toContain(s);
		expect(all).toContain('A Pilot');
		expect(all).toContain('LSXX');
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
