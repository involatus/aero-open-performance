/** The checks every aircraft file must pass before it can be published. There is no override. */
import type { Aircraft, Axis, Condition, Performance, Table } from '../aircraft/schema.ts';
import { calculate, runHandCases } from '../engine/index.ts';
import { validateAircraft } from '../aircraft/validate.ts';
import { tableCheckProblems } from './table-check.ts';

export type CheckResult = { problems: string[]; unusual: string[] };

function performances(a: Aircraft): Array<[string, Performance]> {
	const out: Array<[string, Performance]> = [['Standard', a.performance]];
	a.configurations.forEach((c) => { if (c.performance && c.performance !== 'none') out.push([c.label, c.performance]); });
	return out;
}

/** Each selectable condition needs a case on a table value and one between values. */
export function coverageProblems(a: Aircraft): string[] {
	const problems: string[] = [];
	const usesLookup = (c: Condition) => c.kind === 'steps' && c.steps.some((s) => s.type === 'lookup');
	for (const [where, performance] of performances(a)) {
		for (const phase of ['takeoff', 'landing'] as const) {
			for (const condition of performance[phase]) {
				if (condition.kind === 'noData') continue;
				let onValue = 0, between = 0, any = 0;
				for (const hand of a.handCases) {
					const id = phase === 'takeoff' ? hand.input.takeoffCondition : hand.input.landingCondition;
					const want = hand.expected[phase];
					if (id !== condition.id || want?.status !== 'ok' || (want.total === undefined && want.groundRoll === undefined)) continue;
					const config = a.configurations.find((c) => c.id === hand.input.configuration);
					if (!config || (config.performance ?? a.performance) !== performance) continue;
					any++;
					const lookup = calculate(a, hand.input)[phase].steps.find((s) => s.type === 'lookup');
					if (lookup?.cells?.length === 1) onValue++; else if (lookup) between++;
				}
				const name = `${where}, ${phase}, ${condition.label}`;
				if (usesLookup(condition)) {
					if (!onValue) problems.push(`${name}: needs a hand-calculated case exactly on a table value`);
					if (!between) problems.push(`${name}: needs a hand-calculated case between table values`);
				} else if (!any) problems.push(`${name}: needs a hand-calculated case`);
			}
		}
	}
	if (a.handCases.filter((c) => c.expected.takeoffArm !== undefined).length < 2) problems.push('Needs at least two cases checking CG, one forward and one aft');
	if (!a.handCases.some((c) => c.expected.exceeded.length > 0)) problems.push('Needs a hand-calculated case that exceeds a limit');
	return problems;
}

const RISES = new Set(['pressureAltitude', 'densityAltitude', 'elevation', 'temperature', 'mass']);

/** Distances normally grow with altitude, temperature and mass. A manual can differ, so a person must look. */
export function unusualValues(a: Aircraft): string[] {
	const out: string[] = [];
	for (const [id, table] of Object.entries(a.tables) as Array<[string, Table]>) {
		for (const output of ['total', 'groundRoll'] as const) {
			const cells = table.outputs[output];
			if (!cells) continue;
			const walk = (node: unknown, depth: number, path: number[]) => {
				if (depth === table.axes.length) return;
				const row = node as unknown[], axis: Axis = table.axes[depth];
				if (depth === table.axes.length - 1 && RISES.has(axis.input)) {
					(row as number[]).forEach((value, i) => {
						if (i > 0 && value < (row as number[])[i - 1]) out.push(`${id} ${output} at ${describe(table, path)}: ${axis.name} ${axis.values[i]} ${axis.unit} gives ${value}, less than ${(row as number[])[i - 1]} at ${axis.values[i - 1]}`);
					});
				}
				row.forEach((child, i) => walk(child, depth + 1, [...path, i]));
			};
			walk(cells, 0, []);
			checkAcross(table, cells, output, id, out);
		}
	}
	return out;
}

function describe(table: Table, path: number[]) {
	return path.map((p, i) => `${table.axes[i].name} ${table.axes[i].values[p]}`).join(', ') || 'start';
}

/** Compares along every axis but the last, which the walk above covers. */
function checkAcross(table: Table, cells: unknown, output: string, id: string, out: string[]) {
	const at = (idx: number[]) => idx.reduce<unknown>((n, i) => (n as unknown[])[i], cells) as number;
	const loop = (depth: number, idx: number[]) => {
		if (depth === table.axes.length) {
			idx.forEach((value, axisIndex) => {
				const axis = table.axes[axisIndex];
				if (axisIndex === table.axes.length - 1 || value === 0 || !RISES.has(axis.input)) return;
				const prev = [...idx]; prev[axisIndex] = value - 1;
				if (at(idx) < at(prev)) out.push(`${id} ${output} at ${describe(table, idx.filter((_, i) => i !== axisIndex).length ? idx : [])}: gives ${at(idx)}, less than ${at(prev)} at ${axis.name} ${axis.values[value - 1]}`);
			});
			return;
		}
		table.axes[depth].values.forEach((_, i) => loop(depth + 1, [...idx, i]));
	};
	loop(0, []);
}

export function publishChecks(data: unknown): CheckResult & { aircraft: Aircraft | null } {
	const v = validateAircraft(data);
	if (!v.ok) return { problems: v.problems, unusual: [], aircraft: null };
	const a = v.aircraft, problems: string[] = [];
	try {
		runHandCases(a).forEach((f) => problems.push(`Case ${f.caseId}, ${f.field}: expected ${String(f.expected)}, got ${String(f.actual)}`));
		problems.push(...coverageProblems(a));
		problems.push(...tableCheckProblems(a));
	} catch (error) {
		problems.push(`Could not run the hand-calculated cases: ${(error as Error).message}`);
	}
	const unusual = unusualValues(a), acknowledged = new Set(a.acknowledgedUnusualValues ?? []);
	unusual.filter((u) => !acknowledged.has(u)).forEach((u) => problems.push(`Unusual value not acknowledged: ${u}`));
	return { problems, unusual, aircraft: a };
}
