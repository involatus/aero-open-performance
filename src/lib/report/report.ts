/**
 * Reports: permanent records of one start. All text is captured when the Report is created,
 * so nothing that changes later can alter it.
 */
import type { Aircraft } from '../aircraft/schema.ts';
import type { Calculation as Results } from '../engine/index.ts';
import type { PerformanceResult } from '../engine/performance.ts';
import type { DistanceText } from '../app/presentation.ts';
import { limitText } from '../engine/mass-balance.ts';
import { canReport, fieldsFor, isVariableWind, performanceOf, toInput, type Calculation, runwayHeading } from '../app/calculation.ts';
import { altitudeText, distanceText, utcText, valueSource, limitBadge, massBalanceRows, runwayText, windText, workingRows } from '../app/presentation.ts';

export type Delivery = 'notSent' | 'sent' | 'shared';
export type ReportWorking = { title: string; rows: { step: string; total: string; groundRoll: string; source: string }[] };
export type ReportDistance = DistanceText;
export type ReportData = {
	id: string;
	createdUtc: string;
	preRelease: boolean;
	fictional: boolean;
	aircraft: { registration: string; type: string; revision: number; configuration: string };
	pilot: string;
	departure: string;
	results: { takeoff: ReportDistance; landing: ReportDistance; pressureAltitude: string; densityAltitude: string; wind: string };
	conditions: { label: string; value: string; source: string }[];
	rawMetar: string | null;
	massBalance: {
		rows: { label: string; mass: string; arm: string; moment: string }[];
		takeoff: { mass: string; arm: string; moment: string };
		landing: { mass: string; arm: string; moment: string };
		burnPlan: string;
		burned: string;
		units: { mass: string; arm: string; volume: string };
	};
	limits: { label: string; status: string; detail: string }[];
	chartSvg: string;
	working: ReportWorking[];
	notes: string[];
	footer: { toolVersion: string; dataRelease: string; lastDataCheck: string };
};
export type StoredReport = {
	id: string;
	calculationId: string;
	created: number;
	label: string;
	delivery: Delivery;
	fingerprint: string;
	data: ReportData;
};

export const RETENTION_DAYS = 90;
export const RESPONSIBILITY = 'The pilot in command is responsible for verifying these results.';

export function newReportId(now: number, random: Uint8Array): string {
	const stamp = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14);
	const tail = Array.from(random.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
	return `AOP-${stamp}-${tail}`;
}

export function deliveryLabel(delivery: Delivery): string {
	return { notSent: 'Not sent', sent: 'Sent', shared: 'Shared, delivery unknown' }[delivery];
}

/** Everything that would change a Report. A difference means the current inputs need a new one. */
export function fingerprint(a: Aircraft, calc: Calculation): string {
	return JSON.stringify([a.registration, a.revision, toInput(a, calc), calc.values.place?.trim(), calc.values.name?.trim(), calc.notes, calc.status, calc.weather?.raw ?? null]);
}

/** "Not sent" reports are never removed automatically. */
export function isExpired(report: Pick<StoredReport, 'created' | 'delivery'>, now: number): boolean {
	return report.delivery !== 'notSent' && now - report.created > RETENTION_DAYS * 86400000;
}



function working(a: Aircraft, title: string, r: PerformanceResult): ReportWorking {
	return { title: `${title}, ${r.conditionLabel}`, rows: workingRows(a, r) };
}

export type ReportMeta = { id: string; now: number; toolVersion: string; dataRelease: string; lastDataCheck: string; preRelease: boolean; chartSvg: string };

