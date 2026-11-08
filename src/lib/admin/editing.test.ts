import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateAircraft } from '../aircraft/validate.ts';
import { calculate, runHandCases } from '../engine/index.ts';
import { convertAircraft, documents, factor, makeId, parseNumber, pruneSources, shown, sourceFor, stored, usedSources, type Units } from './editing.ts';

const raw = (n: string) => JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8'));
const US: Units = { mass: 'lb', arm: 'in', volume: 'USgal' };
const METRIC: Units = { mass: 'kg', arm: 'cm', volume: 'L' };

describe('typed numbers', () => {
	it('reads a point or a comma as the decimal mark', () => {
		expect(parseNumber('256.54').value).toBe(256.54);
		expect(parseNumber('256,54').value).toBe(256.54);
		expect(parseNumber(' -1.5 ').value).toBe(-1.5);
		expect(parseNumber('0,720').value).toBe(0.72);
	});
	it('reads thousands separators that cannot be misread', () => {
		expect(parseNumber("1'960").value).toBe(1960);
		expect(parseNumber('1 960').value).toBe(1960);
		expect(parseNumber('1,960.5').value).toBe(1960.5);
	});
	it('refuses "1,960", which a US manual and a European reader mean differently', () => {
		const p = parseNumber('1,960');
		expect(p.value).toBeNull();
		expect(p.error).toContain('1960');
		expect(p.error).toContain('1.960');
	});
	it('refuses anything else, and treats empty as no value', () => {
		for (const t of ['abc', '1.2.3', '-', '1e5', '12a']) expect(parseNumber(t).error).not.toBeNull();
		expect(parseNumber('  ')).toEqual({ value: null, error: null });
	});
});

describe('manual units', () => {
	const a = { units: METRIC, manualUnits: US };
	it('converts with the exact constants', () => {
		expect(stored(a, 'mass', 1960)).toBe(889.0410452);
		expect(stored(a, 'arm', 101)).toBe(256.54);
		expect(stored(a, 'volume', 27.6)).toBe(104.477365238);
		expect(stored(a, 'density', 6)).toBeCloseTo(0.7189586, 7);
		expect(factor('moment', US, METRIC)).toBeCloseTo(0.45359237 * 2.54, 12);
	});
	it('shows what was typed, for any value', () => {
		fc.assert(fc.property(fc.integer({ min: -1e8, max: 1e8 }).map((n) => n / 1000), fc.constantFrom('mass', 'arm', 'volume', 'density', 'moment' as const), (x, kind) => {
			const typed = x;
			expect(shown(a, kind, stored(a, kind, typed))).toBe(typed);
		}));
	});
	it('changes nothing when the manual uses the same units as pilots', () => {
		expect(stored({ units: METRIC }, 'mass', 1.23456789)).toBe(1.23456789);
	});
});

describe('changing the units pilots see', () => {
	it.each(['test-dr-style', 'test-sr22-style', 'test-glastar-style', 'test-kitfox-style'])('%s gives the same results in other units and back', (n) => {
		const original = raw(n);
		const other: Units = original.units.mass === 'kg' ? US : METRIC;
		const converted = structuredClone(original);
		convertAircraft(converted, other);
		expect(validateAircraft(converted).ok).toBe(true);
		for (const c of original.handCases) {
			const before = calculate(original, c.input), after = calculate(converted, converted.handCases.find((h: any) => h.id === c.id).input);
			const kg = (x: number, u: string) => (u === 'lb' ? x * 0.45359237 : x);
			expect(kg(after.massBalance.takeoff.mass, other.mass)).toBeCloseTo(kg(before.massBalance.takeoff.mass, original.units.mass), 6);
			expect(after.exceeded).toEqual(before.exceeded);
			expect(after.takeoff.total).toBe(before.takeoff.total);
			expect(after.landing.total).toBe(before.landing.total);
		}
		const back = structuredClone(converted);
		convertAircraft(back, original.units);
		const round = (x: unknown) => JSON.parse(JSON.stringify(x), (_, v) => (typeof v === 'number' ? Number(v.toPrecision(9)) : v));
		expect(round(back)).toEqual(round(original));
	});
});

describe('hand-calculated cases with manual units', () => {
	it('are compared in the units the person used, so a case worked out in lb never fails on kg rounding', () => {
		const a = raw('test-glastar-style');
		const expected = runHandCases(a);
		const metric = structuredClone(a);
		convertAircraft(metric, { mass: 'kg', arm: 'cm', volume: 'L' });
		metric.manualUnits = a.units;
		expect(runHandCases(metric)).toEqual(expected);
	});
});

describe('generated short names', () => {
	it('are readable, valid and unique', () => {
		expect(makeId('Rear Passenger', [])).toBe('rear-passenger');
		expect(makeId('Gepäck vorne', [])).toBe('gepack-vorne');
		expect(makeId('Pilot', ['pilot', 'pilot-2'])).toBe('pilot-3');
		expect(makeId('!!!', [], 'station')).toBe('station');
		fc.assert(fc.property(fc.string(), fc.array(fc.string()), (label, taken) => {
			const id = makeId(label, taken);
			expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
			expect(taken).not.toContain(id);
		}));
	});
});

describe('sources by document and page', () => {
	const base = () => ({ sources: { poh: { document: 'POH GlaStar', revision: '2.3' }, w: { document: 'Weighing report' } } as Record<string, any> });

	it('lists each document once', () => {
		const s = { ...base().sources, p1: { document: 'POH GlaStar', revision: '2.3', page: '6-2' } };
		expect(documents(s).map((d) => d.id)).toEqual(['poh', 'w']);
	});
	it('reuses the entry for the same page, and adds one for a new page', () => {
		const a = base();
		const id = sourceFor(a.sources, a.sources.poh, '6-2');
		expect(a.sources[id]).toEqual({ document: 'POH GlaStar', revision: '2.3', page: '6-2' });
		expect(sourceFor(a.sources, a.sources.poh, '6-2')).toBe(id);
		expect(sourceFor(a.sources, a.sources.poh, '')).toBe('poh');
	});
	it('removes page entries nothing uses, but keeps documents', () => {
		const a: any = { ...base(), stations: [{ source: 'x' }] };
		const used = sourceFor(a.sources, a.sources.poh, '6-2');
		const unused = sourceFor(a.sources, a.sources.poh, '5-5');
		a.stations[0].source = used;
		pruneSources(a);
		expect(Object.keys(a.sources).sort()).toEqual([used, 'poh', 'w'].sort());
		expect(usedSources(a)).toEqual(new Set([used]));
		expect(a.sources[unused]).toBeUndefined();
	});
});
