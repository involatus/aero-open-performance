/** Open Calculations, saved on this device. Nothing here leaves the device. */
import { del, get, set } from 'idb-keyval';
import type { Calculation } from './calculation.ts';
import { isExpired, type Delivery, type StoredReport } from '../report/report.ts';

const KEY = 'calculations-v1';
const REPORTS = 'reports-v1';
const pdfKey = (id: string) => `report-pdf:${id}`;

export class AppState {
	tabs = $state<Calculation[]>([]);
	reports = $state<StoredReport[]>([]);
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
		try {
			const stored = (await get<StoredReport[]>(REPORTS)) ?? [];
			const now = Date.now();
			for (const report of stored) if (isExpired(report, now)) await del(pdfKey(report.id));
			this.reports = stored.filter((report) => !isExpired(report, now));
			if (this.reports.length !== stored.length) await this.saveReports();
		} catch {
			this.saveFailed = true;
		}
		this.loaded = true;
	}

	private async saveReports() {
		await set(REPORTS, $state.snapshot(this.reports));
	}

	/** The PDF is written first, so a Report on the list always has its PDF. */
	async addReport(report: StoredReport, pdf: Blob) {
		await set(pdfKey(report.id), pdf);
		this.reports.unshift(report);
		try {
			await this.saveReports();
		} catch (error) {
			// Leaves nothing behind, so "nothing was saved" stays true.
			this.reports = this.reports.filter((r) => r.id !== report.id);
			await del(pdfKey(report.id)).catch(() => {});
			throw error;
		}
	}

	pdf(id: string) {
		return get<Blob>(pdfKey(id));
	}

	async setDelivery(id: string, delivery: Delivery) {
		const report = this.reports.find((r) => r.id === id);
		if (!report) return;
		report.delivery = delivery;
		await this.saveReports();
	}

	async deleteReport(id: string) {
		this.reports = this.reports.filter((r) => r.id !== id);
		await this.saveReports();
		await del(pdfKey(id));
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
