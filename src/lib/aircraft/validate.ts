/** Checks an aircraft file: its shape first, then everything a shape can't express. */
import * as v from 'valibot';
import { Aircraft, FORMAT_VERSION, type Axis, type Condition, type Table } from './schema.ts';

export type Validation = { ok: true; aircraft: Aircraft; problems: [] } | { ok: false; problems: string[] };

/** Refuses a newer MAJOR or MINOR: strict validation can't read fields it doesn't know. */
export function formatIsReadable(version: string, supported = FORMAT_VERSION): boolean {
	const parse = (s: string) => /^(\d+)\.(\d+)\.(\d+)$/.exec(s)?.slice(1, 3).map(Number);
	const file = parse(version), app = parse(supported);
	if (!file || !app) return false;
	return file[0] === app[0] && file[1] <= app[1];
}

function checkCells(cells: unknown, axes: Axis[], where: string, problems: string[]) {
	const [axis, ...rest] = axes;
	if (!Array.isArray(cells) || cells.length !== axis.values.length) {
		problems.push(`${where}: expected ${axis.values.length} values along "${axis.name}"`);
		return;
	}
	cells.forEach((cell, i) => {
		if (rest.length) checkCells(cell, rest, `${where}[${i}]`, problems);
		else if (typeof cell !== 'number') problems.push(`${where}[${i}]: expected a number`);
	});
}

function checkTable(id: string, table: Table, problems: string[]) {
	table.axes.forEach((axis) => {
		if (axis.values.some((value, i) => i > 0 && value <= axis.values[i - 1])) problems.push(`Table ${id}: axis "${axis.name}" must rise strictly`);
	});
	if (!table.outputs.total && !table.outputs.groundRoll) problems.push(`Table ${id}: needs at least one output`);
	for (const name of ['total', 'groundRoll'] as const) {
		const cells = table.outputs[name];
		if (cells) checkCells(cells, table.axes, `Table ${id} ${name}`, problems);
	}
}

/** The distances a chain has produced so far must exist before a step uses them. */
function checkCondition(a: Aircraft, c: Condition, where: string, problems: string[]) {
	if (c.kind === 'noData') return;
	const have = new Set<string>();
	const need = (names: string[], step: string) => names.forEach((n) => { if (!have.has(n)) problems.push(`${where}: ${step} uses ${n} before it exists`); });
	c.steps.forEach((step, i) => {
		const name = `step ${i + 1} (${step.type})`;
		if (step.type === 'lookup') {
			const table = a.tables[step.table];
			if (!table) problems.push(`${where}: ${name} refers to unknown table "${step.table}"`);
			else for (const out of ['total', 'groundRoll']) if (table.outputs[out as 'total']) have.add(out);
		} else if (step.type === 'fixed') {
			if (step.total === undefined && step.groundRoll === undefined) problems.push(`${where}: ${name} needs a value`);
			if (step.total !== undefined) have.add('total');
			if (step.groundRoll !== undefined) have.add('groundRoll');
		} else if (step.type === 'ratio') { need([step.from], name); have.add(step.into); }
		else if (step.type === 'surface') { need(step.carryToTotal ? ['groundRoll', 'total'] : ['groundRoll'], name); }
		else need(step.applies, name);
		if (step.type === 'wind' && !step.headwind && !step.tailwind) problems.push(`${where}: ${name} needs a headwind or tailwind rule`);
	});
	if (!have.size) problems.push(`${where}: produces no distance`);
}

