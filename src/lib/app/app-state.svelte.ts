/** Open Calculations, saved on this device. Nothing here leaves the device. */
import { get, set } from 'idb-keyval';
import type { Calculation } from './calculation.ts';

const KEY = 'calculations-v1';

export class AppState {
	tabs = $state<Calculation[]>([]);
	current = $state(0);
	loaded = $state(false);
	saveFailed = $state(false);

	async load() {
		try {
			const saved = await get<{ tabs: Calculation[]; current: number }>(KEY);
			if (saved?.tabs?.length) {
				this.tabs = saved.tabs;
				this.current = Math.min(saved.current, saved.tabs.length - 1);
			}
		} catch {
			this.saveFailed = true;
		}
		this.loaded = true;
	}

	async save() {
		try {
			await set(KEY, $state.snapshot({ tabs: this.tabs, current: this.current }));
			this.saveFailed = false;
		} catch {
			this.saveFailed = true;
		}
	}
}
