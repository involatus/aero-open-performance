import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateAircraft } from '../aircraft/validate.ts';
import { publishChecks, secondEntryDifferences } from '../data/publish-checks.ts';
import { isNewer, availableUpdate } from '../server/updates.ts';
import { NEW_AIRCRAFT, copyForNewAircraft, countBlank, differingCells, emptyCells, getCell, isMultiCell, parseCell, parsePaste, reshape, secondEntryFor, setCell } from './table-grid.ts';

const raw = (n: string) => JSON.parse(readFileSync(`aircraft-examples/${n}.json`, 'utf8'));

describe('typing and pasting table values', () => {
	it('reads decimals with a point or comma', () => {
		expect(parseCell(' 1,5 ')).toEqual({ value: 1.5, valid: true });
		expect(parseCell('1.5').value).toBe(1.5);
		expect(parseCell('-3').value).toBe(-3);
		expect(parseCell('').value).toBeNull();
	});
	it('refuses anything it would have to guess', () => {
		for (const t of ['abc', '1.2.3', '1,234.5', '12m', '1e5', '--1', '.']) expect(parseCell(t).valid).toBe(false);
	});
	it('reads Excel paste, including Windows line endings and a trailing line', () => {
		expect(parsePaste('1\t2\r\n3\t4\r\n')).toEqual([['1', '2'], ['3', '4']]);
		expect(parsePaste('1\n2')).toEqual([['1'], ['2']]);
		expect(isMultiCell('1\t2')).toBe(true);
		expect(isMultiCell('12\n')).toBe(false);
	});
	it('never accepts a value that changes when read back', () => {
		fc.assert(fc.property(fc.double({ min: -5000, max: 5000, noNaN: true }), (x) => {
			const parsed = parseCell(String(x));
			if (parsed.valid && parsed.value !== null) expect(parsed.value === x).toBe(true);
		}));
	});
});

describe('table shapes', () => {
	it('makes blank tables of any shape', () => {
		expect(emptyCells([2, 3])).toEqual([[null, null, null], [null, null, null]]);
		expect(countBlank(emptyCells([2, 2, 3]))).toBe(12);
	});
	it('keeps values when a table grows or shrinks', () => {
		expect(reshape([[1, 2], [3, 4]], [3, 3])).toEqual([[1, 2, null], [3, 4, null], [null, null, null]]);
		expect(reshape([[1, 2], [3, 4]], [1, 1])).toEqual([[1]]);
		expect(reshape(undefined, [2])).toEqual([null, null]);
	});
	it('reads and writes one cell at any depth', () => {
		const t = emptyCells([2, 2, 2]);
		setCell(t, [1, 0, 1], 7);
		expect(getCell(t, [1, 0, 1])).toBe(7);
		expect(getCell(t, [0, 0, 0])).toBeNull();
		expect(countBlank(t)).toBe(7);
	});
	it('finds exactly the cells that differ', () => {
		expect(differingCells([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toEqual([]);
		expect(differingCells([[1, 2], [3, 4]], [[1, 9], [3, null]])).toEqual([[0, 1], [1, 1]]);
	});
});

describe('copying an aircraft', () => {
	it('is independent and needs its tables and cases entered again', () => {
		const source = raw('test-dr-style'), copy = copyForNewAircraft(source, 'HB-NEW');
		expect(copy.registration).toBe('HB-NEW');
		expect(copy.handCases).toEqual([]);
		expect(copy.fictional).toBeUndefined();
		expect(countBlank(copy.tables.hard.outputs.total)).toBe(16);
		copy.stations[0].label = 'Changed';
		expect(source.stations[0].label).toBe('Pilot');
		expect(source.tables.hard.outputs.total[0][0]).toBe(400);
		expect(publishChecks(copy).aircraft).toBeNull();
	});
});

describe('second entry', () => {
	const first = raw('test-kitfox-style');
	it('starts blank, so the first entry is never shown or copied', () => {
		const second = secondEntryFor(first, null);
		expect(countBlank(second.tables.takeoff.outputs.total)).toBe(9);
		expect(JSON.stringify(second.tables)).not.toContain('430');
	});
	it('keeps what was typed when reopened', () => {
		const second = secondEntryFor(first, null);
		second.tables.takeoff.outputs.total[0][0] = 400;
		expect(secondEntryFor(first, second).tables.takeoff.outputs.total[0][0]).toBe(400);
	});
	it('passes the publish rule only when every cell matches', () => {
		const second = secondEntryFor(first, null);
		second.tables.takeoff.outputs = structuredClone(first.tables.takeoff.outputs);
		const a = validateAircraft(first), b = validateAircraft(second);
		if (!a.ok || !b.ok) throw new Error('invalid');
		expect(secondEntryDifferences(a.aircraft, b.aircraft)).toEqual([]);
		b.aircraft.tables.takeoff.outputs.total = structuredClone(b.aircraft.tables.takeoff.outputs.total);
		(b.aircraft.tables.takeoff.outputs.total as number[][])[1][1] += 1;
		expect(secondEntryDifferences(a.aircraft, b.aircraft)).toHaveLength(1);
	});
});

describe('new aircraft', () => {
	it('starts unfinished, and is saved as a draft', () => {
		const d = NEW_AIRCRAFT('HB-NEW');
		expect(d.registration).toBe('HB-NEW');
		expect(publishChecks(d).problems.length).toBeGreaterThan(0);
	});
});

describe('update notice', () => {
	it('compares versions as numbers', () => {
		expect(isNewer('0.10.0', '0.9.0')).toBe(true);
		expect(isNewer('1.0.0', '0.9.9')).toBe(true);
		expect(isNewer('0.2.0', '0.2.0')).toBe(false);
		expect(isNewer('0.1.9', '0.2.0')).toBe(false);
		expect(isNewer('nonsense', '0.2.0')).toBe(false);
	});
	const reply = (version: string) => (async () => new Response(JSON.stringify({ version }))) as unknown as typeof fetch;
	it('reports a newer version only', async () => {
		expect(await availableUpdate('0.2.0', reply('0.3.0'))).toBe('0.3.0');
		expect(await availableUpdate('0.3.0', reply('0.3.0'))).toBeNull();
	});
	it('shows nothing if the check fails', async () => {
		expect(await availableUpdate('0.2.0', (async () => { throw new Error('down'); }) as unknown as typeof fetch)).toBeNull();
		expect(await availableUpdate('0.2.0', (async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).toBeNull();
	});
});
