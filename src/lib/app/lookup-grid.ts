/**
 * The manual's table as the pilot sees it on paper, with a crosshair where their numbers fall.
 * A quick look tells them the result is about right: it sits between the printed values around it.
 */
import type { Aircraft, Axis } from '../aircraft/schema.ts';
import { interpolate, type Bracket } from '../engine/interpolate.ts';
import type { LookupTrace } from '../engine/performance.ts';

/** `hit`: a printed value the result comes from. `marker`: on the crosshair. `result`: where it crosses. */
export type GridCell = { text: string; hit: boolean; marker: boolean; result: boolean };
export type GridHead = { text: string; marker: boolean; note: string };
export type LookupGrid = { title: string; rowAxis: string; colAxis: string; colHeads: GridHead[]; rows: Array<{ head: GridHead; cells: GridCell[] }> };
export type LookupView = { output: string; grids: LookupGrid[]; between: string | null };

const unitText = (unit: string) => (unit === 'C' || unit === 'F' ? `°${unit}` : unit);
const axisText = (axis: Axis) => `${axis.name}, ${unitText(axis.unit)}`;
const number = (x: number) => (Number.isInteger(x) ? String(x) : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
const value = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Printed values, plus a marker where the input falls between two of them. An input on a value marks that value. */
function heads(axis: Axis, x: number, b: Bracket): GridHead[] {
	const out: GridHead[] = axis.values.map((v) => ({ text: number(v), marker: false, note: '' }));
	if (b.clamped) {
		out[b.low] = { ...out[b.low], marker: true, note: `${axis.name} ${number(x)} ${unitText(axis.unit)} is outside the table: uses ${number(axis.values[b.low])} ${unitText(axis.unit)}` };
		return out;
	}
	if (b.low === b.high) { out[b.low] = { ...out[b.low], marker: true }; return out; }
	out.splice(b.low + 1, 0, { text: number(x), marker: true, note: '' });
	return out;
}

/** Index in the printed values for each shown position, or null for the inserted marker. */
function positions(b: Bracket, length: number): Array<number | null> {
	const out: Array<number | null> = Array.from({ length }, (_, i) => i);
	if (b.low !== b.high) out.splice(b.low + 1, 0, null);
	return out;
}

/** One grid for the last two axes. Leading axes, such as mass on a three-axis table, each give a slice. */
function grid(title: string, rowAxis: Axis | null, colAxis: Axis, cells: unknown, at: number[], brackets: Bracket[]): LookupGrid {
	const rb: Bracket = rowAxis ? brackets[0] : { low: 0, high: 0, fraction: 0, clamped: false, warn: false };
	const cb = brackets[rowAxis ? 1 : 0], cx = at[rowAxis ? 1 : 0];
	const rows2d = (rowAxis ? cells : [cells]) as number[][];
	const rowPos = positions(rb, rows2d.length), colPos = positions(cb, colAxis.values.length);
	const rowHeads = rowAxis ? heads(rowAxis, at[0], rb) : [{ text: '', marker: true, note: '' }];
	const resultValue = interpolate(rows2d, [rb, cb]);
	return {
		title,
		rowAxis: rowAxis ? axisText(rowAxis) : '',
		colAxis: axisText(colAxis),
		colHeads: heads(colAxis, cx, cb),
		rows: rowPos.map((r, ri) => ({
			head: rowHeads[ri],
			cells: colPos.map((c) => {
				const onRow = r === null || (rb.low === rb.high && r === rb.low);
				const onCol = c === null || (cb.low === cb.high && c === cb.low);
				const marker = onRow || onCol, result = onRow && onCol;
				if (r === null || c === null) return { text: result ? value(resultValue) : '', hit: false, marker, result };
				const hit = (r === rb.low || r === rb.high) && (c === cb.low || c === cb.high);
				return { text: number(rows2d[r][c]), hit, marker, result };
			})
		}))
	};
}

export function lookupView(a: Aircraft, lookup: LookupTrace): LookupView | null {
	const table = a.tables[lookup.table];
	if (!table) return null;
	const output = table.outputs.total ? 'total' : 'groundRoll';
	const cells = table.outputs[output];
	if (!cells) return null;
	const axes = table.axes as Axis[], n = axes.length;
	const lead = axes.slice(0, Math.max(0, n - 2)), leadB = lookup.brackets.slice(0, lead.length);
	const restB = lookup.brackets.slice(lead.length), restAt = lookup.at.slice(lead.length);
	const rowAxis = n >= 2 ? axes[n - 2] : null, colAxis = axes[n - 1];

	// Every combination of the leading axes' printed values around the input.
	let slices: Array<{ idx: number[]; label: string[] }> = [{ idx: [], label: [] }];
	lead.forEach((axis, i) => {
		const b = leadB[i], picks = b.low === b.high ? [b.low] : [b.low, b.high];
		slices = slices.flatMap((s) => picks.map((p) => ({ idx: [...s.idx, p], label: [...s.label, `${axis.name} ${number(axis.values[p])} ${unitText(axis.unit)}`] })));
	});
	const grids = slices.map((s) => grid(s.label.join(', '), rowAxis, colAxis, s.idx.reduce<unknown>((node, i) => (node as unknown[])[i], cells), restAt, restB));

	const interpolated = lead.filter((_, i) => leadB[i].low !== leadB[i].high);
	const between = interpolated.length
		? `${interpolated.map((axis) => `${axis.name} ${number(lookup.at[axes.indexOf(axis)])} ${unitText(axis.unit)}`).join(', ')} lies between these tables: ${value(interpolate(cells, lookup.brackets))}`
		: null;
	return { output: output === 'total' ? 'Total distance' : 'Ground roll', grids, between };
}
