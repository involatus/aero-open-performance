/**
 * Editing hand-calculated cases. Their results decide whether an aircraft can be published,
 * so the rules live here, tested, rather than in the admin screen.
 */
import type { Aircraft, CalculationInput, HandCase } from '../aircraft/schema.ts';
import { performanceOf } from '../app/calculation.ts';
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
