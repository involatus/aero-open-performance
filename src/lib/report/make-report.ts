/**
 * Making one Report: the permanent record and its PDF, from a finished Calculation.
 * The clock, random bytes and PDF renderer come in from outside, so the whole step is testable.
 */
import type { Aircraft } from '../aircraft/schema.ts';
import type { Calculation } from '../app/calculation.ts';
import { utcText } from '../app/presentation.ts';
import type { InstalledData } from '../data/release.ts';
import type { Calculation as Results } from '../engine/index.ts';
import { chartSvg } from './chart.ts';
import { createReportData, fingerprint, newReportId, reportDocument, type StoredReport } from './report.ts';

export type ReportSource = { aircraft: Aircraft; calc: Calculation; results: Results; data: InstalledData; lastCheck: number | null; toolVersion: string };
export type ReportTools = { now: number; random: Uint8Array; render: (document: unknown) => Promise<Blob> };

/** Throws, creating nothing, if the Calculation isn't ready for a Report. */
export async function makeReport(s: ReportSource, t: ReportTools): Promise<{ report: StoredReport; pdf: Blob }> {
	const id = newReportId(t.now, t.random);
	const data = createReportData(s.aircraft, s.calc, s.results, {
		id, now: t.now, preRelease: true, toolVersion: s.toolVersion,
		dataRelease: `Data Release ${s.data.index.release} (${s.data.index.operator})`,
		lastDataCheck: s.lastCheck ? utcText(s.lastCheck) : 'unknown',
		chartSvg: chartSvg(s.aircraft, s.results, s.calc.configuration)
	});
	const pdf = await t.render(reportDocument(data));
	const report: StoredReport = {
		id, calculationId: s.calc.id, created: t.now, label: `${s.aircraft.registration} ${data.departure}, ${utcText(t.now)}`,
		delivery: 'notSent', fingerprint: fingerprint(s.aircraft, s.calc), data
	};
	return { report, pdf };
}
