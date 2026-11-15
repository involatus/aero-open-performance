import { describe, expect, it } from 'vitest';
import { massIn, readSaved, removeMass, saveMass } from './my-values.ts';

describe('values saved on this device', () => {
	it('keeps one value per name, newest first, in kg', () => {
		let list = saveMass([], 'Me', 80, 'kg', 1);
		list = saveMass(list, 'Bag', 22, 'lb', 2);
		list = saveMass(list, ' me ', 78, 'kg', 3);
		expect(list.map((s) => s.label)).toEqual(['me', 'Bag']);
		expect(list[0].kg).toBe(78);
		expect(list[1].kg).toBeCloseTo(9.979, 3);
	});
	it('gives the value back in the aircraft\'s unit and decimals', () => {
		const [me] = saveMass([], 'Me', 80, 'kg', 1);
		expect(massIn(me, 'kg', 1)).toBe('80');
		expect(massIn(me, 'lb', 0)).toBe('176');
	});
	it('ignores empty names and values, and removes by id', () => {
		expect(saveMass([], '  ', 80, 'kg', 1)).toEqual([]);
		expect(saveMass([], 'Me', 0, 'kg', 1)).toEqual([]);
		const list = saveMass([], 'Me', 80, 'kg', 1);
		expect(removeMass(list, list[0].id)).toEqual([]);
	});
	it('drops damaged stored entries', () => {
		expect(readSaved([{ id: 'a', label: 'Me', kg: 80 }, { id: 'b', label: '', kg: 70 }, { id: 'c', label: 'X', kg: -1 }, null, 'x'])).toEqual([{ id: 'a', label: 'Me', kg: 80 }]);
		expect(readSaved(undefined)).toEqual([]);
	});
});
