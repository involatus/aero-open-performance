import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findAirfields, magneticHeading, parseAirfields, runwayNumber, surfaceKind } from './airfields.ts';
import { applyAirfield, applyRunway, conditionCorrections, fieldsFor, newCalculation, setByPilot, toInput } from '../app/calculation.ts';
import { validateAircraft } from '../aircraft/validate.ts';

const data = parseAirfields({
	source: 'test', date: '2026-11-08',
	airports: [
		['LSZF', 'Birrfeld Airfield', 1300, 47.444, 8.234, [['08', '26', 'asphalt', 2356], ['08R', '26L', 'GRASS', 2264]]],
		['LSPF', 'Schmerlat Airfield', 1519, 47.69, 8.526, [['07', '25', 'GRASS', 1772]]],
		['XH1', 'Field with a helipad', null, 0, 0, [['H1', '', 'ASPH', 60]]]
	]
});
const aircraft = (n: string) => {
	const v = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8')));
	if (!v.ok) throw new Error(n);
	return v.aircraft;
};

describe('airfield list', () => {
	it('reads runway numbers from designators, and skips helipads', () => {
		expect(['08', '26L', '8', '36', '00', 'H1', '37', 'N'].map(runwayNumber)).toEqual([8, 26, 8, 36, null, null, null, null]);
		expect(data.airfields[2].runways).toEqual([]);
	});
	it('names surfaces it recognises, and keeps the rest as unknown', () => {
		expect(['ASP', 'asphalt', 'CONC', 'TURF', 'GRS', 'Grass', 'GVL', 'WATER', 'X', ''].map(surfaceKind)).toEqual(['paved', 'paved', 'paved', 'grass', 'grass', 'grass', 'gravel', 'water', 'unknown', 'unknown']);
	});
	it('gives both ends of every runway, with length in metres', () => {
		expect(data.airfields[0].runways.map((r) => `${r.designator} ${r.surfaceKind} ${r.lengthM}`)).toEqual(['08 paved 718', '26 paved 718', '08R grass 690', '26L grass 690']);
	});
	it('finds the exact identifier first, then names', () => {
		expect(findAirfields(data, 'lszf').map((a) => a.ident)).toEqual(['LSZF']);
		expect(findAirfields(data, 'airfield').map((a) => a.ident)).toEqual(['LSZF', 'LSPF']);
		expect(findAirfields(data, 'L')).toEqual([]);
		expect(findAirfields(data, 'nowhere')).toEqual([]);
	});
	it('the shipped list is readable and has Birrfeld', () => {
		const shipped = parseAirfields(JSON.parse(readFileSync('static/airports.json', 'utf8')));
		expect(shipped.airfields.length).toBeGreaterThan(20000);
		expect(findAirfields(shipped, 'LSZF')[0].elevationFt).toBe(1300);
	});
});

describe('prefilling from the airfield list', () => {
	it('prefills elevation in the chosen unit and the runway, all to be confirmed', () => {
		const a = aircraft('test-dr-style'), c = newCalculation(a, 'x', 0);
		applyAirfield(c, data.airfields[0], '2026-11-08');
		expect(c.values.elev).toBe('396');
		expect(c.status.elev).toBe('pre');
		expect(c.sources.elev).toBe('airfield list LSZF, 2026-11-08');
		expect(c.values.place).toBe('LSZF Birrfeld Airfield');
		expect(c.values.station).toBe('LSZF');
		applyRunway(c, data.airfields[0].runways[2]);
		expect(c.values.rwy).toBe('08');
		// Tapping the runway is the pilot's choice: the runway and the list's elevation count as checked.
		expect(c.status.rwy).toBe('ok');
		expect(c.status.elev).toBe('ok');
		expect(c.airfield?.runway?.surface).toBe('GRASS');
		expect(toInput(a, c).runwayHeading).toBe(80);
	});
	it('never overwrites what the pilot typed', () => {
		const a = aircraft('test-dr-style'), c = newCalculation(a, 'x', 0);
		c.elevationUnit = 'ft';
		setByPilot(c, 'elev', '1310');
		c.values.place = 'Birrfeld';
		applyAirfield(c, data.airfields[0], '2026-11-08');
		expect(c.values.elev).toBe('1310');
		expect(c.status.elev).toBe('pilot');
		expect(c.values.place).toBe('Birrfeld');
	});
});

describe('corrections shown for a condition', () => {
	it('lists surface and factor steps in words', () => {
		const gl = aircraft('test-glastar-style');
		expect(conditionCorrections(gl.performance.takeoff.find((c) => c.id === 'softGrass'))).toEqual(['+50% ground roll, also added to the total']);
		expect(conditionCorrections(gl.performance.takeoff.find((c) => c.id === 'hard'))).toEqual([]);
		expect(conditionCorrections({ kind: 'steps', id: 'w', label: 'Wet grass', distanceUnit: 'm', steps: [{ type: 'lookup', table: 't' }, { type: 'factor', value: 1.3, applies: ['total', 'groundRoll'], reason: 'Wet grass (UK CAA)', source: 's' }] }))
			.toEqual(['× 1.3 both distances (Wet grass (UK CAA))']);
	});
});

describe('measured runway headings', () => {
	const raw = { source: 'test', date: '2026-11-15', airports: [
		['LSZH', 'Zurich', 1416, 47.46, 8.55, [['10', '28', 'CON', 8202, 96, 276], ['16', '34', 'CON', 12139, null, 335]]],
		['LSZK', 'Speck', 1745, 47.38, 8.65, [['12', '30', 'GRASS', 2051]]]
	] } as Parameters<typeof parseAirfields>[0];
	const headed = parseAirfields(raw);
	const end = (ident: string, d: string) => headed.airfields.find((a) => a.ident === ident)!.runways.find((r) => r.designator === d)!;
	it('keeps each end\'s true heading, and takes the opposite end\'s when one is missing', () => {
		expect(end('LSZH', '28').headingTrue).toBe(276);
		expect(end('LSZH', '16').headingTrue).toBe(155);
		expect(end('LSZK', '30').headingTrue).toBeNull();
	});
	it('gives the magnetic heading, or the runway number where nothing was measured', () => {
		expect(magneticHeading(end('LSZH', '28'), 3.4)).toBe(273);
		expect(magneticHeading(end('LSZK', '30'), 3.4)).toBe(300);
		expect(magneticHeading({ number: 36, headingTrue: 2 }, 3.4)).toBe(359);
	});
	it('is used for the calculation and the hint once the runway is chosen from the list', () => {
		const v = validateAircraft(JSON.parse(readFileSync('aircraft-examples/test-glastar-style.json', 'utf8')));
		if (!v.ok) throw new Error('example');
		const a = v.aircraft, c = newCalculation(a, 'x', Date.UTC(2026, 10, 15));
		applyAirfield(c, headed.airfields[0], headed.date);
		applyRunway(c, end('LSZH', '28'), 'departure', 3.4);
		expect(c.airfield?.runway?.heading).toBe(273);
		expect(toInput(a, c).runwayHeading).toBe(273);
		expect(fieldsFor(a, c).flat().find((f) => f.key === 'rwy')!.hint).toBe('Runway 28, heading 273° magnetic, measured');
		setByPilot(c, 'rwy', '10');
		expect(toInput(a, c).runwayHeading).toBe(100);
	});
});
