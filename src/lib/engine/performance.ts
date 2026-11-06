/** Runs a condition's ordered Performance Steps. All behaviour comes from the aircraft file. */
import type { Aircraft, Axis, Condition, Table, WindRule } from '../aircraft/schema.ts';
import { convertLength, convertMass, convertTemperature } from './units.ts';
import { EPSILON, bracket, interpolate, surroundingCells, type Bracket } from './interpolate.ts';
import type { Atmosphere } from './atmosphere.ts';

export type Wind = { headwind: number; crosswind: number };
export type StepTrace = { type: string; detail: string; total: number | null; groundRoll: number | null; cells?: number[]; source?: string };
export type PerformanceResult = {
	status: 'ok' | 'noData' | 'noResult' | 'needsInput';
	conditionLabel: string;
	unit: string | null;
	rawTotal: number | null;
	rawGroundRoll: number | null;
	total: number | null;
	groundRoll: number | null;
	steps: StepTrace[];
	warnings: string[];
	reason: string | null;
	missing: string[];
	windApplied: boolean;
};
export type Context = { atm: Atmosphere | null; oat: number | null; elevationM: number | null; mass: number; massUnit: string; wind: Wind | null };

/** Distances round up to the next whole unit, with a tolerance so floating-point noise can't add one. */
export function roundUp(x: number): number {
	return Math.ceil(x - EPSILON);
}

function inputFor(axis: { input: string; unit: string }, ctx: Context): number | null {
	switch (axis.input) {
		case 'pressureAltitude': return ctx.atm && convertLength(ctx.atm.pressureAltitudeFt, 'ft', axis.unit);
		case 'densityAltitude': return ctx.atm?.densityAltitudeFt == null ? null : convertLength(ctx.atm.densityAltitudeFt, 'ft', axis.unit);
		case 'elevation': return ctx.elevationM === null ? null : convertLength(ctx.elevationM, 'm', axis.unit);
		case 'temperature': return ctx.oat === null ? null : convertTemperature(ctx.oat, 'C', axis.unit);
		case 'mass': return convertMass(ctx.mass, ctx.massUnit, axis.unit);
		default: throw new Error(`Unknown axis input: ${axis.input}`);
	}
}
const OUTPUT_NAMES = { total: 'Total', groundRoll: 'Ground roll' };
const showUnit = (unit: string) => (unit === 'C' || unit === 'F' ? `°${unit}` : unit);
const INPUT_NAMES: Record<string, string> = { pressureAltitude: 'elevation and QNH', densityAltitude: 'elevation, QNH and OAT', elevation: 'elevation', temperature: 'OAT', mass: 'mass' };

/** Factor for one wind direction, or null when the manual gives no result at this wind. */
function windFactor(rule: WindRule, knots: number, sign: 1 | -1, warnings: string[]): number | null {
	let k = knots;
	if (rule.maxKnots !== undefined && k > rule.maxKnots + EPSILON) {
		if (rule.above === 'none') return null;
		if (rule.above === 'nearestWarn') warnings.push(`Wind above the manual's ${rule.maxKnots} kt: uses the ${rule.maxKnots} kt correction`);
		k = rule.maxKnots;
	}
	const units = rule.mode === 'stepped' ? Math.floor(k / rule.perKnots + EPSILON) : k / rule.perKnots;
	return 1 + (sign * rule.percent * units) / 100;
}

