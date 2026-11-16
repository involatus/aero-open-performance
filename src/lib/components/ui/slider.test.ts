import { describe, expect, it } from 'vitest';
import { snapped } from './Slider.svelte';

describe('snapped', () => {
	const snaps = [0, 12.5, 25, 37.5, 50];
	it('pulls a value within the zone onto the nearest snap point', () => {
		expect(snapped(24.1, 50, 1, snaps, 1)).toBe(25);
		expect(snapped(25.9, 50, 1, snaps, 1)).toBe(25);
		expect(snapped(49.2, 50, 1, snaps, 1)).toBe(50);
		// Flight time: 1.42 h is nearer 1.5 than 1.25.
		expect(snapped(1.47, 4.25, 0.05, [1.25, 1.5], 0.04)).toBe(1.5);
		expect(snapped(1.42, 4.25, 0.05, [1.25, 1.5], 0.04)).toBe(1.4);
	});
	it('moves freely by its step elsewhere, inside the range', () => {
		expect(snapped(30.4, 50, 1, snaps, 1)).toBe(30);
		expect(snapped(33.6, 50, 0.5, snaps, 1)).toBe(33.5);
		expect(snapped(-3, 50, 1, [], 1)).toBe(0);
		expect(snapped(57, 50, 1, [], 1)).toBe(50);
	});
});
