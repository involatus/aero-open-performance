import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAircraft } from '../aircraft/validate.ts';
import { calculate } from '../engine/index.ts';
import { distanceText, enteredWindKept, limitBadge, massBalanceRows, statusWord, windChoiceText, windText, workingRows } from './presentation.ts';

const aircraft = (n: string) => {
	const v = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8')));
	if (!v.ok) throw new Error(n);
	return v.aircraft;
};

describe('what the pilot reads', () => {
	const a = aircraft('test-glastar-style'), c = a.handCases[0], r = calculate(a, c.input);

	it('words statuses and limit badges the same way everywhere', () => {
		expect(['noData', 'noResult', 'needsInput'].map((s) => statusWord(s as never))).toEqual(['No data', 'No result', 'Needs inputs']);
		expect(['ok', 'warning', 'exceeded'].map((s) => limitBadge(s as never))).toEqual([{ text: 'OK', tone: 'ok' }, { text: 'CHECK', tone: 'warnb' }, { text: 'OVER', tone: 'fail' }]);
	});
	it('gives the distance, with ground roll and condition, or the reason there is none', () => {
		const t = distanceText('Takeoff', r.takeoff, '1500 lb');
		expect(t.headline).toBe(`${r.takeoff.total} m`);
		expect(t.detail).toBe(`Ground roll ${r.takeoff.groundRoll} m. Total distance. ${r.takeoff.conditionLabel}, 1500 lb`);
		const none = distanceText('Landing', { ...r.landing, status: 'noResult', reason: 'Altitude outside the table' }, '1500 lb');
		expect(none.headline).toBe('Altitude outside the table');
	});
	it('says how wind was applied, including variable wind as a tailwind', () => {
		expect(windText({ headwind: 4.6, crosswind: 2.2 }, false)).toEqual({ headline: '5 kt head', detail: 'Crosswind 2 kt' });
		expect(windText({ headwind: -3, crosswind: 0 }, true)).toEqual({ headline: '3 kt tail', detail: 'Variable wind, applied as a tailwind' });
		expect(windText(null, false)).toBeNull();
	});
	it('ends the working with the rounded result, and names manual sources', () => {
		const rows = workingRows(a, r.takeoff);
		expect(rows.at(-1)).toEqual({ step: 'Rounded up, m', total: String(r.takeoff.total), groundRoll: String(r.takeoff.groundRoll), source: '' });
		expect(rows.some((x) => x.source.includes('Fictional test manual'))).toBe(true);
	});
	it('rounds the mass and balance table to the aircraft\'s display decimals', () => {
		const mb = massBalanceRows(a, r);
		expect(mb.takeoff.mass).toBe(r.massBalance.takeoff.mass.toFixed(a.display.massDecimals));
		expect(mb.rows[0]).toMatchObject({ id: 'empty', label: 'Empty' });
	});
});

describe('wind for the distances', () => {
	const head = { wind: { headwind: 9, crosswind: 0 }, distanceWind: { headwind: 0, crosswind: 0 } };
	const tail = { wind: { headwind: -5, crosswind: 0 }, distanceWind: { headwind: -5, crosswind: 0 } };
	it('names the choice', () => {
		expect(windChoiceText(head)).toBe('As entered');
		expect(windChoiceText(head, 'none')).toBe('No wind');
		expect(windChoiceText({ ...head, distanceWind: { headwind: -3, crosswind: 0 } }, 'tail3')).toBe('Tailwind 3 kt');
	});
	it('says when a stronger entered tailwind is used instead', () => {
		expect(enteredWindKept(tail, 'none')).toBe(true);
		expect(enteredWindKept(tail, 'tail3')).toBe(true);
		expect(enteredWindKept({ wind: { headwind: -3, crosswind: 0 } }, 'tail3')).toBe(false);
		expect(enteredWindKept({ wind: { headwind: 0, crosswind: 0 } }, 'none')).toBe(false);
		expect(windChoiceText(tail, 'none')).toBe('No wind chosen, but the entered tailwind is stronger, so it is used');
	});
});
