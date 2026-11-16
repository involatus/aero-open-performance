/** The calculation engine: pure functions from an aircraft file and inputs to results. */
import type { Aircraft, CalculationInput, HandCase, WindForDistances } from '../aircraft/schema.ts';
import { atmosphere, type Atmosphere } from './atmosphere.ts';
import { configurationOf, massBalance, type MassBalance } from './mass-balance.ts';
import { runCondition, type PerformanceResult } from './performance.ts';
import { convertLength, massArmFactors } from './units.ts';
import { windComponents, windForDistances, type Wind } from './wind.ts';
export { windForDistances } from './wind.ts';

export type Calculation = {
	massBalance: MassBalance;
	atmosphere: Atmosphere | null;
	/** The wind as entered: shown to the pilot and used for the crosswind check. */
	wind: Wind | null;
	/** The wind the distances use, after the pilot's choice. */
	distanceWind: Wind | null;
	/** The landing airfield's atmosphere and wind, when the pilot lands elsewhere. Null means at the departure airfield. */
	landingAt: PlaceConditions | null;
	takeoff: PerformanceResult;
	landing: PerformanceResult;
	exceeded: string[];
};

function noPerformance(label: string): PerformanceResult {
	return { status: 'noData', conditionLabel: label, unit: null, rawTotal: null, rawGroundRoll: null, total: null, groundRoll: null, steps: [], warnings: [], notes: [], reason: "No data: pilot's judgement", missing: [], windApplied: false };
}

/** What an airfield's conditions give the distances: its atmosphere, the entered wind and the wind the distances use. */
export type PlaceConditions = { atmosphere: Atmosphere | null; elevationM: number | null; oat: number | null; wind: Wind | null; distanceWind: Wind | null };
type PlaceInput = Pick<CalculationInput, 'elevation' | 'qnh' | 'oat' | 'windDirection' | 'windSpeed' | 'runwayHeading' | 'windForDistances'>;

function placeConditions(p: PlaceInput): PlaceConditions {
	const elevationM = p.elevation ? convertLength(p.elevation.value, p.elevation.unit, 'm') : null;
	const atm = elevationM !== null && p.qnh !== null ? atmosphere(elevationM, p.qnh, p.oat) : null;
	const wind = p.windDirection !== null && p.windSpeed !== null && p.runwayHeading !== null ? windComponents(p.windDirection, p.windSpeed, p.runwayHeading) : null;
	return { atmosphere: atm, elevationM, oat: p.oat, wind, distanceWind: windForDistances(wind, p.windForDistances) };
}

export function calculate(a: Aircraft, input: CalculationInput): Calculation {
	const mb = massBalance(a, input);
	const departure = placeConditions(input);
	const landingAt = input.landingAt ? placeConditions(input.landingAt) : null;
	const { atmosphere: atm, wind, distanceWind } = departure;

	// Each airfield's own runway and wind, so landing elsewhere is checked there.
	const limits = [...mb.limits];
	const crosswind = (id: string, label: string, w: Wind | null) => {
		if (a.crosswind && w && w.crosswind > a.crosswind.value + 1e-9) limits.push({ id, label, status: 'warning', value: w.crosswind, limit: a.crosswind.value });
	};
	crosswind('crosswind', landingAt ? 'Crosswind at departure' : 'Crosswind', wind);
	if (landingAt) crosswind('landingCrosswind', 'Crosswind at landing', landingAt.wind);
	mb.limits = limits;

	const config = configurationOf(a, input.configuration);
	const run = (phase: 'takeoff' | 'landing', id: string, mass: number): PerformanceResult => {
		if (config.performance === 'none') return noPerformance(config.label);
		const conditions = (config.performance ?? a.performance)[phase];
		const condition = conditions.find((c) => c.id === id);
		if (!condition) throw new Error(`Unknown ${phase} condition: ${id}`);
		const at = phase === 'landing' && landingAt ? landingAt : departure;
		return runCondition(a, condition, { atm: at.atmosphere, oat: at.oat, elevationM: at.elevationM, mass, massUnit: a.units.mass, wind: at.distanceWind, phase });
	};

	return {
		massBalance: mb,
		atmosphere: atm,
		wind,
		distanceWind,
		landingAt,
		takeoff: run('takeoff', input.takeoffCondition, mb.takeoff.mass),
		landing: run('landing', input.landingCondition, mb.landing.mass),
		exceeded: mb.limits.filter((l) => l.status === 'exceeded').map((l) => l.id)
	};
}

export type CaseFailure = { caseId: string; field: string; expected: unknown; actual: unknown };

/** Runs an aircraft file's hand-calculated cases and compares displayed values exactly. */
export function runHandCases(a: Aircraft): CaseFailure[] {
	const failures: CaseFailure[] = [];
	// In the manual's units when there are some, because that is how a person works the case out.
	// Converting back first gives the typed value exactly, then both sides are rounded the same way.
	const f = massArmFactors(a.units, a.manualUnits ?? a.units);
	const back = (x: number, k: number) => Number((x * k).toPrecision(10));
	const massText = (x: number) => back(x, f.mass).toFixed(a.display.massDecimals), armText = (x: number) => back(x, f.arm).toFixed(a.display.armDecimals);
	a.handCases.forEach((c: HandCase) => {
		const r = calculate(a, c.input), e = c.expected;
		const compare = (field: string, expected: unknown, actual: unknown) => {
			if (expected !== undefined && expected !== actual) failures.push({ caseId: c.id, field, expected, actual });
		};
		if (e.takeoffMass !== undefined) compare('takeoffMass', massText(e.takeoffMass), massText(r.massBalance.takeoff.mass));
		if (e.takeoffArm !== undefined) compare('takeoffArm', armText(e.takeoffArm), armText(r.massBalance.takeoff.arm));
		if (e.landingMass !== undefined) compare('landingMass', massText(e.landingMass), massText(r.massBalance.landing.mass));
		if (e.landingArm !== undefined) compare('landingArm', armText(e.landingArm), armText(r.massBalance.landing.arm));
		for (const phase of ['takeoff', 'landing'] as const) {
			const want = e[phase], got = r[phase];
			if (!want) continue;
			compare(`${phase}.status`, want.status, got.status);
			if (want.total !== undefined) compare(`${phase}.total`, want.total, got.total);
			if (want.groundRoll !== undefined) compare(`${phase}.groundRoll`, want.groundRoll, got.groundRoll);
		}
		// The final reserve comes from the operator's rules, not the manual, so hand cases leave it out.
		compare('exceeded', [...e.exceeded].sort().join(','), r.exceeded.filter((id) => id !== 'finalReserve').sort().join(','));
	});
	return failures;
}
