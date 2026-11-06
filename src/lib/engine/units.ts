/** Exact conversion constants. Values are converted only during calculation. */
export const KG_PER_LB = 0.45359237;
export const M_PER_FT = 0.3048;

const lengthInMetres: Record<string, number> = { m: 1, cm: 0.01, in: 0.0254, ft: M_PER_FT };

export function convertLength(value: number, from: string, to: string): number {
	if (from === to) return value;
	const a = lengthInMetres[from], b = lengthInMetres[to];
	if (a === undefined || b === undefined) throw new Error(`Unknown length unit: ${from} or ${to}`);
	return (value * a) / b;
}

export function convertMass(value: number, from: string, to: string): number {
	if (from === to) return value;
	if (from === 'lb' && to === 'kg') return value * KG_PER_LB;
	if (from === 'kg' && to === 'lb') return value / KG_PER_LB;
	throw new Error(`Unknown mass unit: ${from} or ${to}`);
}

export function convertTemperature(value: number, from: string, to: string): number {
	if (from === to) return value;
	if (from === 'C' && to === 'F') return (value * 9) / 5 + 32;
	if (from === 'F' && to === 'C') return ((value - 32) * 5) / 9;
	throw new Error(`Unknown temperature unit: ${from} or ${to}`);
}
