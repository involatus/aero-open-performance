import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAircraft } from '../aircraft/validate.ts';
import { calculate } from '../engine/index.ts';
import { distanceText, limitBadge, massBalanceRows, runwayText, statusWord, windText, workingRows } from './presentation.ts';

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
	it('shows a runway number with its heading', () => {
		expect(runwayText(80)).toBe('08, heading 080°');
		expect(runwayText(360)).toBe('36, heading 360°');
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
