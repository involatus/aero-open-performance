import { describe, expect, it } from 'vitest';
import { reloadOnce } from './reload.ts';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('reloading after an app update', () => {
	it('reloads once, and not again within 30 s, so a lasting fault cannot loop', () => {
		const storage = memory();
		let reloads = 0;
		expect(reloadOnce(storage, 100000, () => reloads++)).toBe(true);
		expect(reloadOnce(storage, 110000, () => reloads++)).toBe(false);
		expect(reloadOnce(storage, 140000, () => reloads++)).toBe(true);
		expect(reloads).toBe(2);
	});
	it('does not reload by itself without storage for the guard', () => {
		let reloads = 0;
		expect(reloadOnce(null, 100000, () => reloads++)).toBe(false);
		expect(reloads).toBe(0);
	});
});
