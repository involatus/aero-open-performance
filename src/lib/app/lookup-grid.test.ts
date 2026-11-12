import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateAircraft } from '../aircraft/validate.ts';
import { bracket } from '../engine/interpolate.ts';
import type { Aircraft, Axis } from '../aircraft/schema.ts';
import { lookupView, type LookupGrid } from './lookup-grid.ts';

const aircraft = (n: string): Aircraft => {
	const v = validateAircraft(JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8')));
	if (!v.ok) throw new Error(n);
	return v.aircraft;
};
/** The lookup the engine would record for these inputs. */
const at = (a: Aircraft, table: string, ...xs: number[]) => ({ table, at: xs, brackets: (a.tables[table].axes as Axis[]).map((axis, i) => bracket(axis, xs[i])!) });
const resultCell = (g: LookupGrid) => g.rows.flatMap((r) => r.cells).filter((c) => c.result);
const hits = (g: LookupGrid) => g.rows.flatMap((r) => r.cells).filter((c) => c.hit).map((c) => Number(c.text));

describe('the table a result came from', () => {
	const dr = aircraft('test-dr-style');

	it('puts a crosshair between the printed values, with the result where it crosses', () => {
		const t = dr.tables.hard, v = lookupView(dr, at(dr, 'hard', 750, 20))!;
		expect(v.grids).toHaveLength(1);
		const g = v.grids[0];
		expect(g.colHeads.map((h) => h.text)).toEqual(['0', '15', '20', '30', '45']);
		expect(g.rows.map((r) => r.head.text)).toEqual(['0', '500', '750', '1000', '1500']);
		const cells = t.outputs.total as number[][];
		expect(hits(g).sort()).toEqual([cells[1][1], cells[1][2], cells[2][1], cells[2][2]].sort());
		expect(resultCell(g)).toHaveLength(1);
		const expected = (cells[1][1] + (cells[1][2] - cells[1][1]) / 3 + cells[2][1] + (cells[2][2] - cells[2][1]) / 3) / 2;
		expect(Number(resultCell(g)[0].text)).toBeCloseTo(expected, 1);
		expect(g.rows[2].cells.every((c) => c.marker)).toBe(true);
	});

	it('marks the printed value itself when the input is on it', () => {
		const g = lookupView(dr, at(dr, 'hard', 500, 15))!.grids[0];
		expect(g.rows).toHaveLength(4);
		expect(g.colHeads).toHaveLength(4);
		const result = resultCell(g);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ hit: true, text: String((dr.tables.hard.outputs.total as number[][])[1][1]) });
	});

	it('says when an input is outside the table and the nearest value is used', () => {
		const nearest = structuredClone(dr);
		nearest.tables.hard.axes[0].below = 'nearestWarn';
		const g = lookupView(nearest, at(nearest, 'hard', -100, 15))!.grids[0];
		expect(g.rows[0].head).toMatchObject({ marker: true, note: 'Altitude -100 m is outside the table: uses 0 m' });
	});

	it('shows a one-axis table as one row', () => {
		const v = lookupView(dr, at(dr, 'landing', 700))!;
		const g = v.grids[0];
		expect(g.rows).toHaveLength(1);
		expect(g.colHeads.map((h) => h.marker)).toEqual([false, true, false]);
		expect(resultCell(g)).toHaveLength(1);
	});

	it('shows each printed mass of a three-axis table, and the value between them', () => {
		const sr = aircraft('test-sr22-style');
		const masses = sr.tables.takeoff.axes[0].values;
		const mid = (masses[0] + masses[1]) / 2;
		const v = lookupView(sr, at(sr, 'takeoff', mid, sr.tables.takeoff.axes[1].values[0], sr.tables.takeoff.axes[2].values[0]))!;
		expect(v.grids.map((g) => g.title)).toEqual(masses.map((m) => `Mass ${m} ${sr.tables.takeoff.axes[0].unit}`));
		const [low, high] = v.grids.map((g) => Number(resultCell(g)[0].text));
		expect(v.between).toContain(`lies between these tables: ${(low + high) / 2}`);
	});
});
