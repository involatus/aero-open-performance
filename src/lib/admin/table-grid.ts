/** Table editing rules, independent of any screen. Cells may be empty while a draft is unfinished. */
export type Cell = number | null;

/** Accepts what people type or paste: "1,5", " 12 ", "1.5". Anything else stays invalid rather than being guessed. */
export function parseCell(text: string): { value: Cell; valid: boolean } {
	const t = text.trim();
	if (t === '') return { value: null, valid: true };
	if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return { value: null, valid: false };
	return { value: Number(t.replace(',', '.')), valid: true };
}

/** Parses a block pasted from Excel or a similar table: tabs between cells, new lines between rows. */
export function parsePaste(text: string): string[][] {
	const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
	return lines.map((line) => line.split('\t'));
}

export function isMultiCell(text: string) {
	return /[\t\n\r]/.test(text.replace(/\r?\n$/, ''));
}

/** A blank table shaped for its axes. */
export function emptyCells(lengths: number[]): unknown {
	const [n, ...rest] = lengths;
	return Array.from({ length: n }, () => (rest.length ? emptyCells(rest) : null));
}

/** Fits cells to new axis lengths, keeping every value that still has a place. */
export function reshape(cells: unknown, lengths: number[]): unknown {
	const [n, ...rest] = lengths;
	const row = Array.isArray(cells) ? cells : [];
	return Array.from({ length: n }, (_, i) => (rest.length ? reshape(row[i], rest) : typeof row[i] === 'number' ? row[i] : null));
}

export function getCell(cells: unknown, path: number[]): Cell {
	let node = cells;
	for (const i of path) node = Array.isArray(node) ? node[i] : undefined;
	return typeof node === 'number' ? node : null;
}

export function setCell(cells: unknown, path: number[], value: Cell) {
	let node = cells as unknown[];
	path.slice(0, -1).forEach((i) => { node = node[i] as unknown[]; });
	node[path[path.length - 1]] = value;
}

export function countBlank(cells: unknown): number {
	if (Array.isArray(cells)) return cells.reduce((sum: number, c) => sum + countBlank(c), 0);
	return typeof cells === 'number' ? 0 : 1;
}

/** Cells that differ between two entries of the same table. */
export function differingCells(a: unknown, b: unknown, path: number[] = []): number[][] {
	if (Array.isArray(a) || Array.isArray(b)) {
		const x = Array.isArray(a) ? a : [], y = Array.isArray(b) ? b : [];
		return Array.from({ length: Math.max(x.length, y.length) }, (_, i) => differingCells(x[i], y[i], [...path, i])).flat();
	}
	return (a ?? null) === (b ?? null) ? [] : [path];
}

type AircraftLike = { registration?: string; revision?: number; handCases?: unknown[]; tables?: Record<string, { axes: Array<{ values: number[] }>; outputs: Record<string, unknown>; checked?: unknown }>; fictional?: boolean; acknowledgedUnusualValues?: unknown };

/** An independent copy for a new aircraft: tables and test cases must be entered and checked again. */
export function copyForNewAircraft<T extends AircraftLike>(source: T, registration: string): T {
	const copy = structuredClone(source);
	copy.registration = registration;
	copy.revision = 1;
	copy.handCases = [];
	delete copy.fictional;
	delete copy.acknowledgedUnusualValues;
	blankTables(copy);
	return copy;
}

function blankTables(a: AircraftLike) {
	for (const table of Object.values(a.tables ?? {})) {
		for (const name of Object.keys(table.outputs)) table.outputs[name] = emptyCells(table.axes.map((x) => x.values.length));
		delete table.checked;
	}
}

export const NEW_AIRCRAFT = (registration: string) => ({
	formatVersion: '0.1.0',
	registration,
	type: '',
	revision: 1,
	units: { mass: 'kg', arm: 'm', volume: 'L' },
	display: { massDecimals: 1, armDecimals: 3 },
	sources: { manual: { document: 'Aircraft flight manual' } },
	stations: [],
	tanks: [],
	combinedLimits: [],
	massLimits: { maxTakeoff: { value: 0, source: 'manual' }, maxLanding: { value: 0, source: 'manual' } },
	envelope: { points: [], source: 'manual' },
	burnPlans: [{ id: 'even', label: 'Evenly', type: 'even' }],
	defaultBurnPlan: 'even',
	notes: [],
	tables: {},
	performance: { takeoff: [], landing: [] },
	configurations: [{ id: 'standard', label: 'Standard', weighing: { mass: 0, moment: 0, date: '', source: 'manual' } }],
	handCases: []
});
