import { describe, expect, it } from 'vitest';
import { toMagnetic, variationAt } from './variation.ts';

describe('magnetic variation', () => {
	it('matches NOAA\'s published WMM2025 test values', () => {
		// From the WMM2025 test values: 2026.0, latitude, longitude, declination (altitudes there are small and don't change it at this precision).
		const jan2026 = new Date(Date.UTC(2026, 0, 1));
		expect(variationAt(-57, 3, jan2026)).toBeCloseTo(-22.51, 0);
		expect(variationAt(-24, -122, jan2026)).toBeCloseTo(14.01, 0);
		expect(variationAt(23, 63, jan2026)).toBeCloseTo(1.17, 0);
	});
	it('gives a small east variation in Switzerland', () => {
		const v = variationAt(47.38, 8.65, new Date(Date.UTC(2026, 10, 15)))!;
		expect(v).toBeGreaterThan(2);
		expect(v).toBeLessThan(5);
	});
	it('turns a true wind into magnetic, keeping 1 to 360 and calm', () => {
		expect(toMagnetic(143, 3.4)).toBe(140);
		expect(toMagnetic(2, 3.4)).toBe(359);
		expect(toMagnetic(358, -3)).toBe(1);
		expect(toMagnetic(3, 3.4)).toBe(360);
		expect(toMagnetic(0, 3.4)).toBe(0);
	});
});