export function runCondition(a: Aircraft, condition: Condition, ctx: Context): PerformanceResult {
	const result: PerformanceResult = { status: 'ok', conditionLabel: condition.label, unit: null, rawTotal: null, rawGroundRoll: null, total: null, groundRoll: null, steps: [], warnings: [], reason: null, missing: [], windApplied: false };
	if (condition.kind === 'noData') { result.status = 'noData'; result.reason = "No data: pilot's judgement"; return result; }
	result.unit = condition.distanceUnit;

	let total: number | null = null, groundRoll: number | null = null;
	const stop = (status: 'noResult' | 'needsInput', reason: string, missing: string[] = []) => {
		result.status = status; result.reason = reason; result.missing = missing; return result;
	};
	const trace = (type: string, detail: string, extra: Partial<StepTrace> = {}) => result.steps.push({ type, detail, total, groundRoll, ...extra });
	const apply = (applies: string[], factor: number) => {
		if (applies.includes('total') && total !== null) total *= factor;
		if (applies.includes('groundRoll') && groundRoll !== null) groundRoll *= factor;
	};

	for (const step of condition.steps) {
		if (step.type === 'lookup') {
			const table: Table = a.tables[step.table];
			const brackets: Bracket[] = [];
			const parts: string[] = [];
			for (const axis of table.axes as Axis[]) {
				const x = inputFor(axis, ctx);
				if (x === null) return stop('needsInput', `Enter ${INPUT_NAMES[axis.input]}`, [INPUT_NAMES[axis.input]]);
				const b = bracket(axis, x);
				if (!b) return stop('noResult', `No result: ${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)} is outside the table (${axis.values[0]} to ${axis.values[axis.values.length - 1]} ${showUnit(axis.unit)})`);
				if (b.warn) result.warnings.push(`${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)} is outside the table: uses the nearest value`);
				parts.push(`${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)}`);
				brackets.push(b);
			}
			if (table.outputs.total) total = interpolate(table.outputs.total, brackets);
			if (table.outputs.groundRoll) groundRoll = interpolate(table.outputs.groundRoll, brackets);
			const cells = surroundingCells(table.outputs.total ?? table.outputs.groundRoll, brackets);
			trace('lookup', `Table at ${parts.join(', ')}`, { cells, source: table.source });
		} else if (step.type === 'fixed') {
			if (step.total !== undefined) total = step.total;
			if (step.groundRoll !== undefined) groundRoll = step.groundRoll;
			trace('fixed', 'Fixed value from the manual', { source: step.source });
		} else if (step.type === 'factor') {
			apply(step.applies, step.value);
			trace('factor', `× ${step.value}: ${step.reason}`, { source: step.source });
		} else if (step.type === 'massCorrection') {
			const factor = Math.pow(ctx.mass / step.referenceMass, step.exponent);
			apply(step.applies, factor);
			trace('massCorrection', `Mass correction (${ctx.mass.toFixed(1)} ÷ ${step.referenceMass})^${step.exponent} = ${factor.toFixed(4)}`, { source: step.source });
		} else if (step.type === 'wind') {
			if (!ctx.wind) return stop('needsInput', 'Enter wind and runway heading', ['wind and runway heading']);
			const head = ctx.wind.headwind;
			let factor: number | null = 1, detail = 'No wind correction';
			if (head > EPSILON && step.headwind) { factor = windFactor(step.headwind, head, -1, result.warnings); detail = `Headwind ${head.toFixed(1)} kt`; }
			else if (head < -EPSILON && step.tailwind) { factor = windFactor(step.tailwind, -head, 1, result.warnings); detail = `Tailwind ${(-head).toFixed(1)} kt`; }
			if (factor === null) return stop('noResult', `No result: wind ${Math.abs(head).toFixed(1)} kt is beyond the manual's correction`);
			apply(step.applies, factor);
			result.windApplied = true;
			trace('wind', `${detail}: × ${factor.toFixed(4)}`, { source: step.source });
		} else if (step.type === 'surface') {
			const added: number = (groundRoll as number) * (step.percent / 100);
			groundRoll = (groundRoll as number) + added;
			if (step.carryToTotal) total = (total as number) + added;
			trace('surface', `${step.percent}% of ground roll${step.carryToTotal ? ', carried into total' : ''}`, { source: step.source });
		} else if (step.type === 'ratio') {
			const from: number | null = step.from === 'total' ? total : groundRoll;
			const value: number = (from as number) * step.value;
			if (step.into === 'total') total = value; else groundRoll = value;
			trace('ratio', `${OUTPUT_NAMES[step.into]} is ${Math.round(step.value * 10000) / 100}% of ${OUTPUT_NAMES[step.from].toLowerCase()}`, { source: step.source });
		}
	}

	if (condition.assumes) {
		const differs = !condition.assumes.inputs.length || condition.assumes.inputs.some((i) => {
			const x = inputFor(i, ctx);
			return x === null || Math.abs(x - i.value) > EPSILON;
		});
		if (differs) result.warnings.push(`Manual value for ${condition.assumes.text}. Not corrected for your conditions.`);
	}
	if (!result.windApplied) result.warnings.push('Wind recorded. It did not change this distance.');

	result.rawTotal = total;
	result.rawGroundRoll = groundRoll;
	result.total = total === null ? null : roundUp(total);
	result.groundRoll = groundRoll === null ? null : roundUp(groundRoll);
	return result;
}