/** Refuses to create a Report unless everything is confirmed and no limit is exceeded. */
export function createReportData(a: Aircraft, calc: Calculation, r: Results, meta: ReportMeta): ReportData {
	if (!canReport(a, calc, r)) throw new Error('This calculation is not ready for a Report');
	const u = a.units;
	const mass = (x: number) => x.toFixed(a.display.massDecimals);
	const config = a.configurations.find((c) => c.id === calc.configuration)!;
	const plan = a.burnPlans.find((p) => p.id === calc.burnPlan)!;
	const allFields = fieldsFor(a, calc).flat();
	const shown = (key: string) => {
		const f = allFields.find((x) => x.key === key)!;
		// A runway number alone can be misread, so the report also gives the heading it stands for.
		const h = key === 'rwy' ? runwayHeading(calc.values.rwy) : null;
		const value = h !== null ? runwayText(h) : `${calc.values[key] ?? ''} ${f.unit}`.trim();
		return { label: f.label, value, source: valueSource(calc, key) };
	};
	const perf = performanceOf(a, calc.configuration);
	const conditionLabel = (phase: 'takeoff' | 'landing', id: string) => perf?.[phase].find((c) => c.id === id)?.label ?? id;
	const altitude = altitudeText(r), wind = windText(r.wind, isVariableWind(calc));
	const data: ReportData = {
		id: meta.id,
		createdUtc: utcText(meta.now),
		preRelease: meta.preRelease,
		fictional: a.fictional === true,
		aircraft: { registration: a.registration, type: a.type, revision: a.revision, configuration: config.label },
		pilot: calc.values.name.trim(),
		departure: calc.values.place.trim(),
		results: {
			takeoff: distanceText('Takeoff', r.takeoff, `${mass(r.massBalance.takeoff.mass)} ${u.mass}`),
			landing: distanceText('Landing', r.landing, `${mass(r.massBalance.landing.mass)} ${u.mass}`),
			pressureAltitude: altitude?.pressure ?? 'Not available',
			densityAltitude: altitude?.density ?? 'Not available',
			wind: wind ? `${wind.headline}. ${wind.detail}` : 'Not available'
		},
		conditions: [
			...['elev', 'rwy', 'qnh', 'oat', 'wdir', 'wspd', 'time', 'flow'].map(shown),
			...a.tanks.map((t) => shown(`fuel:${t.id}`)),
			{ label: 'Takeoff condition', value: conditionLabel('takeoff', calc.takeoffCondition), source: 'Chosen by pilot' },
			{ label: 'Landing condition', value: conditionLabel('landing', calc.landingCondition), source: 'Chosen by pilot' }
		],
		rawMetar: calc.weather?.raw ?? null,
		massBalance: {
			...(({ rows, takeoff, landing }) => ({ rows: rows.map(({ id: _, ...row }) => row), takeoff, landing }))(massBalanceRows(a, r)),
			burnPlan: plan.label,
			burned: `${r.massBalance.burned.toFixed(1)} ${u.volume}`,
			units: { mass: u.mass, arm: u.arm, volume: u.volume }
		},
		limits: r.massBalance.limits.map((l) => ({
			label: l.label,
			status: limitBadge(l.status).text,
			detail: limitText(a, l)
		})),
		chartSvg: meta.chartSvg,
		working: [working(a, 'Takeoff', r.takeoff), working(a, 'Landing', r.landing)].filter((w) => w.rows.length),
		notes: a.notes.map((n) => n.text),
		footer: { toolVersion: meta.toolVersion, dataRelease: meta.dataRelease, lastDataCheck: meta.lastDataCheck }
	};
	return JSON.parse(JSON.stringify(data)) as ReportData;
}

