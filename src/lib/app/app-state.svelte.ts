/** Open Calculations, saved on this device. Nothing here leaves the device. */
import { del, get, set } from 'idb-keyval';
import { reconcileAfterInstall, type Calculation } from './calculation.ts';
import { ReleaseError, downloadRelease, parseIndex, shouldCheck, verifyInstalled, withdrawalReason, type InstalledData, type ReleaseIndex } from '../data/release.ts';
import { isExpired, type Delivery, type StoredReport } from '../report/report.ts';

const KEY = 'calculations-v1';
const REPORTS = 'reports-v1';
const DATA = 'data-release-v1';
const META = 'data-meta-v1';
const BASE = '/data';
const pdfKey = (id: string) => `report-pdf:${id}`;

export class AppState {
	tabs = $state<Calculation[]>([]);
	reports = $state<StoredReport[]>([]);
	current = $state(0);
	loaded = $state(false);
	saveFailed = $state(false);
	/** Published data is never edited here, so it isn't made reactive piece by piece. */
	data = $state.raw<InstalledData | null>(null);
	seen = $state.raw<ReleaseIndex | null>(null);
	lastCheck = $state<number | null>(null);
	dataProblem = $state<string | null>(null);
	updateError = $state<string | null>(null);
	installing = $state(false);
	checking = $state(false);

	get aircraft() {
		return this.data?.aircraft ?? [];
	}
	get pending(): ReleaseIndex | null {
		return this.seen && this.data && this.seen.release > this.data.index.release ? this.seen : null;
	}
	withdrawn(registration: string) {
		return withdrawalReason(this.data?.index ?? null, this.seen, registration);
	}

	private async saveMeta() {
		await set(META, { lastCheck: this.lastCheck, seen: this.seen });
	}

	private async getJson(file: string) {
		const response = await fetch(`${BASE}/${file}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
		if (!response.ok) throw new ReleaseError(`Could not download ${file}`);
		return response.json();
	}

	private async loadData() {
		const [stored, meta] = await Promise.all([get<InstalledData>(DATA), get<{ lastCheck: number | null; seen: ReleaseIndex | null }>(META)]);
		this.lastCheck = meta?.lastCheck ?? null;
		this.seen = meta?.seen ?? null;
		if (!stored) return;
		if (await verifyInstalled(stored)) this.data = stored;
		else this.dataProblem = 'The aircraft data on this device is damaged, so it can\'t be used. Connect to the internet to download it again.';
	}

	/** Compares against the published index. Installs by itself only when this device has nothing yet. */
	async check(force = false) {
		if (this.checking || !navigator.onLine || !shouldCheck(this.lastCheck, Date.now(), force || !this.data)) return;
		this.checking = true;
		this.updateError = null;
		try {
			const index = parseIndex(await this.getJson('index.json'));
			this.lastCheck = Date.now();
			if (!this.data) await this.install(index);
			else if (index.release >= this.data.index.release) this.seen = index;
			await this.saveMeta();
		} catch (error) {
			this.updateError = (error as Error).message;
		}
		this.checking = false;
	}

	/** All or nothing: a failure keeps the last verified release. */
	async install(index: ReleaseIndex | null = this.pending) {
		if (!index || this.installing) return;
		this.installing = true;
		this.updateError = null;
		const hadData = !!this.data;
		try {
			const next = await downloadRelease(index, (file) => this.getJson(file), Date.now());
			await set(DATA, next);
			this.data = next;
			this.dataProblem = null;
			this.seen = index;
			await this.saveMeta();
			if (hadData) {
				for (const calc of this.tabs) {
					const a = next.aircraft.find((x) => x.registration === calc.aircraft);
					if (a) reconcileAfterInstall(a, calc, index.release);
				}
			}
		} catch (error) {
			this.updateError = hadData ? `Update failed, still using Release ${this.data!.index.release}. ${(error as Error).message}` : (error as Error).message;
		}
		this.installing = false;
	}

	/** Rechecks the stored copy, so a Report never uses damaged data. */
	async dataStillValid() {
		const stored = await get<InstalledData>(DATA);
		return verifyInstalled(stored);
	}

	async load() {
		try {
			await this.loadData();
		} catch {
			this.saveFailed = true;
		}
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
