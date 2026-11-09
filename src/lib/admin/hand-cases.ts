/**
 * Editing hand-calculated cases. Their results decide whether an aircraft can be published,
 * so the rules live here, tested, rather than in the admin screen.
 */
import type { Aircraft, CalculationInput, HandCase } from '../aircraft/schema.ts';
import { performanceOf } from '../app/calculation.ts';
import { calculate, runHandCases } from '../engine/index.ts';
import { stored } from './editing.ts';

type Phase = 'takeoff' | 'landing';

/** A starting input: the first Configuration, with that Configuration's own conditions. */
export function blankInput(a: Aircraft): CalculationInput {
	const configuration = a.configurations[0].id, perf = performanceOf(a, configuration);
	return {
		configuration, loads: {}, fuel: {}, burnPlan: a.defaultBurnPlan, flightTimeHours: 0, fuelFlow: a.fuelFlow?.value ?? 0,
		elevation: null, qnh: null, oat: null, windDirection: null, windSpeed: null, runwayHeading: null,
		takeoffCondition: perf?.takeoff[0]?.id ?? '', landingCondition: perf?.landing[0]?.id ?? ''
	};
}

export function newHandCase(a: Aircraft, author: string, now: number): HandCase {
	const n = a.handCases.length + 1;
	return { id: `case-${n}-${now.toString(36)}`, label: `Case ${n}`, author, date: new Date(now).toISOString().slice(0, 10), input: blankInput(a), expected: { exceeded: [] } };
}

/** Every limit a case can expect to be exceeded, named the way pilots see it. */
export function limitChoices(a: Pick<Aircraft, 'stations' | 'combinedLimits' | 'tanks'>): { id: string; label: string }[] {
	return [
		...a.stations.filter((s) => s.maxMass !== undefined).map((s) => ({ id: `station:${s.id}`, label: `${s.label}: maximum` })),
		...a.combinedLimits.map((l) => ({ id: `combined:${l.id}`, label: `${l.label}: combined maximum` })),
		...a.tanks.map((t) => ({ id: `tank:${t.id}`, label: `${t.label}: capacity` })),
		{ id: 'takeoffMass', label: 'Takeoff mass' }, { id: 'takeoffCg', label: 'Takeoff CG' },
		{ id: 'landingMass', label: 'Landing mass' }, { id: 'landingCg', label: 'Landing CG' },
		{ id: 'fuelBurn', label: 'Fuel for the flight' }
	];
}

export const EXPECTED_MASS_AND_CG = [
	{ key: 'takeoffMass', label: 'Takeoff mass', kind: 'mass' }, { key: 'takeoffArm', label: 'Takeoff CG', kind: 'arm' },
	{ key: 'landingMass', label: 'Landing mass', kind: 'mass' }, { key: 'landingArm', label: 'Landing CG', kind: 'arm' }
] as const;
export type ExpectedKey = (typeof EXPECTED_MASS_AND_CG)[number]['key'];

export const RESULT_CHOICES = [['', 'Not checked'], ['ok', 'A distance'], ['noData', 'No data'], ['noResult', 'No result'], ['needsInput', 'Needs input']] as const;

const number = (text: string) => {
	const n = Number(text.trim().replace(',', '.'));
	return text.trim() === '' || !Number.isFinite(n) ? null : n;
};

/** Typed in the manual's units, stored in the units pilots see. Empty or not a number clears it. */
export function setExpectedValue(a: Aircraft, c: HandCase, key: ExpectedKey, text: string) {
	const n = number(text), kind = EXPECTED_MASS_AND_CG.find((f) => f.key === key)!.kind;
	if (n === null) delete c.expected[key]; else c.expected[key] = stored(a, kind, n);
}

/** Choosing "Not checked" removes the whole expectation for that phase. */
export function setExpectedResult(c: HandCase, phase: Phase, field: 'status' | 'total' | 'groundRoll', text: string) {
	if (field === 'status') {
		if (!text) { delete c.expected[phase]; return; }
		c.expected[phase] = { ...(c.expected[phase] ?? {}), status: text as NonNullable<HandCase['expected'][Phase]>['status'] };
		return;
	}
	const r = { ...(c.expected[phase] ?? { status: 'ok' as const }) }, n = number(text);
	if (n === null) delete r[field]; else r[field] = n;
	c.expected[phase] = r;
}

