/**
 * Reports: permanent records of one start. All text is captured when the Report is created,
 * so nothing that changes later can alter it.
 */
import type { Aircraft } from '../aircraft/schema.ts';
import type { Calculation as Results } from '../engine/index.ts';
import type { PerformanceResult } from '../engine/performance.ts';
import type { DistanceText } from '../app/presentation.ts';
import { limitText } from '../engine/mass-balance.ts';
import { canReport, fieldsFor, isVariableWind, keyAt, toInput, type Calculation, type Place, runwayHeading, weatherAt, windChoiceAt } from '../app/calculation.ts';
import { altitudeText, distanceText, enteredWindKept, landingConditions, sourceText, utcText, valueSource, limitBadge, massBalanceRows, windChoiceText, windText, workingRows } from '../app/presentation.ts';
import { lookupView, type LookupView } from '../app/lookup-grid.ts';

export type Delivery = 'notSent' | 'sent' | 'shared';
/** The manual's table each lookup read, with where the result falls. Missing on Reports made before it was recorded. */
export type ReportLookup = { caption: string; view: LookupView };
export type ReportWorking = { title: string; rows: { step: string; total: string; groundRoll: string; source: string }[]; tables?: ReportLookup[] };
/** Ground roll and total come apart for the results band. Reports made before this have only the headline. */
export type ReportDistance = DistanceText & { condition?: string; groundRoll?: string | null; total?: string | null; mass?: string };
/**
 * The wind in the compact form of EFB summaries: "VRB 2 kt", then the components the distances use,
 * such as "TW 3 kt" or "HW 8 kt · XW 6 kt", and the pilot's choice when it isn't the entered wind.
 * Missing on Reports made before it was recorded.
 */
export type ReportWind = { reported: string; used: string | null; choice: string | null };
type Sourced = { value: string; source: string };
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
	results: { takeoff: ReportDistance; landing: ReportDistance; pressureAltitude: string; densityAltitude: string; wind: string; windShort?: ReportWind };
	/** The landing airfield's conditions, when it isn't the departure one. Missing on Reports made before it was recorded. */
	landing?: { airfield: string; runway: string | null; pressureAltitude: string; densityAltitude: string; wind: string; windShort?: ReportWind; rawMetar: string | null } | null;
	/** With a landing elsewhere, the place values also carry the landing airfield's value beside the departure one. */
	conditions: { label: string; value: string; source: string; landing?: { value: string; source: string } }[];
	rawMetar: string | null;
	massBalance: {
		/** A tank's row carries its fuel volume, as on loading forms. */
		rows: { label: string; mass: string; arm: string; moment: string; fuel?: Sourced }[];
		takeoff: { mass: string; arm: string; moment: string };
		landing: { mass: string; arm: string; moment: string };
		/** Flight time and fuel flow sit with the burn. Reports made before this have them under conditions. */
		time?: Sourced;
		flow?: Sourced;
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
	return JSON.stringify([a.registration, a.revision, toInput(a, calc), calc.values.place?.trim(), calc.values.name?.trim(), calc.notes, calc.status, calc.weather?.raw ?? null, ...(calc.landingElsewhere ? [calc.values['land:place']?.trim(), calc.landingWeather?.raw ?? null] : [])]);
}

/** "Not sent" reports are never removed automatically. */
export function isExpired(report: Pick<StoredReport, 'created' | 'delivery'>, now: number): boolean {
	return report.delivery !== 'notSent' && now - report.created > RETENTION_DAYS * 86400000;
}



