/** Runs a condition's ordered Performance Steps. All behaviour comes from the aircraft file. */
import type { Aircraft, Axis, Condition, Table, WindRule } from '../aircraft/schema.ts';
import { convertLength, convertMass, convertTemperature } from './units.ts';
import { EPSILON, bracket, interpolate, surroundingCells, type Bracket } from './interpolate.ts';
import type { Atmosphere } from './atmosphere.ts';
import { OPERATOR_SOURCE, type OperatorRules } from '../aircraft/operator-rules.ts';

export type Wind = { headwind: number; crosswind: number };
/** Where a lookup read its table: the input on each axis, in the axis unit, and where it fell. */
export type LookupTrace = { table: string; at: number[]; brackets: Bracket[]; extended?: Extension };
/** A lookup above the table's top altitude, carried on by an Operator Rule. `axis` is the axis index. */
export type Extension = { axis: number; aboveBy: number; density: number; rule: number; factor: number };
export type StepTrace = { type: string; detail: string; total: number | null; groundRoll: number | null; cells?: number[]; lookup?: LookupTrace; source?: string };
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
export type Context = { atm: Atmosphere | null; oat: number | null; elevationM: number | null; mass: number; massUnit: string; wind: Wind | null; phase?: 'takeoff' | 'landing' };

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

const ALTITUDE_INPUTS = new Set(['pressureAltitude', 'densityAltitude', 'elevation']);

/** Air density relative to sea level at an altitude, ISA. A pressure altitude row keeps its temperature, so density follows pressure. */
function densityRatio(input: string, altitudeFt: number): number {
	return input === 'densityAltitude' ? Math.pow(1 - altitudeFt / 145442.16, 1 / 0.234969) : Math.pow(1 - altitudeFt / 145366.45, 1 / 0.190284);
}

/**
 * How much a value grows above the table's top altitude, by the Operator Rule: the larger of
 * - the table's own trend with air density, D = D_top × (σ_top / σ)^n, with n from the top two rows, and
 * - the operator's percentage per 1000 ft (UK CAA SSL 09: 10% takeoff, 5% landing).
 */
