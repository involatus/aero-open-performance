import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { VARIABLE_WIND, ignoresEnteredTailwind, windComponents, windForDistances } from './wind.ts';
import { runwayWinds } from '../app/calculation.ts';

describe('wind on a runway', () => {
	it('splits the wind along and across the runway', () => {
		const w = windComponents(300, 10, 270);
		expect(w.headwind).toBeCloseTo(8.66, 2);
		expect(w.crosswind).toBeCloseTo(5, 5);
		expect(windComponents(90, 10, 270).headwind).toBeCloseTo(-10, 5);
	});
	it('counts variable wind as a tailwind at full speed, with no crosswind', () => {
		expect(windComponents(VARIABLE_WIND, 4, 120)).toEqual({ headwind: -4, crosswind: 0 });
	});
	it('gives the runway picker the same wind as the distances', () => {
		fc.assert(fc.property(fc.integer({ min: 0, max: 360 }), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 36 }), fc.boolean(), (dir, speed, number, variable) => {
			const from = variable ? VARIABLE_WIND : dir;
			const picked = runwayWinds([{ designator: String(number), number }], String(from), String(speed)).winds.get(String(number))!;
			const engine = windComponents(from, speed, number * 10);
			expect(picked.headwind).toBeCloseTo(engine.headwind, 9);
			expect(picked.crosswind).toBeCloseTo(engine.crosswind, 9);
		}));
	});
});

describe("the pilot's choice of wind for the distances", () => {
	const tail = { headwind: -5, crosswind: 2 };
	it('plans with the chosen headwind and keeps the entered crosswind', () => {
		expect(windForDistances(tail, 'none')).toEqual({ headwind: 0, crosswind: 2 });
		expect(windForDistances(tail, 'tail3')).toEqual({ headwind: -3, crosswind: 2 });
		expect(windForDistances(tail, 'entered')).toBe(tail);
		expect(windForDistances(null, 'none')).toBeNull();
	});
	it('says when the choice leaves out a stronger entered tailwind', () => {
		expect(ignoresEnteredTailwind(tail, 'none')).toBe(true);
		expect(ignoresEnteredTailwind(tail, 'tail3')).toBe(true);
		expect(ignoresEnteredTailwind({ headwind: -3, crosswind: 0 }, 'tail3')).toBe(false);
		expect(ignoresEnteredTailwind({ headwind: 0, crosswind: 0 }, 'none')).toBe(false);
		expect(ignoresEnteredTailwind(tail, 'entered')).toBe(false);
		expect(ignoresEnteredTailwind(null, 'none')).toBe(false);
	});
});