const small = 7.5;
const head = (text: string) => ({ text: text.toUpperCase(), bold: true, fontSize: 8.5, margin: [0, 6, 0, 2], color: '#14263a' });
const lines = { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#b7c4cf', paddingTop: () => 0.8, paddingBottom: () => 0.8, paddingLeft: () => 3, paddingRight: () => 3 };

function distanceBlock(d: ReportDistance) {
	return { stack: [
		{ text: d.title.toUpperCase(), bold: true, fontSize: 8, color: '#566778' },
		{ text: d.headline, bold: true, fontSize: d.status === 'ok' ? 18 : 10, color: d.status === 'ok' ? '#14263a' : '#805300' },
		{ text: d.detail, fontSize: small },
		...d.warnings.map((w) => ({ text: w, fontSize: small, bold: true, color: '#805300' }))
	] };
}

/** The one standard Report layout. Returns a pdfmake document definition. */
export function reportDocument(data: ReportData) {
	// pdfmake changes what it is given, so it must never receive the permanent record itself.
	const d = JSON.parse(JSON.stringify(data)) as ReportData;
	const m = d.massBalance;
	const banner: unknown[] = [];
	if (d.preRelease || d.fictional) banner.push({ text: `${d.preRelease ? 'PRE-RELEASE, NOT FOR FLIGHT.' : ''}${d.fictional ? ' FICTIONAL AIRCRAFT WITH INVENTED DATA.' : ''}`.trim(), bold: true, fontSize: 9, color: '#a12222', margin: [0, 0, 0, 5] });
	return {
		pageSize: 'A4', pageMargins: [30, 20, 30, 24],
		info: { title: `Performance report ${d.id}`, subject: `${d.aircraft.registration} ${d.departure}` },
		defaultStyle: { fontSize: 8.5, lineHeight: 1 },
		footer: (page: number, pages: number) => ({ text: `${d.id}    Page ${page} of ${pages}`, alignment: 'right', fontSize: 7, margin: [30, 6, 30, 0], color: '#566778' }),
		content: [
			...banner,
			{ columns: [
				{ stack: [{ text: 'Performance report', bold: true, fontSize: 15 }, { text: `${d.aircraft.registration}, ${d.aircraft.type}, ${d.aircraft.configuration}`, fontSize: 9.5 }] },
				{ stack: [{ text: d.createdUtc, bold: true }, { text: `Pilot: ${d.pilot}` }, { text: `Departure: ${d.departure}` }], alignment: 'right', width: 200 }
			] },
			head('Results'),
			{ columns: [distanceBlock(d.results.takeoff), distanceBlock(d.results.landing), { stack: [
				{ text: 'ALTITUDE AND WIND', bold: true, fontSize: 8, color: '#566778' },
				{ text: `Pressure altitude ${d.results.pressureAltitude}` }, { text: `Density altitude ${d.results.densityAltitude}` }, { text: `Wind ${d.results.wind}` }
			] }], columnGap: 12 },
			head('Conditions'),
			{ table: { widths: [86, 44, '*', 86, 44, '*'], body: pairRows(d.conditions) }, layout: lines, fontSize: small },
			...(d.rawMetar ? [{ text: `Raw METAR: ${d.rawMetar}`, fontSize: small, margin: [0, 3, 0, 0] }] : []),
			head('Mass and balance'),
			{ columns: [
				{ width: '*', stack: [
					{ table: { widths: ['*', 42, 38, 52], headerRows: 1, body: [
						[{ text: 'Item', bold: true }, { text: m.units.mass, bold: true, alignment: 'right' }, { text: m.units.arm, bold: true, alignment: 'right' }, { text: 'Moment', bold: true, alignment: 'right' }],
						...m.rows.map((r) => [r.label, { text: r.mass, alignment: 'right' }, { text: r.arm, alignment: 'right' }, { text: r.moment, alignment: 'right' }]),
						[{ text: 'Takeoff', bold: true }, { text: m.takeoff.mass, bold: true, alignment: 'right' }, { text: m.takeoff.arm, bold: true, alignment: 'right' }, { text: m.takeoff.moment, bold: true, alignment: 'right' }],
						[{ text: 'Landing', bold: true }, { text: m.landing.mass, bold: true, alignment: 'right' }, { text: m.landing.arm, bold: true, alignment: 'right' }, { text: m.landing.moment, bold: true, alignment: 'right' }]
					] }, layout: lines, fontSize: small },
					{ text: `Burn plan: ${m.burnPlan}. Burned ${m.burned}.`, fontSize: small, margin: [0, 3, 0, 0] }
				] },
				{ width: 205, svg: d.chartSvg, fit: [205, 121] }
			], columnGap: 10 },
			head('Limits'),
			{ columns: chunk(d.limits, 2).map((part) => ({ table: { widths: [32, '*', 'auto'], body: part.map((l) => [{ text: l.status, bold: true, color: l.status === 'OK' ? '#16663f' : '#a12222' }, l.label, { text: l.detail, alignment: 'right' }]) }, layout: lines, fontSize: small })), columnGap: 12 },
			head('Working'),
			...d.working.flatMap((w) => [
				{ text: w.title, bold: true, fontSize: small, margin: [0, 2, 0, 1] },
				{ table: { widths: ['*', 34, 42, 140], headerRows: 1, dontBreakRows: true, body: [
					[{ text: 'Step', bold: true }, { text: 'Total', bold: true, alignment: 'right' }, { text: 'Ground roll', bold: true, alignment: 'right' }, { text: 'Source', bold: true }],
					...w.rows.map((r) => [r.step, { text: r.total, alignment: 'right' }, { text: r.groundRoll, alignment: 'right' }, r.source])
				] }, layout: lines, fontSize: small }
			]),
			head('Confirmation'),
			...(d.notes.length ? [{ text: 'Manual notes confirmed by the pilot:', fontSize: small }, { ul: d.notes, fontSize: small }] : []),
			{ text: RESPONSIBILITY, bold: true, margin: [0, 3, 0, 3] },
			{ text: `Report ID ${d.id}. Tool ${d.footer.toolVersion}. ${d.footer.dataRelease}. Aircraft revision ${d.aircraft.revision}. Last data check: ${d.footer.lastDataCheck}. The pilot's name is for traceability and is not a signature.`, fontSize: small, color: '#566778' }
		]
	};
}

function chunk<T>(list: T[], parts: number): T[][] {
	const size = Math.ceil(list.length / parts), out: T[][] = [];
	for (let i = 0; i < parts; i++) out.push(list.slice(i * size, (i + 1) * size));
	return out.filter((p) => p.length);
}
function pairRows(items: ReportData['conditions']) {
	const rows: unknown[][] = [];
	for (let i = 0; i < items.length; i += 2) {
		const [a, b] = [items[i], items[i + 1]];
		rows.push([a.label, { text: a.value, bold: true }, a.source, b?.label ?? '', { text: b?.value ?? '', bold: true }, b?.source ?? '']);
	}
	return rows;
}
