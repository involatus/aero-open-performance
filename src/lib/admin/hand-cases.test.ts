import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAircraft } from '../aircraft/validate.ts';
import { blankInput, caseCoverage, caseSummaries, limitChoices, newHandCase, setExceeded, setExpectedResult, setExpectedValue } from './hand-cases.ts';

const aircraft = (n: string) => {
	const v = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8')));
	if (!v.ok) throw new Error(n);
	return structuredClone(v.aircraft);
};

describe('hand-calculated cases', () => {
	it('start with the first Configuration and its own conditions', () => {
		const a = aircraft('test-dr-style');
		a.configurations[0].performance = { takeoff: [{ kind: 'noData', id: 'own-to', label: 'Own' }], landing: [{ kind: 'noData', id: 'own-ld', label: 'Own' }] };
		expect(blankInput(a)).toMatchObject({ configuration: a.configurations[0].id, takeoffCondition: 'own-to', landingCondition: 'own-ld' });
		const plain = aircraft('test-dr-style');
		expect(blankInput(plain).takeoffCondition).toBe(plain.performance.takeoff[0].id);
	});
	it('are numbered and dated', () => {
		const a = aircraft('test-dr-style');
		const c = newHandCase(a, 'Anna', Date.UTC(2026, 10, 8));
		expect(c).toMatchObject({ label: `Case ${a.handCases.length + 1}`, author: 'Anna', date: '2026-11-08', expected: { exceeded: [] } });
	});
	it('take expected masses in the manual\'s units, and clear on empty or invalid text', () => {
		const a = aircraft('test-dr-style');
		a.manualUnits = { ...a.units, mass: 'lb' };
		const c = newHandCase(a, 'Anna', 0);
		setExpectedValue(a, c, 'takeoffMass', '1960');
		expect(c.expected.takeoffMass).toBe(889.0410452);
		setExpectedValue(a, c, 'takeoffMass', 'x');
		expect(c.expected.takeoffMass).toBeUndefined();
		setExpectedValue(a, c, 'takeoffArm', '0,95');
		expect(c.expected.takeoffArm).toBe(0.95);
	});
	it('set and clear expected distances, and "Not checked" removes the phase', () => {
		const c = newHandCase(aircraft('test-dr-style'), 'Anna', 0);
		setExpectedResult(c, 'takeoff', 'total', '409');
		expect(c.expected.takeoff).toEqual({ status: 'ok', total: 409 });
		setExpectedResult(c, 'takeoff', 'status', 'noResult');
		expect(c.expected.takeoff).toEqual({ status: 'noResult', total: 409 });
		setExpectedResult(c, 'takeoff', 'total', '');
		expect(c.expected.takeoff).toEqual({ status: 'noResult' });
		setExpectedResult(c, 'takeoff', 'status', '');
		expect(c.expected.takeoff).toBeUndefined();
	});
	it('offer every limit by the name pilots see, and tick each once', () => {
		const a = aircraft('test-glastar-style');
		const choices = limitChoices(a);
		expect(choices).toContainEqual({ id: 'combined:baggage', label: 'Total baggage: combined maximum' });
		expect(choices.map((x) => x.id)).toEqual(expect.arrayContaining(['takeoffMass', 'takeoffCg', 'landingMass', 'landingCg', 'fuelBurn']));
		const c = newHandCase(a, 'Anna', 0);
		setExceeded(c, 'takeoffMass', true); setExceeded(c, 'takeoffMass', true);
		expect(c.expected.exceeded).toEqual(['takeoffMass']);
		setExceeded(c, 'takeoffMass', false);
		expect(c.expected.exceeded).toEqual([]);
	});
	it('limit choices match every limit the engine can report', async () => {
		const { calculate } = await import('../engine/index.ts');
		for (const n of ['test-dr-style', 'test-sr22-style', 'test-glastar-style', 'test-kitfox-style']) {
			const a = aircraft(n), ids = new Set(limitChoices(a).map((x) => x.id));
			for (const c of a.handCases) for (const l of calculate(a, c.input).massBalance.limits) expect(ids.has(l.id), `${n}: ${l.id}`).toBe(true);
		}
	});
});

describe('case summaries', () => {
	it('list each expected distance on paper beside the app, and match when every check of the case passes', () => {
		const a = aircraft('test-sr22-style');
		const rows = caseSummaries(a);
		expect(rows.length).toBeGreaterThanOrEqual(a.handCases.length);
		expect(rows.every((r) => r.matches)).toBe(true);
		const withDistance = rows.find((r) => r.phase === 'takeoff' && r.total.paper !== '–')!;
		expect(withDistance.total.paper).toBe(withDistance.total.app);
		expect(withDistance.situation).toMatch(/^Takeoff, PA [\d,]+ ft, -?\d+ °C, [\d,]+ lb$/);
	});
	it('show what the app got when a case fails', () => {
		const a = aircraft('test-sr22-style');
		const c = a.handCases.find((h) => h.expected.takeoff?.total !== undefined)!;
		c.expected.takeoff!.total! += 10;
		const row = caseSummaries(a).find((r) => r.caseId === c.id && r.phase === 'takeoff')!;
		expect(row.matches).toBe(false);
		expect(row.total.paper).not.toBe(row.total.app);
	});
	it('count which conditions have a case, per phase', () => {
		const a = aircraft('test-dr-style');
		const full = caseCoverage(a);
		expect(full.takeoff.missing).toEqual([]);
		expect(caseCoverage({ ...a, handCases: [] }).takeoff).toMatchObject({ covered: 0, missing: a.performance.takeoff.filter((c) => c.kind === 'steps').map((c) => c.label) });
	});
});
