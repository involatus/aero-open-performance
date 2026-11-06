/** Linear table lookup across any number of axes. */
export const EPSILON = 1e-9;
export type RangeRule = 'none' | 'nearest' | 'nearestWarn';
export type AxisLike = { name: string; values: number[]; below: RangeRule; above: RangeRule };
export type Bracket = { low: number; high: number; fraction: number; clamped: boolean; warn: boolean };

/** Returns where x falls on an axis, or null when the axis gives no result there. */
export function bracket(axis: AxisLike, x: number): Bracket | null {
	const { values } = axis, last = values.length - 1;
	if (x < values[0] - EPSILON) {
		if (axis.below === 'none') return null;
		return { low: 0, high: 0, fraction: 0, clamped: true, warn: axis.below === 'nearestWarn' };
	}
	if (x > values[last] + EPSILON) {
		if (axis.above === 'none') return null;
		return { low: last, high: last, fraction: 0, clamped: true, warn: axis.above === 'nearestWarn' };
	}
	for (let i = 0; i <= last; i++) {
		if (Math.abs(x - values[i]) <= EPSILON) return { low: i, high: i, fraction: 0, clamped: false, warn: false };
	}
	for (let i = 0; i < last; i++) {
		if (x > values[i] && x < values[i + 1]) {
			return { low: i, high: i + 1, fraction: (x - values[i]) / (values[i + 1] - values[i]), clamped: false, warn: false };
		}
	}
	return null;
}

/** On an exact axis match the stored cell is returned untouched, so printed values stay exact. */
export function interpolate(cells: unknown, brackets: Bracket[]): number {
	if (!brackets.length) return cells as number;
	const [b, ...rest] = brackets, row = cells as unknown[];
	const low = interpolate(row[b.low], rest);
	if (b.low === b.high) return low;
	const high = interpolate(row[b.high], rest);
	return low + (high - low) * b.fraction;
}

/** The stored values around the result, for showing the working. */
export function surroundingCells(cells: unknown, brackets: Bracket[]): number[] {
	if (!brackets.length) return [cells as number];
	const [b, ...rest] = brackets, row = cells as unknown[];
	const out = surroundingCells(row[b.low], rest);
	return b.low === b.high ? out : [...out, ...surroundingCells(row[b.high], rest)];
}
