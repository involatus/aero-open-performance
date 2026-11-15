import { describe, expect, it } from 'vitest';
import { massIn, readSaved, removeMass, saveMass, savedFor, stationKind } from './my-values.ts';

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

describe('people on seats, things in baggage', () => {
	it('tells baggage areas from seats by name', () => {
		for (const label of ['Baggage', 'Baggage area 2', 'Hat rack', 'Gepäck', 'Cargo pod', 'Aft compartment']) expect(stationKind({ id: 'x', label })).toBe('item');
		for (const label of ['Pilot', 'Front passenger', 'Rear seats', 'Co-pilot']) expect(stationKind({ id: 'x', label })).toBe('person');
	});
	it('follows the aircraft data before the name', () => {
		expect(stationKind({ id: 'x', label: 'Aft area', carries: 'baggage' })).toBe('item');
		expect(stationKind({ id: 'x', label: 'Baggage bench', carries: 'people' })).toBe('person');
	});
	it('offers each saved value only on its kind, and keeps a person and a bag of the same name apart', () => {
		let list = saveMass([], 'Anna', 55, 'kg', 1, 'person');
		list = saveMass(list, 'Bag', 8, 'kg', 2, 'item');
		list = saveMass(list, 'Anna', 6, 'kg', 3, 'item');
		expect(savedFor(list, 'person').map((s) => s.label)).toEqual(['Anna']);
		expect(savedFor(list, 'item').map((s) => `${s.label} ${s.kg}`)).toEqual(['Anna 6', 'Bag 8']);
		expect(savedFor([{ id: 'a', label: 'Old', kg: 70 }], 'person')).toHaveLength(1);
	});
});