function working(a: Aircraft, title: string, r: PerformanceResult): ReportWorking {
	const tables = r.steps.flatMap((step) => {
		const view = step.lookup && lookupView(a, step.lookup);
		if (!view) return [];
		const source = sourceText(a, step.source);
		return [{ caption: `${view.output}${r.unit ? `, ${r.unit}` : ''}, as printed${source ? ` in ${source}` : ''}`, view }];
	});
	return { title: `${title}, ${r.conditionLabel}`, rows: workingRows(a, r), tables };
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
		// A runway number alone can be misread, so the report also gives the heading it stands for: "08 (080°)".
		const h = key === keyAt('departure', 'rwy') || key === keyAt('landing', 'rwy') ? runwayHeading(calc.values[key]) : null;
		const value = h !== null ? `${String(h / 10).padStart(2, '0')} (${String(h).padStart(3, '0')}°)` : `${calc.values[key] ?? ''} ${f.unit}`.trim();
		return { label: f.label, value, source: valueSource(calc, key) };
	};
	const sourced = (key: string): Sourced => (({ value, source }) => ({ value, source }))(shown(key));
	/** Direction and speed in one value, as a METAR gives them: "VRB 2 kt", "250° 10 kt". */
	const windRow = (place: Place) => {
		const dir = keyAt(place, 'wdir'), spd = keyAt(place, 'wspd');
		const direction = isVariableWind(calc, place) ? 'VRB' : `${calc.values[dir].trim().padStart(3, '0')}°`;
		const [from, speed] = [valueSource(calc, dir), valueSource(calc, spd)];
		return { label: 'Wind', value: `${direction} ${calc.values[spd].trim()} kt`, source: from === speed ? from : `Direction: ${from}; speed: ${speed}` };
	};
	const kt = (x: number) => `${Math.abs(x).toFixed(0)} kt`;
	const CHOICE_SHORT = { entered: '', none: 'No wind', tail3: 'TW 3 kt' };
	const windShort = (place: Place): ReportWind => {
		const at = place === 'landing' ? landingConditions(r) : r, choice = windChoiceAt(calc, place), w = at.distanceWind;
		const used = !w ? null : isVariableWind(calc, place) ? `TW ${kt(w.headwind)}` : `${w.headwind >= 0 ? 'HW' : 'TW'} ${kt(w.headwind)} · XW ${kt(w.crosswind)}`;
		return {
			reported: windRow(place).value,
			used,
			choice: choice === 'entered' ? null : `${CHOICE_SHORT[choice]} chosen${enteredWindKept(at, choice) ? ', stronger entered TW used' : ''}`
		};
	};
	const thousands = (x: number | null, unit: string | null) => (x === null ? null : `${x.toLocaleString('en')} ${unit ?? ''}`.trim());
	const distance = (title: string, p: PerformanceResult, m: number): ReportDistance => ({
		...distanceText(title, p, `${mass(m)} ${u.mass}`),
		condition: p.conditionLabel,
		mass: `${mass(m)} ${u.mass}`,
		...(p.status === 'ok' ? { groundRoll: thousands(p.groundRoll, p.unit), total: thousands(p.total, p.unit) } : {})
	});
	// Each airfield's altitude and wind, worded the same way.
	const placeText = (place: Place) => {
		const at = place === 'landing' ? landingConditions(r) : r, choice = windChoiceAt(calc, place);
		const altitude = altitudeText(at), wind = windText(at.wind, isVariableWind(calc, place)), used = windChoiceText(at, choice);
		return {
			pressureAltitude: altitude?.pressure ?? 'Not available',
			densityAltitude: altitude?.density ?? 'Not available',
			wind: `${wind ? `${wind.headline}. ${wind.detail}` : 'Not available'}${choice === 'entered' ? '' : `. Distances use: ${used}`}`,
			used
		};
	};
	const departure = placeText('departure');
	const runwayOf = (place: Place) => {
		const h = runwayHeading(calc.values[keyAt(place, 'rwy')]);
		return h === null ? null : String(h / 10).padStart(2, '0');
	};
	// The wind the distances use and the pilot's choice are in the results band, not repeated here.
	const placeRows = (place: Place) => [...['elev', 'rwy', 'qnh', 'oat'].map((k) => shown(keyAt(place, k))), windRow(place)];
	const landingRows = calc.landingElsewhere ? placeRows('landing') : null;
	const data: ReportData = {
		id: meta.id,
		createdUtc: utcText(meta.now),
		preRelease: meta.preRelease,
		fictional: a.fictional === true,
		aircraft: { registration: a.registration, type: a.type, revision: a.revision, configuration: config.label },
		pilot: calc.values.name.trim(),
		departure: calc.values.place.trim(),
		runway: runwayOf('departure'),
		results: {
			takeoff: distance('Takeoff', r.takeoff, r.massBalance.takeoff.mass),
			landing: distance('Landing', r.landing, r.massBalance.landing.mass),
			pressureAltitude: departure.pressureAltitude,
			densityAltitude: departure.densityAltitude,
			wind: departure.wind,
			windShort: windShort('departure')
		},
		landing: calc.landingElsewhere ? (({ used: _, ...at }) => ({
			airfield: calc.values['land:place'].trim(), runway: runwayOf('landing'), ...at, windShort: windShort('landing'), rawMetar: weatherAt(calc, 'landing')?.raw ?? null
		}))(placeText('landing')) : null,
		// The takeoff and landing conditions are in the results band, and the fuel with the mass and balance.
		conditions: placeRows('departure').map((row, i) => (landingRows ? { ...row, landing: { value: landingRows[i].value, source: landingRows[i].source } } : row)),
		rawMetar: calc.weather?.raw ?? null,
		massBalance: {
			...(({ rows, takeoff, landing }) => ({
				rows: rows.map(({ id, ...row }) => {
					const tank = a.tanks.find((t) => id === `tank:${t.id}`);
					return tank ? { ...row, fuel: sourced(`fuel:${tank.id}`) } : row;
				}),
				takeoff, landing
			}))(massBalanceRows(a, r)),
			time: sourced('time'),
			flow: sourced('flow'),
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
const HIT = '#FCF0D2', HIT_INK = '#6B4400', MARK = '#EAF2FA', MARK_INK = '#134574', RESULT = '#1D5C96', HEAD = '#F3F5F7';
const INK = '#13202D', INK2 = '#3E4C59', MUTED = '#5A6876', LINE = '#E1E6EB', DIVIDER = '#C6CFD8', TOTAL = '#B5C0CA', RED = '#A12222', GOOD = '#1B6B44', AMBER = '#7A4D00';
/** IBM Plex, as on screen. The complete fonts cover every European Latin letter a name may use. */
export const SANS = 'PlexSans', MONO = 'PlexMono';
const small = 7.5;
/** The abbreviations the Report uses, defined once at the foot of every page, as EFB summaries do. */
export const ABBREVIATIONS = 'DA/PA density/pressure altitude · HW/TW head/tailwind · XW crosswind · VRB variable, applied as TW at full speed';
const num = (text: string, extra: Record<string, unknown> = {}) => ({ text, font: MONO, ...extra });
const heading = (text: string) => ({
	table: { widths: ['*'], body: [[{ text, bold: true, fontSize: 9.5, color: INK }]] },
	layout: { hLineWidth: (i: number) => (i === 1 ? 1.2 : 0), vLineWidth: () => 0, hLineColor: () => INK, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 2 },
	margin: [0, 0, 0, 3]
});
const rows = { hLineWidth: (i: number) => (i === 0 ? 0 : 0.75), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 2, paddingBottom: () => 2, paddingLeft: () => 3.5, paddingRight: () => 3.5 };
const th = (text: string, alignment = 'left') => ({ text, bold: true, color: MUTED, fontSize: 7.5, alignment });
const sup = (mark: string) => (mark ? [{ text: mark, sup: true, font: SANS, bold: false, color: MUTED }] : []);

/**
 * Sources as marks instead of a line under every value, as EFB load summaries state them once.
 * "Entered by pilot" is unmarked. Airfield list and METAR sources differ per airfield, so each airfield
 * has its own legend; a choice by the pilot and the aircraft data are the same everywhere.
 */
function sourceMarks() {
	const KINDS: [RegExp, string][] = [[/^Chosen by pilot$/, 'P'], [/^From aircraft data$/, 'D'], [/^From airfield list /, 'A'], [/^From METAR /, 'M']];
	const scopes = new Map<string, Map<string, string>>();
	return {
		mark(scope: string, source: string): string {
			const text = source.replace(/, confirmed$/, '');
			if (text === 'Entered by pilot') return '';
			const kind = KINDS.find(([re]) => re.test(text))?.[1] ?? 'S';
			const at = kind === 'P' || kind === 'D' ? '' : scope;
			if (!scopes.has(at)) scopes.set(at, new Map());
			const known = scopes.get(at)!;
			if (!known.has(text)) {
				const n = [...known.values()].filter((m) => m[0] === kind).length;
				known.set(text, n ? `${kind}${n + 1}` : kind);
			}
			return known.get(text)!;
		},
		/** One line per airfield, then the marks that mean the same everywhere. */
		legend(order: string[]) {
			const describe = (t: string) => { const s = t.replace(/^From /, ''); return s[1] === s[1]?.toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s; };
			const line = (scope: string, extra: string[] = []) => {
				const marks = [...(scopes.get(scope) ?? [])].map(([text, m]) => [{ text: m, sup: true }, ` ${describe(text)}`]);
				const parts = [...marks, ...extra.map((e) => [e])];
				return parts.length ? { text: [...(scope ? [{ text: `${scope}: `, bold: true }] : []), ...parts.flatMap((p, i) => (i ? [' · ', ...p] : p))], fontSize: 7, color: INK2, margin: [0, 1, 0, 0] } : null;
			};
			return [...order.filter((s) => s).map((s) => line(s)), line('', ['unmarked: entered by pilot'])].filter(Boolean);
		}
	};
}

/** "Takeoff", the condition, ground roll and distance over or from 50 ft, and the mass. */
function distanceCell(d: ReportDistance, totalLabel: string) {
	const title = { text: d.title, bold: true, fontSize: 9.5 };
	const condition = d.condition ? [{ text: [d.condition, ...sup('P')], fontSize: small, color: INK2 }] : [];
	if (d.status !== 'ok') return { stack: [title, ...condition, { text: d.headline, bold: true, fontSize: 10, color: AMBER, margin: [0, 4, 0, 0] }] };
	// The unit is smaller, so a four-digit distance still fits on one line.
	const big = (v: string) => {
		const at = v.lastIndexOf(' ');
		return at < 0 ? num(v, { fontSize: 15, bold: true }) : { text: [{ text: v.slice(0, at), fontSize: 15, bold: true }, { text: v.slice(at), fontSize: 8.5, color: INK2 }], font: MONO, noWrap: true };
	};
	const value = (label: string, v: string | null | undefined) => ({ stack: [{ text: label, fontSize: small, color: INK2 }, big(v ?? '–')] });
	const pair = d.groundRoll !== undefined
		? { columns: [value('Ground roll', d.groundRoll), value(totalLabel, d.total)], columnGap: 6, margin: [0, 3, 0, 0] }
		: { ...big(d.headline), margin: [0, 3, 0, 0] };
	return { stack: [
		title, ...condition, pair,
		...(d.mass ? [{ text: [{ text: 'at ' }, { text: d.mass, font: MONO }], fontSize: small, color: INK2, margin: [0, 1, 0, 0] }] : []),
		...d.warnings.map((w) => ({ text: w, fontSize: small, bold: true, color: AMBER, margin: [0, 2, 0, 0] }))
	] };
}

type BandPlace = { pressureAltitude: string; densityAltitude: string; wind: string; windShort?: ReportWind };
/** Altitude and wind for one or both airfields, a value per column. */
function atmosphereCell(dep: BandPlace, land: BandPlace | null) {
	const places = land ? [dep, land] : [dep];
	const reported = (p: BandPlace) => p.windShort?.reported ?? p.wind.split('. ')[0];
	const used = (p: BandPlace) => (p.windShort?.used ? { stack: [num(p.windShort.used, { bold: true, fontSize: 8 }), ...(p.windShort.choice ? [{ text: [p.windShort.choice, ...sup('P')], fontSize: 6.5, color: INK2 }] : [])] } : { text: p.windShort ? 'Not available' : p.wind.split('. ').slice(1).join('. '), fontSize: 6.5, color: INK2 });
	const row = (label: string, cell: (p: BandPlace) => unknown) => [{ text: label, color: INK2, fontSize: small }, ...places.map(cell)];
	return { stack: [
		{ table: { widths: [land ? 26 : 30, ...places.map(() => '*')], body: [
			...(land ? [['', th('Departure'), th('Landing')]] : []),
			row('DA', (p) => num(p.densityAltitude, { bold: true, fontSize: 10.5 })),
			row('PA', (p) => num(p.pressureAltitude)),
			row('Wind', (p) => num(reported(p))),
			row('Used', used)
		] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 4, paddingTop: () => 1, paddingBottom: () => 1 } }
	] };
}

/** A lookup's table as printed, with the values used shaded and a crosshair where the result falls, as on screen. */
function lookupTable(t: ReportLookup) {
	const cell = { fontSize: 7, alignment: 'right' };
	const grid = (g: LookupView['grids'][number]) => ({ stack: [
		...(g.title ? [{ text: g.title, bold: true, fontSize: 7.5, margin: [0, 0, 0, 2] }] : []),
		{ table: { headerRows: 1, dontBreakRows: true, body: [
			[{ text: g.rowAxis ? `${g.rowAxis} ↓ ${g.colAxis} →` : `${g.colAxis} →`, fontSize: 6, color: MUTED, fillColor: HEAD }, ...g.colHeads.map((h) => num(h.text, { ...cell, bold: true, color: h.marker ? MARK_INK : INK, fillColor: h.marker ? MARK : HEAD }))],
			...g.rows.map((row) => [
				num(row.head.text, { ...cell, bold: true, color: row.head.marker ? MARK_INK : INK, fillColor: row.head.marker ? MARK : HEAD }),
				...row.cells.map((c) => num(c.text, { ...cell, bold: c.hit || c.result, color: c.result ? '#FFFFFF' : c.hit ? HIT_INK : INK, fillColor: c.result ? RESULT : c.hit ? HIT : c.marker ? MARK : undefined }))
			])
		] }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => DIVIDER, vLineColor: () => DIVIDER, paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 1.5, paddingBottom: () => 1.5 } },
		...[...g.colHeads, ...g.rows.map((r) => r.head)].filter((h) => h.note).map((h) => ({ text: h.note, fontSize: 6.5, color: MUTED, margin: [0, 2, 0, 0] }))
	] });
	return { stack: [
		{ text: [t.caption, '. ', { text: ' Amber ', color: HIT_INK, background: HIT, bold: true }, ': printed values used. ', { text: ' Blue ', color: MARK_INK, background: MARK, bold: true }, ': your conditions, before corrections.'], fontSize: 7, color: INK2, margin: [0, 0, 0, 3] },
		{ columns: t.view.grids.map((g) => ({ width: 'auto', ...grid(g) })), columnGap: 12 },
		...(t.view.between ? [{ text: t.view.between, bold: true, fontSize: 7.5, margin: [0, 3, 0, 0] }] : [])
	], margin: [0, 0, 0, 8], unbreakable: true };
}

/** The one standard Report layout. Returns a pdfmake document definition. */
export function reportDocument(data: ReportData) {
	// pdfmake changes what it is given, so it must never receive the permanent record itself.
	const d = JSON.parse(JSON.stringify(data)) as ReportData;
	const m = d.massBalance;
	const L = d.landing;
	const marks = sourceMarks();
	// The band marks the conditions and wind choices as chosen by the pilot, so that mark leads the legend.
	marks.mark('', 'Chosen by pilot');
	const [DEP, LAND] = ['Departure', 'Landing'];
	const place = (airfield: string, runway: string | null | undefined) => `${airfield}${runway ? ` RWY ${runway}` : ''}`;
	const warning = [d.preRelease && 'PRE-RELEASE, NOT FOR FLIGHT', d.fictional && 'FICTIONAL AIRCRAFT WITH INVENTED DATA'].filter(Boolean).join(' · ');

	// A value, then its source's mark in a narrow column of its own, so the numbers stay aligned.
	const valueCells = (v: { value: string; source: string } | undefined, scope: string) =>
		v ? [num(v.value, { alignment: 'right', fontSize: 8.5 }), { text: marks.mark(scope, v.source), fontSize: 6.5, color: MUTED }] : ['', ''];
	const conditions = { table: L
		? { widths: [52, '*', 9, '*', 9], headerRows: 1, body: [
			['', th(DEP, 'right'), '', th(LAND, 'right'), ''],
			...d.conditions.map((c) => [c.label, ...valueCells(c, DEP), ...valueCells(c.landing, LAND)])
		] }
		: { widths: [60, '*', 9], body: d.conditions.map((c) => [c.label, ...valueCells(c, '')]) },
	layout: { ...rows, paddingLeft: (i: number) => (i > 0 && (L ? i % 2 === 0 : i === 2) ? 1 : 3.5), paddingRight: (i: number) => (i > 0 && (L ? i % 2 === 1 : i === 1) ? 0 : 3.5) } };

	// Fuel on its tank's row and the burn in one line, as on loading forms.
	const mbLabel = (r: ReportData['massBalance']['rows'][number]) => (r.fuel ? { text: [r.label, ' ', { text: `(${r.fuel.value})`, font: MONO, color: INK2 }, ...sup(marks.mark('', r.fuel.source))] } : r.label);
	const burn = m.time && m.flow
		? { text: [
			{ text: 'Burn plan ', color: MUTED }, m.burnPlan, ' · ',
			{ text: m.time.value, font: MONO }, ...sup(marks.mark('', m.time.source)), ' × ',
			{ text: m.flow.value, font: MONO }, ...sup(marks.mark('', m.flow.source)), ' = ',
			{ text: m.burned, font: MONO, bold: true }
		] }
		: { text: `Burn plan: ${m.burnPlan}. Burned ${m.burned}.` };
	const massBalance = { table: { widths: ['*', 'auto', 'auto', 'auto'], headerRows: 1, body: [
		[th('Item'), th(m.units.mass, 'right'), th(m.units.arm, 'right'), th('Moment', 'right')],
		...m.rows.map((r) => [mbLabel(r), num(r.mass, { alignment: 'right' }), num(r.arm, { alignment: 'right' }), num(r.moment, { alignment: 'right' })]),
		...([['Takeoff', m.takeoff], ['Landing', m.landing]] as const).map(([label, t]) => [{ text: label, bold: true }, num(t.mass, { alignment: 'right', bold: true }), num(t.arm, { alignment: 'right', bold: true }), num(t.moment, { alignment: 'right', bold: true })])
	] }, layout: { ...rows, hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i >= node.table.body.length - 2 ? TOTAL : LINE) } };

	const metars = [[L ? `${DEP}: ` : '', d.rawMetar], [`${LAND}: `, L?.rawMetar ?? null]].filter(([, raw]) => raw);
	return {
		pageSize: 'A4', pageMargins: [30, 25, 30, 34],
		info: { title: `Performance report ${d.id}`, subject: `${d.aircraft.registration} ${d.departure}${L ? ` to ${L.airfield}` : ''}` },
		defaultStyle: { font: SANS, fontSize: 8.5, lineHeight: 1.12, color: INK },
		footer: (page: number, pages: number) => ({ columns: [
			{ text: ABBREVIATIONS, fontSize: 6.5, color: MUTED },
			{ width: 'auto', text: `${d.id} · Page ${page} of ${pages}`, font: MONO, fontSize: 6.5, color: MUTED }
		], columnGap: 12, margin: [30, 12, 30, 0] }),
		content: [
			...(warning ? [{
				table: { widths: ['*'], body: [[{ text: warning, bold: true, fontSize: 7.5, characterSpacing: 0.45, color: RED, alignment: 'center' }]] },
				layout: { hLineWidth: () => 1.1, vLineWidth: () => 1.1, hLineColor: () => RED, vLineColor: () => RED, paddingTop: () => 3, paddingBottom: () => 3 },
				margin: [0, 0, 0, 10]
			}] : []),
			{ columns: [
				{ width: '*', stack: [
					{ text: 'Performance report', bold: true, fontSize: 8, color: MUTED },
					{ text: [{ text: d.aircraft.registration, bold: true, fontSize: 16 }, { text: `  ${d.aircraft.type} · ${d.aircraft.configuration} · Data revision ${d.aircraft.revision}`, color: INK2 }], margin: [0, 1, 0, 0] },
					{ text: `${place(d.departure, d.runway)}${L ? ` → ${place(L.airfield, L.runway)}` : ''}`, fontSize: 11.5, margin: [0, 1, 0, 0] }
				] },
				{ width: 'auto', alignment: 'right', stack: [num(d.createdUtc, { bold: true, fontSize: 9.5, noWrap: true }), { text: `Pilot: ${d.pilot}`, color: INK2 }, num(d.id, { fontSize: 7, color: MUTED, noWrap: true })], margin: [0, 6, 0, 0] }
			], columnGap: 15, margin: [0, 0, 0, 8] },
			{
				table: { widths: ['*', '*', L ? 205 : 150], body: [[
					distanceCell(d.results.takeoff, 'Over 50 ft'),
					distanceCell(d.results.landing, 'From 50 ft'),
					atmosphereCell(d.results, L ?? null)
				]] },
				layout: {
					hLineWidth: () => 1.1, vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? 1.1 : 0.75),
					hLineColor: () => INK, vLineColor: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? INK : DIVIDER),
					paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6
				},
				margin: [0, 0, 0, 12]
			},
			// The left column has a fixed width. Two star columns would both grow to fit the widest value, and push mass and balance off the page.
			{ columns: [
				{ width: 250, stack: [
					heading('Conditions'), conditions,
					...marks.legend(L ? [DEP, LAND] : []),
					...metars.map(([label, raw]) => ({ text: [label!, { text: raw!, font: MONO }], fontSize: 6.5, color: INK2, margin: [0, 3, 0, 0] }))
				] },
				{ width: '*', stack: [heading('Mass and balance'), massBalance, { ...burn, fontSize: small, color: INK2, margin: [0, 3, 0, 4] }, { svg: d.chartSvg, fit: [255, 140] }] }
			], columnGap: 18, margin: [0, 0, 0, 10] },
			heading('Limits'),
			{ columns: chunk(d.limits, 2).map((part) => ({ table: { widths: [30, '*', 'auto'], body: part.map((l) => [
				{ text: l.status, bold: true, color: l.status === 'OK' ? GOOD : l.status === 'CHECK' ? AMBER : RED },
				l.label,
				num(l.detail, { alignment: 'right' })
			]) }, layout: rows })), columnGap: 18, margin: [0, 0, 0, 10] },
			// The working is supplemental, so it starts page 2 and page 1 stays the summary.
			...d.working.map((w, i) => ({ stack: [...(i === 0 ? [heading('Working')] : []), {
				table: { widths: ['*', 50, 50, 112], headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, body: [
					[th(w.title), th('Ground roll', 'right'), th('50 ft', 'right'), th('Source')],
					...w.rows.map((r, i) => {
						const last = i === w.rows.length - 1 && r.step.startsWith('Rounded');
						return [{ text: r.step, bold: last }, num(r.groundRoll, { alignment: 'right', bold: last }), num(r.total, { alignment: 'right', bold: last }), { text: r.source, color: MUTED, fontSize: 7.5 }];
					})
				] },
				layout: rows, margin: [0, 0, 0, 8]
			}, ...(w.tables ?? []).map(lookupTable)], ...(i === 0 ? { pageBreak: 'before' } : {}) })),
			{
				table: { widths: ['*'], body: [[{ stack: [
					...d.notes.map((n) => ({ columns: [{ width: 12, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" fill="none" stroke="#1B6B44" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', fit: [9, 9], margin: [0, 1.5, 0, 0] }, { text: `Manual note confirmed by the pilot: ${n}` }], margin: [0, 0, 0, 3] })),
					{ text: RESPONSIBILITY, bold: true, fontSize: 9, margin: [0, 2, 0, 3] },
					{ text: `Report ${d.id} · Tool ${d.footer.toolVersion} · ${d.footer.dataRelease} · Aircraft revision ${d.aircraft.revision} · Last data check ${d.footer.lastDataCheck}. The pilot's name is for traceability and is not a signature.`, fontSize: 7, color: MUTED }
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
