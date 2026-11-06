/** The calculation engine: pure functions from an aircraft file and inputs to results. */
import type { Aircraft, CalculationInput, HandCase } from '../aircraft/schema.ts';
import { atmosphere, type Atmosphere } from './atmosphere.ts';
import { configurationOf, massBalance, type MassBalance } from './mass-balance.ts';
import { runCondition, type PerformanceResult, type Wind } from './performance.ts';
import { convertLength } from './units.ts';

export type Calculation = {
	massBalance: MassBalance;
	atmosphere: Atmosphere | null;
	wind: Wind | null;
	takeoff: PerformanceResult;
	landing: PerformanceResult;
	exceeded: string[];
};

function noPerformance(label: string): PerformanceResult {
	return { status: 'noData', conditionLabel: label, unit: null, rawTotal: null, rawGroundRoll: null, total: null, groundRoll: null, steps: [], warnings: [], reason: "No data: pilot's judgement", missing: [], windApplied: false };
}

export function calculate(a: Aircraft, input: CalculationInput): Calculation {
	const mb = massBalance(a, input);
	const elevationM = input.elevation ? convertLength(input.elevation.value, input.elevation.unit, 'm') : null;
	const atm = elevationM !== null && input.qnh !== null ? atmosphere(elevationM, input.qnh, input.oat) : null;

	let wind: Wind | null = null;
	if (input.windDirection !== null && input.windSpeed !== null && input.runwayHeading !== null) {
		const angle = ((input.windDirection - input.runwayHeading) * Math.PI) / 180;
		wind = { headwind: input.windSpeed * Math.cos(angle), crosswind: Math.abs(input.windSpeed * Math.sin(angle)) };
	}

	const limits = [...mb.limits];
	if (a.crosswind && wind && wind.crosswind > a.crosswind.value + 1e-9) limits.push({ id: 'crosswind', label: 'Crosswind', status: 'warning', value: wind.crosswind, limit: a.crosswind.value });
	mb.limits = limits;

	const config = configurationOf(a, input.configuration);
	const run = (phase: 'takeoff' | 'landing', id: string, mass: number): PerformanceResult => {
		if (config.performance === 'none') return noPerformance(config.label);
		const conditions = (config.performance ?? a.performance)[phase];
		const condition = conditions.find((c) => c.id === id);
		if (!condition) throw new Error(`Unknown ${phase} condition: ${id}`);
		return runCondition(a, condition, { atm, oat: input.oat, elevationM, mass, massUnit: a.units.mass, wind });
	};

	return {
		massBalance: mb,
		atmosphere: atm,
		wind,
		takeoff: run('takeoff', input.takeoffCondition, mb.takeoff.mass),
		landing: run('landing', input.landingCondition, mb.landing.mass),
		exceeded: mb.limits.filter((l) => l.status === 'exceeded').map((l) => l.id)
	};
}

export type CaseFailure = { caseId: string; field: string; expected: unknown; actual: unknown };

/** Runs an aircraft file's hand-calculated cases and compares displayed values exactly. */
export function runHandCases(a: Aircraft): CaseFailure[] {
	const failures: CaseFailure[] = [];
	const massText = (x: number) => x.toFixed(a.display.massDecimals), armText = (x: number) => x.toFixed(a.display.armDecimals);
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
		compare('exceeded', [...e.exceeded].sort().join(','), [...r.exceeded].sort().join(','));
	});
	return failures;
}
