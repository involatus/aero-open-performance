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
import { altitudeText, distanceText, utcText, valueSource, limitBadge, massBalanceRows, runwayText, windChoiceText, windText, workingRows } from '../app/presentation.ts';

export type Delivery = 'notSent' | 'sent' | 'shared';
export type ReportWorking = { title: string; rows: { step: string; total: string; groundRoll: string; source: string }[] };
/** Ground roll and total come apart for the results band. Reports made before this have only the headline. */
export type ReportDistance = DistanceText & { condition?: string; groundRoll?: string | null; total?: string | null };
export type ReportData = {
	id: string;
	createdUtc: string;
	preRelease: boolean;
	fictional: boolean;
	aircraft: { registration: string; type: string; revision: number; configuration: string };
	pilot: string;
	departure: string;
	/** Missing on Reports made before it was recorded. */
	runway?: string | null;
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
	const thousands = (x: number | null, unit: string | null) => (x === null ? null : `${x.toLocaleString('en')} ${unit ?? ''}`.trim());
	const distance = (title: string, p: PerformanceResult, m: number): ReportDistance => ({
		...distanceText(title, p, `${mass(m)} ${u.mass}`),
		condition: p.conditionLabel,
		...(p.status === 'ok' ? { groundRoll: thousands(p.groundRoll, p.unit), total: thousands(p.total, p.unit) } : {})
	});
	const altitude = altitudeText(r), wind = windText(r.wind, isVariableWind(calc));
	const windChoice = calc.windForDistances ?? 'entered', windUsed = windChoiceText(r, windChoice);
	const data: ReportData = {
		id: meta.id,
		createdUtc: utcText(meta.now),
		preRelease: meta.preRelease,
		fictional: a.fictional === true,
		aircraft: { registration: a.registration, type: a.type, revision: a.revision, configuration: config.label },
		pilot: calc.values.name.trim(),
		departure: calc.values.place.trim(),
		runway: runwayHeading(calc.values.rwy) === null ? null : String(runwayHeading(calc.values.rwy)! / 10).padStart(2, '0'),
		results: {
			takeoff: distance('Takeoff', r.takeoff, r.massBalance.takeoff.mass),
			landing: distance('Landing', r.landing, r.massBalance.landing.mass),
			pressureAltitude: altitude?.pressure ?? 'Not available',
			densityAltitude: altitude?.density ?? 'Not available',
			wind: `${wind ? `${wind.headline}. ${wind.detail}` : 'Not available'}${windChoice === 'entered' ? '' : `. Distances use: ${windUsed}`}`
		},
		conditions: [
			...['elev', 'rwy', 'qnh', 'oat', 'wdir', 'wspd'].map(shown),
			{ label: 'Wind for distances', value: windUsed, source: 'Chosen by pilot' },
			...['time', 'flow'].map(shown),
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

/* Print colours, from the design. A Report is printed or archived, so it has no dark version. */
const INK = '#13202D', INK2 = '#3E4C59', MUTED = '#5A6876', LINE = '#E1E6EB', DIVIDER = '#C6CFD8', TOTAL = '#B5C0CA', RED = '#A12222', GOOD = '#1B6B44', AMBER = '#7A4D00';
/** IBM Plex, as on screen. The complete fonts cover every European Latin letter a name may use. */
export const SANS = 'PlexSans', MONO = 'PlexMono';
const small = 7.5;
const num = (text: string, extra: Record<string, unknown> = {}) => ({ text, font: MONO, ...extra });
const heading = (text: string) => ({
	table: { widths: ['*'], body: [[{ text: text.toUpperCase(), bold: true, fontSize: 8.6, characterSpacing: 0.7, color: INK }]] },
	layout: { hLineWidth: (i: number) => (i === 1 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => INK, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 3 },
	margin: [0, 0, 0, 4]
});
const rows = { hLineWidth: (i: number) => (i === 0 ? 0 : 0.75), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 2.2, paddingBottom: () => 2.2, paddingLeft: () => 3.5, paddingRight: () => 3.5 };
const th = (text: string, alignment = 'left') => ({ text, bold: true, color: MUTED, fontSize: 8, alignment });
const caps = (text: string) => ({ text: text.toUpperCase(), bold: true, fontSize: 8, characterSpacing: 0.5, color: MUTED });

function distanceCell(d: ReportDistance, totalLabel: string) {
	const label = caps(d.condition ? `${d.title} · ${d.condition}` : d.title);
	if (d.status !== 'ok') return { stack: [label, { text: d.headline, bold: true, fontSize: 10, color: AMBER, margin: [0, 4, 0, 0] }] };
	// The unit is smaller, so a four-digit distance still fits on one line.
	const big = (v: string) => {
		const at = v.lastIndexOf(' ');
		return at < 0 ? num(v, { fontSize: 15, bold: true }) : { text: [{ text: v.slice(0, at), fontSize: 15, bold: true }, { text: v.slice(at), fontSize: 8.5, color: INK2 }], font: MONO, noWrap: true };
	};
	const value = (title: string, v: string | null | undefined) => ({ stack: [{ text: title, color: INK2 }, big(v ?? '–')] });
	const pair = d.groundRoll !== undefined
		? { columns: [value('Ground roll', d.groundRoll), value(totalLabel, d.total)], columnGap: 8, margin: [0, 3, 0, 0] }
		: { ...big(d.headline), margin: [0, 3, 0, 0] };
	return { stack: [label, pair, ...d.warnings.map((w) => ({ text: w, fontSize: small, bold: true, color: AMBER, margin: [0, 2, 0, 0] }))] };
}

/** The one standard Report layout. Returns a pdfmake document definition. */
export function reportDocument(data: ReportData) {
	// pdfmake changes what it is given, so it must never receive the permanent record itself.
	const d = JSON.parse(JSON.stringify(data)) as ReportData;
	const m = d.massBalance;
	const [windHead, ...windRest] = d.results.wind.split('. ');
	const warning = [d.preRelease && 'PRE-RELEASE, NOT FOR FLIGHT', d.fictional && 'FICTIONAL AIRCRAFT WITH INVENTED DATA'].filter(Boolean).join(' · ');
	return {
		pageSize: 'A4', pageMargins: [30, 25, 30, 28],
		info: { title: `Performance report ${d.id}`, subject: `${d.aircraft.registration} ${d.departure}` },
		defaultStyle: { font: SANS, fontSize: 9, lineHeight: 1.15, color: INK },
		footer: (page: number, pages: number) => ({ text: `${d.id} · Page ${page} of ${pages}`, font: MONO, alignment: 'right', fontSize: 7, margin: [30, 8, 30, 0], color: MUTED }),
		content: [
			...(warning ? [{
				table: { widths: ['*'], body: [[{ text: warning, bold: true, fontSize: 7.5, characterSpacing: 0.45, color: RED, alignment: 'center' }]] },
				layout: { hLineWidth: () => 1.1, vLineWidth: () => 1.1, hLineColor: () => RED, vLineColor: () => RED, paddingTop: () => 3, paddingBottom: () => 3 },
				margin: [0, 0, 0, 10]
			}] : []),
			{ columns: [
				{ width: '*', stack: [
					caps('Performance report'),
					{ text: [{ text: d.aircraft.registration, bold: true }, { text: ` · ${d.departure}${d.runway ? ` runway ${d.runway}` : ''}`, color: INK2 }], fontSize: 19.5, margin: [0, 2, 0, 0] },
					{ text: `${d.aircraft.type} · ${d.aircraft.configuration} · Data revision ${d.aircraft.revision}`, color: INK2, margin: [0, 2, 0, 0] }
				] },
				{ width: 'auto', alignment: 'right', stack: [num(d.createdUtc, { bold: true, fontSize: 9.75 }), { text: `Pilot: ${d.pilot}`, color: INK2 }, num(d.id, { fontSize: 7.5, color: MUTED })], margin: [0, 8, 0, 0] }
			], columnGap: 15, margin: [0, 0, 0, 10] },
			{
				table: { widths: ['*', '*', 84, 84], body: [[
					distanceCell(d.results.takeoff, 'Over 50 ft'),
					distanceCell(d.results.landing, 'From 50 ft'),
					{ stack: [caps('Altitude'), num(`DA ${d.results.densityAltitude}`, { bold: true, fontSize: 12.75, margin: [0, 4, 0, 0] }), { text: [{ text: 'PA ' }, { text: d.results.pressureAltitude, font: MONO }] }] },
					{ stack: [caps('Wind'), num(windHead, { bold: true, fontSize: 12.75, margin: [0, 4, 0, 0] }), ...windRest.map((t) => ({ text: t, fontSize: small, color: INK2 }))] }
				]] },
				layout: {
					hLineWidth: () => 1.1, vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? 1.1 : 0.75),
					hLineColor: () => INK, vLineColor: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? INK : DIVIDER),
					paddingLeft: () => 9, paddingRight: () => 9, paddingTop: () => 7, paddingBottom: () => 7
				},
				margin: [0, 0, 0, 12]
			},
			{ columns: [
				{ width: '*', stack: [
					heading('Conditions'),
					{ table: { widths: ['auto', 'auto', '*'], headerRows: 1, body: [
						[th('Item'), th('Value', 'right'), th('Source')],
						...d.conditions.map((c) => [c.label, num(c.value, { alignment: 'right' }), { text: c.source, color: MUTED, fontSize: 8 }])
					] }, layout: rows },
					...(d.rawMetar ? [{ text: ['Raw METAR: ', { text: d.rawMetar, font: MONO }], fontSize: 7, color: INK2, margin: [0, 5, 0, 0] }] : [])
				] },
				{ width: '*', stack: [
					heading('Mass and balance'),
					{ table: { widths: ['*', 'auto', 'auto', 'auto'], headerRows: 1, body: [
						[th('Item'), th(m.units.mass, 'right'), th(m.units.arm, 'right'), th('Moment', 'right')],
						...m.rows.map((r) => [r.label, num(r.mass, { alignment: 'right' }), num(r.arm, { alignment: 'right' }), num(r.moment, { alignment: 'right' })]),
						...([['Takeoff', m.takeoff], ['Landing', m.landing]] as const).map(([label, t]) => [{ text: label, bold: true }, num(t.mass, { alignment: 'right', bold: true }), num(t.arm, { alignment: 'right', bold: true }), num(t.moment, { alignment: 'right', bold: true })])
					] }, layout: { ...rows, hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i >= node.table.body.length - 2 ? TOTAL : LINE) } },
					{ text: `Burn plan: ${m.burnPlan}. Burned ${m.burned}.`, fontSize: small, color: INK2, margin: [0, 3, 0, 6] },
					{ svg: d.chartSvg, fit: [252, 150] }
				] }
			], columnGap: 18, margin: [0, 0, 0, 12] },
			heading('Limits'),
			{ columns: chunk(d.limits, 2).map((part) => ({ table: { widths: [26, '*', 'auto'], body: part.map((l) => [
				{ text: l.status, bold: true, color: l.status === 'OK' ? GOOD : l.status === 'CHECK' ? AMBER : RED },
				l.label,
				num(l.detail, { alignment: 'right' })
			]) }, layout: rows })), columnGap: 18, margin: [0, 0, 0, 12] },
			heading('Working'),
			...d.working.map((w) => ({
				table: { widths: ['*', 50, 50, 112], headerRows: 1, dontBreakRows: true, body: [
					[th(w.title), th('Gr. roll', 'right'), th('50 ft', 'right'), th('Source')],
					...w.rows.map((r, i) => {
						const last = i === w.rows.length - 1 && r.step.startsWith('Rounded');
						return [{ text: r.step, bold: last }, num(r.groundRoll, { alignment: 'right', bold: last }), num(r.total, { alignment: 'right', bold: last }), { text: r.source, color: MUTED, fontSize: 8 }];
					})
				] },
				layout: rows, margin: [0, 0, 0, 8]
			})),
			{
				table: { widths: ['*'], body: [[{ stack: [
					...d.notes.map((n) => ({ columns: [{ width: 12, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" fill="none" stroke="#1B6B44" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', fit: [9, 9], margin: [0, 1.5, 0, 0] }, { text: `Manual note confirmed by the pilot: ${n}` }], margin: [0, 0, 0, 3] })),
					{ text: RESPONSIBILITY, bold: true, fontSize: 9, margin: [0, 2, 0, 3] },
					{ text: `Tool ${d.footer.toolVersion} · ${d.footer.dataRelease} · Aircraft revision ${d.aircraft.revision} · Last data check ${d.footer.lastDataCheck}. The pilot's name is for traceability and is not a signature.`, fontSize: 7, color: MUTED }
				] }]] },
				layout: { hLineWidth: (i: number) => (i === 0 ? 1.1 : 0), vLineWidth: () => 0, hLineColor: () => INK, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 8, paddingBottom: () => 0 },
				unbreakable: true, margin: [0, 6, 0, 0]
			}
		]
	};
}

function chunk<T>(list: T[], parts: number): T[][] {
	const size = Math.ceil(list.length / parts), out: T[][] = [];
	for (let i = 0; i < parts; i++) out.push(list.slice(i * size, (i + 1) * size));
	return out.filter((p) => p.length);
}

