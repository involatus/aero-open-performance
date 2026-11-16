/**
 * Report delivery: how a Report's PDF leaves the device, and when it counts as sent. Today the pilot shares it to
 * their own mail app. The device's share features come in as a `Device`, so the rules below are tested with a
 * stand-in, and sending from a server could later come in at the same place.
 *
 * iPadOS only lets the share sheet open straight after a tap. So the PDF is read from storage ahead of time
 * (`prepare`), and `share` does nothing that waits before it asks the device, once the PDF is ready.
 */
import { shareText, type Delivery, type StoredReport } from './report.ts';

/** What delivery needs from the device. */
export type Device = {
	canShareFiles(files: File[]): boolean;
	/** Rejects with an `AbortError` when the pilot closes the share sheet. */
	share(data: { files: File[]; title: string; text?: string }): Promise<void>;
	copy(text: string): Promise<void>;
	open(file: File): void;
};

/** What delivery needs from the app: the stored Reports, their PDFs and the club's report address. */
export type DeliverySource = {
	readonly reports: StoredReport[];
	pdf(id: string): Promise<Blob | undefined>;
	setDelivery(id: string, delivery: Delivery): Promise<void>;
	readonly data: { index: { reportEmail?: string } } | null;
};

export const browserDevice: Device = {
	canShareFiles: (files) => !!navigator.canShare?.({ files }),
	share: (data) => navigator.share(data),
	copy: (text) => navigator.clipboard?.writeText(text) ?? Promise.resolve(),
	open(file) {
		const url = URL.createObjectURL(file);
		if (!window.open(url, '_blank')) location.href = url;
	}
};

const MISSING = 'The PDF for this report is missing on this device.';

export class ReportDelivery {
	private files = new Map<string, File>();

	constructor(private source: DeliverySource, private device: Device = browserDevice) {}

	/** Reads the PDF into memory, so a later share needs no wait. Undefined if the device has lost it. */
	async prepare(id: string): Promise<File | undefined> {
		const kept = this.files.get(id);
		if (kept) return kept;
		const blob = await this.source.pdf(id);
		if (!blob) return undefined;
		const file = new File([blob], `${id}.pdf`, { type: 'application/pdf' });
		this.files.set(id, file);
		return file;
	}

	/**
	 * Shares the PDF with the email text, and copies the report address to paste as the recipient. Only a finished
	 * share marks the Report as shared. Returns what to tell the pilot, or null when it worked or they cancelled.
	 */
	async share(id: string): Promise<string | null> {
		const file = this.files.get(id) ?? (await this.prepare(id));
		if (!file) return MISSING;
		if (!this.device.canShareFiles([file])) return 'This device cannot share files from the app. Open the PDF and save or send it from there.';
		const report = this.source.reports.find((r) => r.id === id);
		const reportEmail = this.source.data?.index.reportEmail ?? '';
		try {
			// Not awaited, so the share still runs within the tap. If copying fails, the address is still in the text.
			if (reportEmail) this.device.copy(reportEmail).catch(() => {});
			await this.device.share({ files: [file], ...(report ? shareText(report.data, reportEmail) : { title: `Performance report ${id}` }) });
		} catch (error) {
			return (error as Error).name === 'AbortError' ? null : `Sharing failed: ${(error as Error).message}. Try again.`;
		}
		await this.source.setDelivery(id, 'shared');
		return null;
	}

	/** Opens the PDF in the device's viewer. Returns what to tell the pilot, or null. */
	async open(id: string): Promise<string | null> {
		const file = await this.prepare(id);
		if (!file) return MISSING;
		this.device.open(file);
		return null;
	}

	/** Drops the PDF kept for a deleted Report. */
	forget(id: string) {
		this.files.delete(id);
	}
}