export function validateAircraft(data: unknown): Validation {
	const parsed = v.safeParse(Aircraft, data);
	if (!parsed.success) return { ok: false, problems: parsed.issues.map((issue) => `${v.getDotPath(issue) ?? 'file'}: ${issue.message}`) };

	const a = parsed.output, problems: string[] = [];
	if (!formatIsReadable(a.formatVersion)) problems.push(`Format ${a.formatVersion} is newer than this app supports (${FORMAT_VERSION})`);

	const sourceRefs: Array<[string, string]> = [];
	const src = (where: string, id: string) => sourceRefs.push([where, id]);
	const stationIds = new Set(a.stations.map((s) => s.id)), tankIds = new Set(a.tanks.map((t) => t.id));
	for (const list of [a.stations, a.tanks, a.burnPlans, a.configurations, a.combinedLimits, a.notes, a.handCases] as Array<Array<{ id: string }>>) {
		const seen = new Set<string>();
		list.forEach((item) => { if (seen.has(item.id)) problems.push(`Duplicate id "${item.id}"`); seen.add(item.id); });
	}
	a.stations.forEach((s) => {
		src(`Station ${s.id}`, s.source);
		if ((s.arm === undefined) === (s.positions === undefined)) problems.push(`Station ${s.id}: needs either an arm or positions`);
		if (s.positions && !s.positions.some((p) => p.id === s.defaultPosition)) problems.push(`Station ${s.id}: defaultPosition must name one of its positions`);
	});
	a.tanks.forEach((t) => src(`Tank ${t.id}`, t.source));
	a.combinedLimits.forEach((l) => {
		src(`Limit ${l.id}`, l.source);
		l.stations.forEach((s) => { if (!stationIds.has(s)) problems.push(`Limit ${l.id}: unknown station "${s}"`); });
	});
	a.notes.forEach((n) => src(`Note ${n.id}`, n.source));
	a.burnPlans.forEach((p) => {
		if (p.type === 'sequence') {
			p.tanks.forEach((t) => { if (!tankIds.has(t)) problems.push(`Burn plan ${p.id}: unknown tank "${t}"`); });
			a.tanks.forEach((t) => { if (!p.tanks.includes(t.id)) problems.push(`Burn plan ${p.id}: must list tank "${t.id}"`); });
		}
	});
	if (!a.burnPlans.some((p) => p.id === a.defaultBurnPlan)) problems.push(`defaultBurnPlan "${a.defaultBurnPlan}" does not exist`);
	for (const [id, table] of Object.entries(a.tables)) { checkTable(id, table, problems); src(`Table ${id}`, table.source); }

	const envelopes = [a.envelope, ...a.configurations.flatMap((c) => (c.envelope ? [c.envelope] : []))];
	envelopes.forEach((e) => {
		src('Envelope', e.source);
		if (!a.mac && e.points.some((p) => 'percentMac' in p)) problems.push('Envelope uses percentMac, so the file needs mac data');
	});
	if (a.mac) src('MAC', a.mac.source);
	for (const limits of [a.massLimits, ...a.configurations.flatMap((c) => (c.massLimits ? [c.massLimits] : []))]) { src('Max takeoff', limits.maxTakeoff.source); src('Max landing', limits.maxLanding.source); }
	if (a.fuelFlow) src('Fuel flow', a.fuelFlow.source);
	if (a.crosswind) src('Crosswind', a.crosswind.source);

	const performances: Array<[string, typeof a.performance]> = [['Performance', a.performance]];
	a.configurations.forEach((c) => {
		src(`Configuration ${c.id} weighing`, c.weighing.source);
		if (c.performance && c.performance !== 'none') performances.push([`Configuration ${c.id}`, c.performance]);
	});
	performances.forEach(([where, performance]) => {
		for (const phase of ['takeoff', 'landing'] as const) {
			performance[phase].forEach((c) => {
				checkCondition(a, c, `${where} ${phase} ${c.id}`, problems);
				if (c.kind === 'steps') c.steps.forEach((s, i) => { if ('source' in s) src(`${where} ${phase} ${c.id} step ${i + 1}`, s.source); });
			});
		}
	});
	sourceRefs.forEach(([where, id]) => { if (!a.sources[id]) problems.push(`${where}: unknown source "${id}"`); });

	return problems.length ? { ok: false, problems } : { ok: true, aircraft: a, problems: [] };
}