export function extensionFactor(input: string, belowFt: number, topFt: number, atFt: number, belowValue: number, topValue: number, percentPer1000ft: number) {
	const sBelow = densityRatio(input, belowFt), sTop = densityRatio(input, topFt), s = densityRatio(input, atFt);
	const n = belowValue > 0 && topValue > belowValue ? Math.log(topValue / belowValue) / Math.log(sBelow / sTop) : 0;
	const density = Math.pow(sTop / s, n);
	const rule = Math.pow(1 + percentPer1000ft / 100, (atFt - topFt) / 1000);
	return { n, density, rule, factor: Math.max(density, rule) };
}

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
	const aboveRule = a.operatorRules?.aboveTable;
	/** False when the wind is beyond the correction, after recording why. */
	const applyWind = (headRule: WindRule | undefined, tailRule: WindRule | undefined, applies: string[], source: string, limit: string): boolean => {
		const head = ctx.wind!.headwind;
		let factor: number | null = 1, detail = 'No wind correction';
		if (head > EPSILON && headRule) { factor = windFactor(headRule, head, -1, result.warnings); detail = `Headwind ${head.toFixed(1)} kt`; }
		else if (head > EPSILON && source === OPERATOR_SOURCE) detail = `Headwind ${head.toFixed(1)} kt: no credit`;
		else if (head < -EPSILON && tailRule) { factor = windFactor(tailRule, -head, 1, result.warnings); detail = `Tailwind ${(-head).toFixed(1)} kt`; }
		if (factor === null) { stop('noResult', `No result: wind ${Math.abs(head).toFixed(1)} kt is beyond ${limit}`); return false; }
		apply(applies, factor);
		result.windApplied = true;
		trace('wind', `${detail}: × ${factor.toFixed(4)}`, { source });
		return true;
	};

	for (const step of condition.steps) {
		if (step.type === 'lookup') {
			const table: Table = a.tables[step.table];
			const axes = table.axes as Axis[];
			const brackets: Bracket[] = [];
			const parts: string[] = [], at: number[] = [];
			let extendAxis: number | null = null;
			for (const [i, axis] of axes.entries()) {
				const x = inputFor(axis, ctx);
				if (x === null) return stop('needsInput', `Enter ${INPUT_NAMES[axis.input]}`, [INPUT_NAMES[axis.input]]);
				let b = bracket(axis, x);
				const last = axis.values.length - 1;
				// Above the top altitude, where the manual gives no result, an Operator Rule may carry the table on.
				if (!b && aboveRule && extendAxis === null && ALTITUDE_INPUTS.has(axis.input) && last >= 1 && x > axis.values[last]) {
					b = { low: last, high: last, fraction: 0, clamped: true, warn: false };
					extendAxis = i;
				}
				if (!b) return stop('noResult', `No result: ${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)} is outside the table (${axis.values[0]} to ${axis.values[last]} ${showUnit(axis.unit)})`);
				if (b.warn) result.warnings.push(`${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)} is outside the table: uses the nearest value`);
				parts.push(`${axis.name} ${x.toFixed(1)} ${showUnit(axis.unit)}`);
				brackets.push(b);
				at.push(x);
			}
			if (table.outputs.total) total = interpolate(table.outputs.total, brackets);
			if (table.outputs.groundRoll) groundRoll = interpolate(table.outputs.groundRoll, brackets);
			const cells = surroundingCells(table.outputs.total ?? table.outputs.groundRoll, brackets);
			let extended: Extension | undefined;
			if (extendAxis !== null && aboveRule) {
				const axis = axes[extendAxis], last = axis.values.length - 1, ft = (x: number) => convertLength(x, axis.unit, 'ft');
				const below = brackets.map((b, i) => (i === extendAxis ? { low: last - 1, high: last - 1, fraction: 0, clamped: false, warn: false } : b));
				const percent = ctx.phase === 'landing' ? aboveRule.landingPercentPer1000ft : aboveRule.takeoffPercentPer1000ft;
				const grow = (cellsOf: unknown, top: number) => extensionFactor(axis.input, ft(axis.values[last - 1]), ft(axis.values[last]), ft(at[extendAxis!]), interpolate(cellsOf, below), top, percent);
				const fTotal = table.outputs.total && total !== null ? grow(table.outputs.total, total) : null;
				const fRoll = table.outputs.groundRoll && groundRoll !== null ? grow(table.outputs.groundRoll, groundRoll) : null;
				const shown = (fTotal ?? fRoll)!;
				const aboveBy = at[extendAxis] - axis.values[last], aboveM = convertLength(aboveBy, axis.unit, 'm');
				extended = { axis: extendAxis, aboveBy, density: shown.density, rule: shown.rule, factor: shown.factor };
				trace('lookup', `Table at ${parts.join(', ')}`, { cells, lookup: { table: step.table, at, brackets, extended }, source: table.source });
				if (fTotal && total !== null) total *= fTotal.factor;
				if (fRoll && groundRoll !== null) groundRoll *= fRoll.factor;
				const u = showUnit(axis.unit);
				trace('extend', `Above the table by ${aboveBy.toFixed(0)} ${u}: × ${shown.factor.toFixed(4)}, the larger of the table's trend with air density (× ${shown.density.toFixed(4)}) and ${percent}% per 1000 ft (× ${shown.rule.toFixed(4)})`, { source: OPERATOR_SOURCE });
				result.warnings.push(`${axis.name} ${at[extendAxis].toFixed(0)} ${u} is above the table's ${axis.values[last]} ${u}: extended by the Operator rule`);
				if (aboveM > aboveRule.alertAboveM + EPSILON) result.warnings.push(`${Math.round(aboveM)} m above the table, more than ${aboveRule.alertAboveM} m: treat this distance with extra care`);
			} else {
				trace('lookup', `Table at ${parts.join(', ')}`, { cells, lookup: { table: step.table, at, brackets }, source: table.source });
			}
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
			if (!applyWind(step.headwind, step.tailwind, step.applies, step.source, "the manual's correction")) return result;
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

	// Where the manual gives no wind correction, the operator's applies to both distances.
	const ruleWind = a.operatorRules?.wind;
	if (ruleWind && !condition.steps.some((st) => st.type === 'wind')) {
		if (!ctx.wind) return stop('needsInput', 'Enter wind and runway heading', ['wind and runway heading']);
		const asRule = (r: { percent: number; perKnots: number; maxKnots?: number } | undefined): WindRule | undefined => r && { mode: 'proportional', percent: r.percent, perKnots: r.perKnots, ...(r.maxKnots !== undefined ? { maxKnots: r.maxKnots } : {}), above: 'none' };
		if (!applyWind(asRule(ruleWind.headwind), asRule(ruleWind.tailwind), ['total', 'groundRoll'], OPERATOR_SOURCE, "the operator's limit")) return result;
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

