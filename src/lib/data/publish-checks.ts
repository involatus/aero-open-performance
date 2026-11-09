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

export type CheckGroup = 'Aircraft data' | 'Mass and balance' | 'Performance and verification';
/** One named check. A blocked check waits for the file to be complete before it can run. */
export type Check = { id: string; group: CheckGroup; label: string; section: string; status: 'pass' | 'fail' | 'blocked'; problems: string[] };

/** Every named check, in the order they are listed. `section` is the admin section that fixes it. */
const CHECKS: Array<Omit<Check, 'status' | 'problems'>> = [
	{ id: 'identity', group: 'Aircraft data', label: 'Registration, type, revision and units set', section: 'Aircraft' },
	{ id: 'sources', group: 'Aircraft data', label: 'Every arm, limit and table names its manual page', section: 'Documents' },
	{ id: 'notes', group: 'Aircraft data', label: 'Manual notes complete', section: 'Notes' },
	{ id: 'weighing', group: 'Mass and balance', label: 'Weighing and configurations complete', section: 'Weighing' },
	{ id: 'stations', group: 'Mass and balance', label: 'Every station has an arm, and combined limits name real stations', section: 'Load' },
	{ id: 'fuel', group: 'Mass and balance', label: 'Every tank and burn plan complete', section: 'Fuel' },
	{ id: 'limits', group: 'Mass and balance', label: 'Mass limits and CG envelope complete', section: 'Limits' },
	{ id: 'tables', group: 'Performance and verification', label: 'Tables complete, with axes that rise', section: 'Tables' },
	{ id: 'conditions', group: 'Performance and verification', label: 'Every condition pilots can pick has its steps', section: 'Performance' },
	{ id: 'cases-match', group: 'Performance and verification', label: 'Hand-calculated cases all match', section: 'Test cases' },
	{ id: 'cases-cover', group: 'Performance and verification', label: 'Cases cover every condition, forward and aft CG, and an exceeded limit', section: 'Test cases' },
	{ id: 'tables-compared', group: 'Performance and verification', label: 'Every table compared with the manual', section: 'Compare tables' },
	{ id: 'unusual', group: 'Performance and verification', label: 'Unusual values checked against the manual', section: 'Check' }
];
/** Checks that need a complete, valid file before they can run. */
const NEEDS_VALID = new Set(['cases-match', 'cases-cover', 'tables-compared', 'unusual']);

/** Which check a problem from validating the file belongs to, from where it points in the file. */
function checkOfProblem(problem: string): string {
	const where = problem.split(':')[0];
	if (problem.includes('unknown source') || /^sources\b/.test(where)) return 'sources';
	const rules: Array<[RegExp, string]> = [
		[/^(stations|Station|combinedLimits|Limit )/, 'stations'],
		[/^(tanks|Tank|burnPlans|Burn plan|defaultBurnPlan|fuelFlow|Fuel flow)/, 'fuel'],
		[/^(envelope|Envelope|massLimits|Max |mac|MAC|crosswind|Crosswind)/, 'limits'],
		[/^(tables|Table )/, 'tables'],
		[/^Configuration \S+ weighing/, 'weighing'],
		[/^(performance|Performance|Configuration \S+ (takeoff|landing))/, 'conditions'],
		[/^configurations/, /^configurations\.\d+\.performance/.test(where) ? 'conditions' : 'weighing'],
		[/^(notes|Note )/, 'notes'],
		[/^handCases/, 'cases-match']
	];
	return rules.find(([re]) => re.test(where))?.[1] ?? 'identity';
}

/** All named checks, passing or not, so the admin can show what is done as well as what is left. */
export function checkList(data: unknown): CheckResult & { aircraft: Aircraft | null; checks: Check[] } {
	const found = new Map<string, string[]>();
	const add = (id: string, problem: string) => found.set(id, [...(found.get(id) ?? []), problem]);
	const v = validateAircraft(data);
	let unusual: string[] = [], problems: string[];
	if (!v.ok) {
		problems = v.problems;
		problems.forEach((p) => add(checkOfProblem(p), p));
	} else {
		const a = v.aircraft;
		try {
			runHandCases(a).forEach((f) => add('cases-match', `Case ${f.caseId}, ${f.field}: expected ${String(f.expected)}, got ${String(f.actual)}`));
			coverageProblems(a).forEach((p) => add('cases-cover', p));
			tableCheckProblems(a).forEach((p) => add('tables-compared', p));
		} catch (error) {
			add('cases-match', `Could not run the hand-calculated cases: ${(error as Error).message}`);
		}
		unusual = unusualValues(a);
		const acknowledged = new Set(a.acknowledgedUnusualValues ?? []);
		unusual.filter((u) => !acknowledged.has(u)).forEach((u) => add('unusual', `Unusual value not acknowledged: ${u}`));
		problems = ['cases-match', 'cases-cover', 'tables-compared', 'unusual'].flatMap((id) => found.get(id) ?? []);
	}
	const checks = CHECKS.map((c): Check => {
		const list = found.get(c.id) ?? [];
		return { ...c, problems: list, status: list.length ? 'fail' : !v.ok && NEEDS_VALID.has(c.id) ? 'blocked' : 'pass' };
	});
	return { problems, unusual, aircraft: v.ok ? v.aircraft : null, checks };
}

export function publishChecks(data: unknown): CheckResult & { aircraft: Aircraft | null } {
	const { problems, unusual, aircraft } = checkList(data);
	return { problems, unusual, aircraft };
}
