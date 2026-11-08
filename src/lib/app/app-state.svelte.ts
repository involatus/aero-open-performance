/** Open Calculations, saved on this device. Nothing here leaves the device. */
import * as idb from 'idb-keyval';
import { reconcileAfterInstall, type Calculation } from './calculation.ts';
import { ReleaseError, downloadRelease, offersUpdate, parseIndex, shouldCheck, verifyInstalled, withdrawalReason, type InstalledData, type ReleaseIndex } from '../data/release.ts';
import { isExpired, type Delivery, type StoredReport } from '../report/report.ts';
import { makeReport, type ReportSource, type ReportTools } from '../report/make-report.ts';

const KEY = 'calculations-v1';
const REPORTS = 'reports-v1';
const DATA = 'data-release-v1';
const META = 'data-meta-v1';
const BASE = '/data';
const PUBLISHED = '/api/data';
const pdfKey = (id: string) => `report-pdf:${id}`;

/** Where the app keeps things on the device. IndexedDB in the browser, a Map in tests. */
export type DeviceStore = { get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> };
export type Device = { store: DeviceStore; fetch: typeof fetch; online: () => boolean; now: () => number };

const browser = (): Device => ({ store: { get: idb.get, set: idb.set, del: idb.del }, fetch: (...a) => fetch(...a), online: () => navigator.onLine, now: () => Date.now() });

export class AppState {
	private device: Device;
	constructor(device: Partial<Device> = {}) {
		this.device = { ...browser(), ...device };
	}
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
		return this.seen && this.data && offersUpdate(this.data.index, this.seen) ? this.seen : null;
	}
	withdrawn(registration: string) {
		return withdrawalReason(this.data?.index ?? null, this.seen, registration);
	}

	private async saveMeta() {
		await this.device.store.set(META, { lastCheck: this.lastCheck, seen: this.seen });
	}

	private async getJson(file: string) {
		// Data published through the admin GUI comes first, then any data bundled with this copy of the app.
		for (const base of [PUBLISHED, BASE]) {
			const response = await this.device.fetch(`${base}/${file}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
			if (!response.ok) continue;
			const data = await response.json();
			if (data !== null) return data;
		}
		throw new ReleaseError(`Could not download ${file}`);
	}

	private async loadData() {
		const [stored, meta] = await Promise.all([this.device.store.get<InstalledData>(DATA), this.device.store.get<{ lastCheck: number | null; seen: ReleaseIndex | null }>(META)]);
		this.lastCheck = meta?.lastCheck ?? null;
		this.seen = meta?.seen ?? null;
		if (!stored) return;
		if (await verifyInstalled(stored)) this.data = stored;
		else this.dataProblem = 'The aircraft data on this device is damaged, so it can\'t be used. Connect to the internet to download it again.';
	}

	/** Compares against the published index. Installs by itself only when this device has nothing yet. */
	async check(force = false) {
		if (this.checking || !this.device.online() || !shouldCheck(this.lastCheck, this.device.now(), force || !this.data)) return;
		this.checking = true;
		this.updateError = null;
		try {
			const index = parseIndex(await this.getJson('index.json'));
			this.lastCheck = this.device.now();
			if (!this.data) await this.install(index);
			else if (offersUpdate(this.data.index, index) || index.release === this.data.index.release) this.seen = index;
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
			const next = await downloadRelease(index, (file) => this.getJson(file), this.device.now());
			await this.device.store.set(DATA, next);
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
		const stored = await this.device.store.get<InstalledData>(DATA);
		return verifyInstalled(stored);
	}

	async load() {
		try {
			await this.loadData();
		} catch {
			this.saveFailed = true;
		}
		try {
			const saved = await this.device.store.get<{ tabs: Calculation[]; current: number }>(KEY);
			if (saved?.tabs?.length) {
				this.tabs = saved.tabs;
				this.current = Math.min(saved.current, saved.tabs.length - 1);
			}
		} catch {
			this.saveFailed = true;
		}
		try {
			const stored = (await this.device.store.get<StoredReport[]>(REPORTS)) ?? [];
			const now = this.device.now();
			for (const report of stored) if (isExpired(report, now)) await this.device.store.del(pdfKey(report.id));
			this.reports = stored.filter((report) => !isExpired(report, now));
			if (this.reports.length !== stored.length) await this.saveReports();
		} catch {
			this.saveFailed = true;
		}
		this.loaded = true;
	}

	private async saveReports() {
		await this.device.store.set(REPORTS, $state.snapshot(this.reports));
	}

	/**
	 * Makes and saves a Report from the current data. It rechecks the stored data first, so a Report
	 * never rests on damaged data, and saves nothing if any step fails.
	 */
	async createReport(source: Omit<ReportSource, 'data' | 'lastCheck'>, tools: Omit<ReportTools, 'now'>): Promise<StoredReport> {
		if (!this.data || !(await this.dataStillValid())) throw new Error('the aircraft data on this device failed its check');
		const { report, pdf } = await makeReport({ ...source, data: this.data, lastCheck: this.lastCheck }, { ...tools, now: this.device.now() });
		await this.addReport(report, pdf);
		return report;
	}

	/** The PDF is written first, so a Report on the list always has its PDF. */
	async addReport(report: StoredReport, pdf: Blob) {
		await this.device.store.set(pdfKey(report.id), pdf);
		this.reports.unshift(report);
		try {
			await this.saveReports();
		} catch (error) {
			// Leaves nothing behind, so "nothing was saved" stays true.
			this.reports = this.reports.filter((r) => r.id !== report.id);
			await this.device.store.del(pdfKey(report.id)).catch(() => {});
			throw error;
		}
	}

	pdf(id: string) {
		return this.device.store.get<Blob>(pdfKey(id));
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
		await this.device.store.del(pdfKey(id));
	}

	/** Opens a Calculation as a new tab and shows it. */
	addTab(calc: Calculation) {
		this.tabs.push(calc);
		this.current = this.tabs.length - 1;
	}

	/** Closes a tab. The tab shown stays the same one where it still exists, otherwise the one before. */
	closeTab(index: number) {
		if (index < 0 || index >= this.tabs.length) return;
		this.tabs.splice(index, 1);
		if (this.current > index || this.current >= this.tabs.length) this.current = Math.max(0, this.current - 1);
	}

	async save() {
		try {
			await this.device.store.set(KEY, $state.snapshot({ tabs: this.tabs, current: this.current }));
			this.saveFailed = false;
		} catch {
			this.saveFailed = true;
		}
	}
}
