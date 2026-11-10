/**
 * What the pilot reads about a result, worded once. The screen and the Report both use this,
 * so they can't drift apart. Calculations stay in the engine; this only turns them into text.
 */
import type { Aircraft, WindForDistances } from '../aircraft/schema.ts';
import type { Calculation } from './calculation.ts';
import type { Calculation as Results } from '../engine/index.ts';
import type { Limit } from '../engine/mass-balance.ts';
import type { PerformanceResult, Wind } from '../engine/performance.ts';

export type DistanceText = { title: string; status: PerformanceResult['status']; headline: string; detail: string; warnings: string[] };
export type Tone = 'ok' | 'warnb' | 'fail';

/** "2026-11-08 09:02 UTC": times on Reports are always UTC, as in aviation. */
export const utcText = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export const massText = (a: Aircraft, x: number) => `${x.toFixed(a.display.massDecimals)} ${a.units.mass}`;
export const armText = (a: Aircraft, x: number) => `${x.toFixed(a.display.armDecimals)} ${a.units.arm}`;

/** The short word for a result without a distance, where there's only room for a word. */
export function statusWord(status: PerformanceResult['status']): string {
	return { ok: '', noData: 'No data', noResult: 'No result', needsInput: 'Needs inputs' }[status];
}

export function distanceText(title: string, r: PerformanceResult, mass: string): DistanceText {
	if (r.status !== 'ok') return { title, status: r.status, headline: r.reason ?? statusWord(r.status), detail: r.conditionLabel, warnings: [] };
	const hasTotal = r.total !== null;
	return {
		title, status: r.status,
		headline: `${hasTotal ? r.total : r.groundRoll} ${r.unit}`,
		detail: `${hasTotal ? `${r.groundRoll !== null ? `Ground roll ${r.groundRoll} ${r.unit}. ` : ''}Total distance.` : 'Ground roll only.'} ${r.conditionLabel}, ${mass}`,
		warnings: [...r.warnings]
	};
}

export function limitBadge(status: Limit['status']): { text: 'OK' | 'CHECK' | 'OVER'; tone: Tone } {
	return status === 'ok' ? { text: 'OK', tone: 'ok' } : status === 'warning' ? { text: 'CHECK', tone: 'warnb' } : { text: 'OVER', tone: 'fail' };
}

export function windText(wind: Wind | null, variable: boolean): { headline: string; detail: string } | null {
	if (!wind) return null;
	const kt = Math.abs(wind.headwind).toFixed(0);
	if (variable) return { headline: `${kt} kt tail`, detail: 'Variable wind, applied as a tailwind' };
	return { headline: `${kt} kt ${wind.headwind >= 0 ? 'head' : 'tail'}`, detail: `Crosswind ${wind.crosswind.toFixed(0)} kt` };
}

export const WIND_CHOICES: Record<WindForDistances, string> = { entered: 'As entered', none: 'No wind', tail3: 'Tailwind 3 kt' };
const CHOSEN_HEADWIND: Record<WindForDistances, number> = { entered: Infinity, none: 0, tail3: -3 };

/** True when the entered wind is already a stronger tailwind than the choice, so the entered wind is used. */
export function enteredWindKept(r: Pick<Results, 'wind'>, choice: WindForDistances): boolean {
	return choice !== 'entered' && !!r.wind && r.wind.headwind < CHOSEN_HEADWIND[choice] - 1e-9;
}

/** Which wind the distances use, in words, the same on screen and on the Report. */
export function windChoiceText(r: Pick<Results, 'wind' | 'distanceWind'>, choice: WindForDistances = 'entered'): string {
	const label = WIND_CHOICES[choice];
	return enteredWindKept(r, choice) ? `${label} chosen, but the entered tailwind is stronger, so it is used` : label;
}

/** The landing airfield's atmosphere and wind: its own when landing elsewhere, else the departure's. */
export function landingConditions(r: Results): Pick<Results, 'atmosphere' | 'wind' | 'distanceWind'> {
	return r.landingAt ?? r;
}

export function altitudeText(r: Pick<Results, 'atmosphere'>): { pressure: string; density: string } | null {
	const atm = r.atmosphere;
	if (!atm) return null;
	return { pressure: `${Math.round(atm.pressureAltitudeFt)} ft`, density: atm.densityAltitudeFt != null ? `${Math.round(atm.densityAltitudeFt)} ft` : 'Not available' };
}

export type WorkingRow = { step: string; total: string; groundRoll: string; source: string };

/** The steps behind a distance, each with its manual source, ending with the rounded result. */
export function workingRows(a: Aircraft, r: PerformanceResult): WorkingRow[] {
	const n = (x: number | null) => (x === null ? '–' : x.toFixed(1));
	const rows = r.steps.map((s, i) => ({ step: `${i + 1}. ${s.detail}${s.cells ? `. Table values ${s.cells.join(', ')}` : ''}`, total: n(s.total), groundRoll: n(s.groundRoll), source: sourceText(a, s.source) }));
	if (r.status === 'ok' && rows.length) rows.push({ step: `Rounded up, ${r.unit}`, total: r.total === null ? '–' : String(r.total), groundRoll: r.groundRoll === null ? '–' : String(r.groundRoll), source: '' });
	return rows;
}

export function sourceText(a: Aircraft, id: string | undefined): string {
	const s = id ? a.sources[id] : undefined;
	if (!s) return '';
	return [s.document, s.revision && `Rev. ${s.revision}`, s.page && `p. ${s.page}`].filter(Boolean).join(' ');
}

/** The mass and balance table: one row per item, then takeoff and landing, in display decimals. */
export function massBalanceRows(a: Aircraft, r: Results) {
	const mass = (x: number) => x.toFixed(a.display.massDecimals), arm = (x: number) => x.toFixed(a.display.armDecimals), moment = (x: number) => x.toFixed(2);
	const row = (x: { mass: number; arm: number; moment: number }) => ({ mass: mass(x.mass), arm: arm(x.arm), moment: moment(x.moment) });
	return { rows: r.massBalance.rows.map((x) => ({ id: x.id, label: x.label, ...row(x) })), takeoff: row(r.massBalance.takeoff), landing: row(r.massBalance.landing) };
}

/** Where a value came from, worded the same in the field and on the Report. */
export function valueSource(calc: Pick<Calculation, 'status' | 'sources' | 'changed'>, key: string): string {
	const status = calc.status[key], from = calc.sources[key];
	if (status === 'pre') return `From ${from}${calc.changed[key] ? `, was ${calc.changed[key]}` : ''}, not yet confirmed`;
	if (status === 'ok') return from === 'aircraft data' ? 'From aircraft data' : `From ${from}, confirmed`;
	return 'Entered by pilot';
}
