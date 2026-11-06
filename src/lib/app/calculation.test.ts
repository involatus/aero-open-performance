import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateAircraft } from '../aircraft/validate.ts';
import type { Aircraft } from '../aircraft/schema.ts';
import { calculate } from '../engine/index.ts';
import { applyKey, applyQuick, applyWeather, canReport, changeConfiguration, confirmValue, confirmWeather, isOldCalculation, reportAgeMinutes, fieldsFor, newCalculation, nextFlight, parse, prefill, setByPilot, stepOfLimit, tabLabels, toDoList, toInput, type Calculation } from './calculation.ts';

const load = (name: string): Aircraft => {
	const r = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${name}.json`, 'utf8')));
	if (!r.ok) throw new Error(r.problems.join());
	return r.aircraft;
};
const dr = load('test-dr-style'), kf = load('test-kitfox-style');
const NOW = Date.UTC(2026, 10, 6);
function ready(a: Aircraft): Calculation {
	const c = newCalculation(a, 'x', NOW);
	const set = (k: string, v: string) => setByPilot(c, k, v);
	set(`load:${a.stations[0].id}`, '80');
	a.tanks.forEach((t) => set(`fuel:${t.id}`, '20'));
	set('time', '1'); set('flow', '20'); set('elev', '100'); set('hdg', '90'); set('qnh', '1013'); set('oat', '15'); set('wdir', '90'); set('wspd', '5');
	c.values.place = 'LSXX'; c.values.name = 'A Pilot';
	a.notes.forEach((n) => { c.notes[n.id] = true; });
	return c;
}

describe('keypad', () => {
	const f = { decimals: true, negative: true }, whole = { decimals: false, negative: false };
	it('replaces the value on the first press, then appends', () => {
		expect(applyKey(f, '1009', true, '9')).toBe('9');
		expect(applyKey(f, '9', false, '8')).toBe('98');
	});
	it('blocks decimals and minus where the field has none', () => {
		expect(applyKey(whole, '10', false, '.')).toBe('10');
		expect(applyKey(whole, '10', false, 'neg')).toBe('10');
	});
	it('allows one decimal point and starts with zero', () => {
		expect(applyKey(f, '', false, '.')).toBe('0.');
		expect(applyKey(f, '1.5', false, '.')).toBe('1.5');
	});
	it('toggles minus', () => {
		expect(applyKey(f, '5', false, 'neg')).toBe('-5');
		expect(applyKey(f, '-5', false, 'neg')).toBe('5');
	});
	it('drops a leading zero', () => expect(applyKey(f, '0', false, '7')).toBe('7'));
	it('deletes and clears, keeping the value when backspacing a fresh field', () => {
		expect(applyKey(f, '123', true, 'back')).toBe('12');
		expect(applyKey(f, '123', false, 'clear')).toBe('');
	});
	it('always gives something a number parser accepts or an empty value', () => {
		const keys = fc.array(fc.constantFrom('0', '1', '9', '.', 'neg', 'back', 'clear'), { maxLength: 20 });
		fc.assert(fc.property(keys, (presses) => {
			let v = '';
			presses.forEach((k) => { v = applyKey(f, v, false, k); });
			if (v !== '' && v !== '-') expect(Number.isFinite(Number(v))).toBe(true);
		}));
	});
	it('limits length', () => {
		let v = '';
		for (let i = 0; i < 12; i++) v = applyKey(f, v, false, '1');
		expect(v.length).toBe(6);
	});
});

describe('fields come from the aircraft file', () => {
	it('uses each aircraft\'s stations, tanks and units', () => {
		const sr = load('test-sr22-style'), [loadFields, fuel] = fieldsFor(sr, { elevationUnit: 'ft' });
		expect(loadFields.map((f) => f.label)).toEqual(sr.stations.map((s) => s.label));
		expect(loadFields[0].unit).toBe('lb');
		expect(fuel[0].unit).toBe('USgal');
		expect(fuel.find((f) => f.key === 'flow')!.unit).toBe('USgal/h');
	});
	it('gives each field its own keypad rules', () => {
		const conditions = fieldsFor(dr, { elevationUnit: 'm' })[2], get = (k: string) => conditions.find((f) => f.key === k)!;
		expect(get('qnh').decimals).toBe(false);
		expect(get('qnh').negative).toBe(false);
		expect(get('oat').negative).toBe(true);
		expect(get('oat').decimals).toBe(true);
		expect(get('elev').negative).toBe(true);
	});
	it('quick buttons change values as labelled', () => {
		const fuel = fieldsFor(dr, { elevationUnit: 'm' })[1][0];
		expect(applyQuick(fuel, '20', 'Full')).toBe('50');
		expect(applyQuick(fuel, '20', '+10')).toBe('30');
		expect(applyQuick(fuel, '5', '-10')).toBe('0');
		expect(applyQuick(fuel, '5', '=1.5')).toBe('1.5');
	});
});

describe('Prefilled Values', () => {
	it('start unconfirmed and appear on the to-do list', () => {
		const c = newCalculation(dr, 'x', NOW);
		expect(c.status.flow).toBe('pre');
		expect(toDoList(dr, c).some((t) => t.label === 'Confirm Fuel flow')).toBe(true);
		confirmValue(c, 'flow');
		expect(toDoList(dr, c).some((t) => t.label === 'Confirm Fuel flow')).toBe(false);
	});
	it('never replace what the pilot typed', () => {
		const c = newCalculation(dr, 'x', NOW);
		setByPilot(c, 'qnh', '1000');
		prefill(c, 'qnh', '1020', 'METAR');
		expect(c.values.qnh).toBe('1000');
		expect(c.status.qnh).toBe('pilot');
	});
	it('need confirming again and show what changed when replaced', () => {
		const c = newCalculation(dr, 'x', NOW);
		prefill(c, 'qnh', '1009', 'METAR');
		confirmValue(c, 'qnh');
		prefill(c, 'qnh', '1008', 'METAR');
		expect(c.status.qnh).toBe('pre');
		expect(c.changed.qnh).toBe('1009');
	});
});

describe('reporting gate', () => {
	it('is ready only when everything is done', () => {
		const c = ready(dr);
		expect(toDoList(dr, c)).toEqual([]);
		expect(canReport(dr, c, calculate(dr, toInput(dr, c)))).toBe(true);
	});
	it.each(['elev', 'qnh', 'oat', 'hdg', 'wdir', 'wspd', 'time', 'flow'])('requires %s', (key) => {
		const c = ready(dr);
		c.values[key] = '';
		expect(toDoList(dr, c).map((t) => t.key)).toContain(key);
	});
	it('requires a load, the place, the name and every note', () => {
		const c = ready(dr);
		c.values['load:pilot'] = '0'; c.values.place = ' '; c.values.name = ''; c.notes = {};
		expect(toDoList(dr, c).map((t) => t.key).sort()).toEqual(['load:pilot', 'name', `note:${dr.notes[0].id}`, 'place'].sort());
	});
	it('flags an implausible value', () => {
		const c = ready(dr);
		c.values.qnh = '500';
		expect(toDoList(dr, c).find((t) => t.key === 'qnh')?.label).toBe('Check QNH');
	});
	it('blocks when a limit is exceeded', () => {
		const c = ready(dr);
		setByPilot(c, 'load:rear', '101');
		const r = calculate(dr, toInput(dr, c));
		expect(r.exceeded).toContain('station:rear');
		expect(canReport(dr, c, r)).toBe(false);
		expect(stepOfLimit('station:rear')).toBe(0);
	});
	it('does not block on a no-data result', () => {
		const c = ready(dr);
		c.landingCondition = 'grass';
		const r = calculate(dr, toInput(dr, c));
		expect(r.landing.status).toBe('noData');
		expect(canReport(dr, c, r)).toBe(true);
	});
});

describe('next flight', () => {
	const c = ready(dr);
	const r = calculate(dr, toInput(dr, c));
	const n = nextFlight(dr, c, r, 'y', NOW);
	it('keeps aircraft, load and name', () => {
		expect(n.values['load:pilot']).toBe('80');
		expect(n.values.name).toBe('A Pilot');
		expect(n.aircraft).toBe(dr.registration);
	});
	it('starts from landing fuel, to confirm', () => {
		expect(n.values['fuel:front']).toBe('10');
		expect(n.values['fuel:rear']).toBe('10');
		expect(n.status['fuel:front']).toBe('pre');
		expect(n.sources['fuel:front']).toBe('previous flight');
	});
	it('clears everything specific to the place and flight', () => {
		for (const k of ['elev', 'hdg', 'qnh', 'oat', 'wdir', 'wspd', 'time', 'place']) expect(n.values[k]).toBeUndefined();
		expect(Object.values(n.notes)).toEqual([]);
	});
	it('does not change the original', () => expect(c.values['fuel:front']).toBe('20'));
});

describe('tabs and configurations', () => {
	it('names tabs by aircraft, place and date, numbering repeats', () => {
		const a = newCalculation(kf, 'a', NOW), b = newCalculation(kf, 'b', NOW), d = newCalculation(kf, 'd', NOW);
		a.values.place = 'LSXX';
		expect(tabLabels([a, b, d])).toEqual(['TEST-KF LSXX, 6 Nov', 'TEST-KF, 6 Nov', 'TEST-KF, 6 Nov (2)']);
	});
	it('a Configuration with no performance gives no data', () => {
		const c = ready(dr);
		changeConfiguration(dr, c, 'skis');
		const r = calculate(dr, toInput(dr, c));
		expect(r.takeoff.status).toBe('noData');
	});
	it('reads comma decimals and rejects junk', () => {
		expect(parse('1,5')).toBe(1.5);
		expect(parse('')).toBeNull();
		expect(parse('-')).toBeNull();
		expect(parse(undefined)).toBeNull();
	});
	it('never crashes the engine, whatever the pilot enters', () => {
		const text = fc.oneof(fc.constant(''), fc.constant('-'), fc.constant('0.'), fc.double({ min: -1000, max: 100000, noNaN: true }).map(String));
		fc.assert(fc.property(fc.dictionary(fc.constantFrom('load:pilot', 'load:rear', 'fuel:front', 'fuel:rear', 'time', 'flow', 'elev', 'hdg', 'qnh', 'oat', 'wdir', 'wspd'), text), (values) => {
			const c = newCalculation(dr, 'x', NOW);
			Object.assign(c.values, values);
			const r = calculate(dr, toInput(dr, c));
			expect(Number.isFinite(r.massBalance.takeoff.mass)).toBe(true);
		}));
	});
});

describe('weather prefill', () => {
	const report = (raw: string) => ({ raw, station: 'LSXX', stationName: 'Example', distanceKm: 8.6 });
	const at = Date.UTC(2026, 10, 6, 13, 0);
	const METAR = 'METAR LSXX 061250Z 24008KT 9999 FEW040 12/06 Q1009';
	it('prefills values to confirm, from the named station', () => {
		const c = newCalculation(dr, 'x', NOW);
		applyWeather(c, report(METAR), at);
		expect([c.values.qnh, c.values.oat, c.values.wdir, c.values.wspd]).toEqual(['1009', '12', '240', '8']);
		expect(c.status.qnh).toBe('pre');
		expect(c.sources.qnh).toBe('METAR LSXX');
		expect(toDoList(dr, c).map((t) => t.label)).toContain('Confirm QNH');
		confirmWeather(c);
		expect(toDoList(dr, c).map((t) => t.label)).not.toContain('Confirm QNH');
	});
	it('never touches what the pilot typed, and needs confirming again when newer', () => {
		const c = newCalculation(dr, 'x', NOW);
		applyWeather(c, report(METAR), at);
		confirmWeather(c);
		setByPilot(c, 'oat', '9');
		applyWeather(c, report('METAR LSXX 061320Z 26011KT 14/06 Q1008'), at);
		expect(c.values.oat).toBe('9');
		expect(c.status.oat).toBe('pilot');
		expect(c.values.qnh).toBe('1008');
		expect(c.status.qnh).toBe('pre');
		expect(c.changed.qnh).toBe('1009');
	});
	it('leaves a direction empty on variable wind', () => {
		const c = newCalculation(dr, 'x', NOW);
		applyWeather(c, report(METAR), at);
		applyWeather(c, report('METAR LSXX 061320Z VRB03KT 12/06 Q1009'), at);
		expect(c.values.wdir).toBeUndefined();
		expect(c.values.wspd).toBe('3');
		expect(toDoList(dr, c).map((t) => t.label)).toContain('Enter Wind from');
	});
	it('reports its age', () => {
		const c = newCalculation(dr, 'x', NOW);
		applyWeather(c, report(METAR), at);
		expect(reportAgeMinutes(c.weather, at)).toBe(10);
		expect(reportAgeMinutes(null, at)).toBeNull();
	});
	it('asks for fresh weather on old calculations', () => {
		const c = newCalculation(dr, 'x', NOW);
		expect(isOldCalculation(c, NOW + 7 * 86400000)).toBe(false);
		expect(isOldCalculation(c, NOW + 7 * 86400000 + 1)).toBe(true);
	});
	it('does not carry weather into the next flight', () => {
		const c = newCalculation(dr, 'x', NOW);
		applyWeather(c, report(METAR), at);
		const n = nextFlight(dr, c, calculate(dr, toInput(dr, c)), 'y', NOW);
		expect(n.weather).toBeUndefined();
		expect(n.values.qnh).toBeUndefined();
		expect(n.values.station).toBeUndefined();
	});
});
