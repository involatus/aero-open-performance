import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppState, type DeviceStore } from './app-state.svelte.ts';
import { newCalculation } from './calculation.ts';
import type { StoredReport } from '../report/report.ts';

/** The second adapter: device storage in memory, and published files from the repo's demo release. */
function memory(fail: (key: string) => boolean = () => false): DeviceStore & { map: Map<string, unknown> } {
	const map = new Map<string, unknown>();
	return {
		map,
		async get(key) { return structuredClone(map.get(key)) as never; },
		async set(key, value) { if (fail(key)) throw new Error('disk full'); map.set(key, structuredClone(value)); },
		async del(key) { map.delete(key); }
	};
}
const demo: typeof fetch = async (url) => {
	const path = String(url);
	if (path.startsWith('/api/data/')) return new Response('null', { status: 200 });
	try { return new Response(readFileSync(`static${path}`, 'utf8'), { status: 200 }); } catch { return new Response('', { status: 404 }); }
};
const NOW = Date.UTC(2026, 10, 8);
const device = (store = memory(), fetch = demo) => ({ store, fetch, online: () => true, now: () => NOW });

describe('app state on a device', () => {
	it('installs the data on first launch, and checks it on the next start', async () => {
		const store = memory();
		const first = new AppState(device(store));
		await first.load();
		await first.check();
		expect(first.data?.aircraft.length).toBeGreaterThan(0);
		const second = new AppState(device(store));
		await second.load();
		expect(second.data?.index.release).toBe(first.data?.index.release);
		expect(await second.dataStillValid()).toBe(true);
	});
	it('keeps the last verified data when a download fails', async () => {
		const store = memory();
		const app = new AppState(device(store));
		await app.load(); await app.check();
		const broken = new AppState(device(store, async () => new Response('', { status: 500 })));
		await broken.load();
		await broken.check(true);
		expect(broken.updateError).toBeTruthy();
		expect(broken.data?.index.release).toBe(app.data?.index.release);
	});
	it('refuses damaged data on the device', async () => {
		const store = memory();
		const app = new AppState(device(store));
		await app.load(); await app.check();
		const stored = store.map.get('data-release-v1') as { aircraft: { revision: number }[] };
		stored.aircraft[0].revision += 1;
		const again = new AppState(device(store, async () => new Response('', { status: 500 })));
		await again.load();
		expect(again.data).toBeNull();
		expect(again.dataProblem).toContain('damaged');
	});
	it('leaves nothing behind when a Report can\'t be saved', async () => {
		const store = memory((key) => key === 'reports-v1');
		const app = new AppState(device(store));
		await app.load();
		const report = { id: 'r1', created: NOW, delivery: 'notSent' } as unknown as StoredReport;
		await expect(app.addReport(report, new Blob(['pdf']))).rejects.toThrow('disk full');
		expect(app.reports).toEqual([]);
		expect(store.map.has('report-pdf:r1')).toBe(false);
	});
	it('opens and closes tabs, keeping a sensible tab in view', async () => {
		const app = new AppState(device());
		await app.load(); await app.check();
		const a = app.aircraft[0];
		for (const id of ['t1', 't2', 't3']) app.addTab(newCalculation(a, id, NOW));
		expect(app.current).toBe(2);
		app.current = 1;
		app.closeTab(0);
		expect(app.tabs[app.current].id).toBe('t2');
		app.closeTab(app.current);
		expect(app.tabs.map((t) => t.id)).toEqual(['t3']);
		expect(app.current).toBe(0);
		app.closeTab(0);
		expect(app.tabs).toEqual([]);
		expect(app.current).toBe(0);
	});
});
