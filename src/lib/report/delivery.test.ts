import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { validateAircraft } from '../aircraft/validate.ts';
import { newCalculation, setByPilot, toInput } from '../app/calculation.ts';
import { calculate } from '../engine/index.ts';
import { chartSvg } from './chart.ts';
import { ReportDelivery, type DeliverySource, type Device } from './delivery.ts';
import { createReportData, shareText, type StoredReport } from './report.ts';

const NOW = Date.UTC(2026, 10, 6, 12, 30);
function reportData() {
	const r = validateAircraft(JSON.parse(readFileSync('aircraft-examples/test-dr-style.json', 'utf8')));
	if (!r.ok) throw new Error(r.problems.join());
	const a = r.aircraft, c = newCalculation(a, 'x', NOW);
	setByPilot(c, `load:${a.stations[0].id}`, '80');
	a.tanks.forEach((t) => setByPilot(c, `fuel:${t.id}`, '40'));
	for (const [k, v] of [['time', '1'], ['flow', '20'], ['elev', '100'], ['rwy', '9'], ['qnh', '1013'], ['oat', '15'], ['wdir', '90'], ['wspd', '5']]) setByPilot(c, k, v);
	c.values.place = 'LSZK Speck-Fehraltorf'; c.values.name = 'A Pilot';
	a.notes.forEach((n) => { c.notes[n.id] = true; });
	c.conditionChoice = { takeoff: 'pilot', landing: 'pilot' };
	const results = calculate(a, toInput(a, c));
	return createReportData(a, c, results, { id: 'AOP-1', now: NOW, toolVersion: '0.1.0', dataRelease: 'Demo data', lastDataCheck: 'n/a', chartSvg: chartSvg(a, results, c.configuration) });
}
const DATA = reportData();

/** An app with one Report and its PDF, and a device that shares unless told otherwise. */
function setup(o: { reportEmail?: string; pdf?: boolean; canShare?: boolean; share?: () => Promise<void> } = {}) {
	const report = { id: 'AOP-1', calculationId: 'x', created: NOW, label: 'A', delivery: 'notSent', fingerprint: 'f', data: DATA } as StoredReport;
	const source: DeliverySource & { reads: number } = {
		reports: [report], reads: 0,
		async pdf(id) { this.reads++; return o.pdf === false || id !== 'AOP-1' ? undefined : new Blob(['%PDF-1.7'], { type: 'application/pdf' }); },
		async setDelivery(id, delivery) { if (id === report.id) report.delivery = delivery; },
		data: { index: { reportEmail: o.reportEmail } }
	};
	const device = { canShareFiles: vi.fn<Device['canShareFiles']>(() => o.canShare ?? true), share: vi.fn<Device['share']>(o.share ?? (async () => {})), copy: vi.fn<Device['copy']>(async () => {}), open: vi.fn<Device['open']>() };
	return { report, source, device, delivery: new ReportDelivery(source, device) };
}

describe('Report delivery', () => {
	it('shares the PDF with the email text, and only then counts the Report as shared', async () => {
		const { report, device, delivery } = setup({ reportEmail: 'ops@club.example' });
		expect(await delivery.share('AOP-1')).toBeNull();
		const sent = device.share.mock.calls[0][0];
		expect(sent.files[0].name).toBe('AOP-1.pdf');
		expect(sent.files[0].type).toBe('application/pdf');
		expect(sent).toMatchObject(shareText(DATA, 'ops@club.example'));
		expect(device.copy).toHaveBeenCalledWith('ops@club.example');
		expect(report.delivery).toBe('shared');
	});

	it('asks the device to share within the tap once the PDF is prepared', async () => {
		const { device, delivery } = setup({ reportEmail: 'ops@club.example' });
		await delivery.prepare('AOP-1');
		const sharing = delivery.share('AOP-1');
		// Nothing awaited yet: iPadOS only opens the share sheet straight after a tap.
		expect(device.copy).toHaveBeenCalled();
		expect(device.share).toHaveBeenCalled();
		await sharing;
	});

	it('reads each PDF from storage once, until the Report is deleted', async () => {
		const { source, delivery } = setup();
		await delivery.prepare('AOP-1');
		await delivery.share('AOP-1');
		await delivery.open('AOP-1');
		expect(source.reads).toBe(1);
		delivery.forget('AOP-1');
		await delivery.prepare('AOP-1');
		expect(source.reads).toBe(2);
	});

	it('stays quiet and unshared when the pilot closes the share sheet', async () => {
		const { report, delivery } = setup({ share: async () => { throw new DOMException('closed', 'AbortError'); } });
		expect(await delivery.share('AOP-1')).toBeNull();
		expect(report.delivery).toBe('notSent');
	});

	it('says why when sharing fails, and leaves the Report unshared', async () => {
		const { report, delivery } = setup({ share: async () => { throw new Error('No mail app'); } });
		expect(await delivery.share('AOP-1')).toBe('Sharing failed: No mail app. Try again.');
		expect(report.delivery).toBe('notSent');
	});

	it('points to the PDF when the device cannot share files', async () => {
		const { device, delivery } = setup({ canShare: false });
		expect(await delivery.share('AOP-1')).toBe('This device cannot share files from the app. Open the PDF and save or send it from there.');
		expect(device.share).not.toHaveBeenCalled();
	});

	it('says so when the PDF is gone from the device', async () => {
		const { device, delivery } = setup({ pdf: false });
		expect(await delivery.share('AOP-1')).toBe('The PDF for this report is missing on this device.');
		expect(await delivery.open('AOP-1')).toBe('The PDF for this report is missing on this device.');
		expect(device.share).not.toHaveBeenCalled();
		expect(device.open).not.toHaveBeenCalled();
	});

	it('copies nothing without a report address, and a failed copy does not stop the share', async () => {
		const plain = setup();
		await plain.delivery.share('AOP-1');
		expect(plain.device.copy).not.toHaveBeenCalled();
		expect(plain.device.share.mock.calls[0][0].text).not.toContain('Send to:');
		const blocked = setup({ reportEmail: 'ops@club.example' });
		blocked.device.copy.mockRejectedValueOnce(new Error('denied'));
		expect(await blocked.delivery.share('AOP-1')).toBeNull();
		expect(blocked.report.delivery).toBe('shared');
	});

	it('opens the PDF in the device viewer', async () => {
		const { device, delivery } = setup();
		expect(await delivery.open('AOP-1')).toBeNull();
		expect(device.open.mock.calls[0][0].name).toBe('AOP-1.pdf');
	});
});