export function setExceeded(c: HandCase, id: string, on: boolean) {
	c.expected.exceeded = on ? [...new Set([...c.expected.exceeded, id])] : c.expected.exceeded.filter((x) => x !== id);
}

export type CaseSummary = {
	caseId: string;
	label: string;
	phase: Phase | 'massBalance';
	/** "Takeoff, PA 1,240 ft, 12 °C, 3,105 lb" */
	situation: string;
	/** "9 kt head · Paved, dry" */
	detail: string;
	groundRoll: { paper: string; app: string };
	total: { paper: string; app: string };
	/** False when any check of this case fails, so a failing case is never shown as matching. */
	matches: boolean;
};

const STATUS_WORDS: Record<string, string> = { noData: 'No data', noResult: 'No result', needsInput: 'Needs input' };

/** One row per expected distance, and one for a case that only checks mass and CG: paper beside the app. */
export function caseSummaries(a: Aircraft): CaseSummary[] {
	const failures = runHandCases(a), n = (x: number) => x.toLocaleString('en');
	const rows: CaseSummary[] = [];
	for (const c of a.handCases) {
		const r = calculate(a, c.input), matches = !failures.some((f) => f.caseId === c.id);
		const pa = r.atmosphere ? `PA ${n(Math.round(r.atmosphere.pressureAltitudeFt))} ft` : 'no altitude';
		const oat = c.input.oat === null ? 'no OAT' : `${c.input.oat} °C`;
		const wind = !r.distanceWind ? 'No wind given' : Math.abs(r.distanceWind.headwind) < 0.5 ? 'Calm' : `${n(Math.round(Math.abs(r.distanceWind.headwind)))} kt ${r.distanceWind.headwind > 0 ? 'head' : 'tail'}`;
		const phases = (['takeoff', 'landing'] as const).filter((p) => c.expected[p]);
		for (const phase of phases) {
			const want = c.expected[phase]!, got = r[phase], mass = r.massBalance[phase].mass;
			const paper = (x: number | undefined) => (want.status !== 'ok' ? STATUS_WORDS[want.status] : x === undefined ? '–' : n(x));
			const app = (x: number | null) => (got.status !== 'ok' ? STATUS_WORDS[got.status] : x === null ? '–' : n(x));
			rows.push({
				caseId: c.id, label: c.label, phase,
				situation: `${phase === 'takeoff' ? 'Takeoff' : 'Landing'}, ${pa}, ${oat}, ${n(Math.round(mass))} ${a.units.mass}`,
				detail: `${wind} · ${got.conditionLabel}`,
				groundRoll: { paper: paper(want.groundRoll), app: app(got.groundRoll) },
				total: { paper: paper(want.total), app: app(got.total) },
				matches
			});
		}
		if (!phases.length) {
			const exceeded = c.expected.exceeded.length ? `Exceeds ${c.expected.exceeded.join(', ')}` : 'Within every limit';
			rows.push({
				caseId: c.id, label: c.label, phase: 'massBalance',
				situation: `Mass and balance, ${n(Math.round(r.massBalance.takeoff.mass))} ${a.units.mass} at takeoff`,
				detail: exceeded,
				groundRoll: { paper: '–', app: '–' }, total: { paper: '–', app: '–' },
				matches
			});
		}
	}
	return rows;
}

/** How many of the conditions pilots can pick have at least one case, per phase, and which don't. */
export function caseCoverage(a: Aircraft): Record<Phase, { covered: number; total: number; missing: string[] }> {
	const out = {} as Record<Phase, { covered: number; total: number; missing: string[] }>;
	for (const phase of ['takeoff', 'landing'] as const) {
		const conditions = new Map<string, string>();
		for (const config of a.configurations) performanceOf(a, config.id)?.[phase].forEach((c) => { if (c.kind === 'steps') conditions.set(c.id, c.label); });
		const used = new Set(a.handCases.filter((h) => h.expected[phase]).map((h) => (phase === 'takeoff' ? h.input.takeoffCondition : h.input.landingCondition)));
		const missing = [...conditions].filter(([id]) => !used.has(id)).map(([, label]) => label);
		out[phase] = { covered: conditions.size - missing.length, total: conditions.size, missing };
	}
	return out;
}
