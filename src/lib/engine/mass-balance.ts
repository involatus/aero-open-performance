/** Mass, moment, CG, fuel burn and limit checks. Everything stays in the aircraft's own units. */
import type { Aircraft, CalculationInput, Envelope } from '../aircraft/schema.ts';
import { EPSILON } from './interpolate.ts';

export type Row = { id: string; label: string; mass: number; arm: number; moment: number };
export type Limit = { id: string; label: string; status: 'ok' | 'exceeded' | 'warning'; value: number; limit?: number };
export type Point = { mass: number; moment: number; arm: number; percentMac: number | null };
export type MassBalance = {
	rows: Row[];
	takeoff: Point;
	landing: Point;
	burned: number;
	burnExceedsFuel: boolean;
	fuelAtLanding: Record<string, number>;
	limits: Limit[];
};

/** One line for showing a limit, with units. Used on screen and in Reports, so they always agree. */
export function limitText(a: Aircraft, limit: Limit): string {
	const arm = (x: number) => `${x.toFixed(a.display.armDecimals)} ${a.units.arm}`;
	if (limit.id === 'takeoffCg' || limit.id === 'landingCg') return arm(limit.value);
	if (limit.id === 'crosswind') return `${limit.value.toFixed(0)} kt, manual figure ${limit.limit} kt`;
	const unit = limit.id.startsWith('tank:') || limit.id === 'fuelBurn' ? a.units.volume : a.units.mass;
	// Only the text is rounded: limits converted from the manual's units, such as 889.0410452 kg, read as 889.0.
	return `${limit.value.toFixed(1)} ${unit}${limit.limit !== undefined ? `, max ${Number(limit.limit.toFixed(1))}` : ''}`;
}

export function configurationOf(a: Aircraft, id: string) {
	const c = a.configurations.find((x) => x.id === id);
	if (!c) throw new Error(`Unknown configuration: ${id}`);
	return c;
}

/** Fuel left per tank. "Even" shares the burn equally, passing on any share an emptied tank can't give. */
export function burnFuel(a: Aircraft, fuel: Record<string, number>, planId: string, burn: number) {
	const plan = a.burnPlans.find((p) => p.id === planId);
	if (!plan) throw new Error(`Unknown burn plan: ${planId}`);
	const left: Record<string, number> = {};
	a.tanks.forEach((t) => { left[t.id] = fuel[t.id] ?? 0; });
	let remaining = burn;
	if (plan.type === 'sequence') {
		for (const id of plan.tanks) {
			const take = Math.min(left[id], remaining);
			left[id] -= take;
			remaining -= take;
		}
	} else {
		let active = a.tanks.map((t) => t.id).filter((id) => left[id] > 0);
		while (remaining > EPSILON && active.length) {
			const share = remaining / active.length;
			for (const id of active) {
				const take = Math.min(left[id], share);
				left[id] -= take;
				remaining -= take;
			}
			active = active.filter((id) => left[id] > EPSILON);
		}
	}
	return { left, exceeds: remaining > EPSILON };
}

export function envelopeArm(a: Aircraft, p: Envelope['points'][number]): number {
	if ('arm' in p) return p.arm;
	return a.mac!.leadingEdgeArm + (p.percentMac / 100) * a.mac!.length;
}

function onSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
	const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
	if (Math.abs(cross) > EPSILON) return false;
	return px >= Math.min(ax, bx) - EPSILON && px <= Math.max(ax, bx) + EPSILON && py >= Math.min(ay, by) - EPSILON && py <= Math.max(ay, by) + EPSILON;
}

/** A point exactly on the edge counts as inside: a value on a limit passes. */
export function insideEnvelope(a: Aircraft, envelope: Envelope, mass: number, arm: number): boolean {
	const pts = envelope.points.map((p) => [envelopeArm(a, p), p.mass]);
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i], [xj, yj] = pts[j];
		if (onSegment(arm, mass, xi, yi, xj, yj)) return true;
		if (yi > mass !== yj > mass && arm < ((xj - xi) * (mass - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

export function massBalance(a: Aircraft, input: CalculationInput): MassBalance {
	const config = configurationOf(a, input.configuration);
	const limits = config.massLimits ?? a.massLimits, envelope = config.envelope ?? a.envelope;
	const rows: Row[] = [{ id: 'empty', label: 'Empty', mass: config.weighing.mass, arm: config.weighing.moment / config.weighing.mass, moment: config.weighing.moment }];
	const out: Limit[] = [];

	a.stations.forEach((s) => {
		const load = input.loads[s.id] ?? { mass: 0 };
		const positionId = load.position ?? s.defaultPosition;
		const position = s.positions?.find((p) => p.id === positionId);
		if (s.positions && !position) throw new Error(`Unknown position "${positionId}" at ${s.id}`);
		const arm = position ? position.arm : s.arm!;
		rows.push({ id: s.id, label: s.label, mass: load.mass, arm, moment: load.mass * arm });
		if (s.maxMass !== undefined) out.push({ id: `station:${s.id}`, label: s.label, status: load.mass <= s.maxMass + EPSILON ? 'ok' : 'exceeded', value: load.mass, limit: s.maxMass });
	});
	a.combinedLimits.forEach((l) => {
		const total = l.stations.reduce((sum, id) => sum + (input.loads[id]?.mass ?? 0), 0);
		out.push({ id: `combined:${l.id}`, label: l.label, status: total <= l.maxMass + EPSILON ? 'ok' : 'exceeded', value: total, limit: l.maxMass });
	});
	const dry = rows.reduce((sum, r) => ({ mass: sum.mass + r.mass, moment: sum.moment + r.moment }), { mass: 0, moment: 0 });

	let toMass = dry.mass, toMoment = dry.moment;
	a.tanks.forEach((t) => {
		const volume = input.fuel[t.id] ?? 0, mass = volume * t.density;
		rows.push({ id: `tank:${t.id}`, label: t.label, mass, arm: t.arm, moment: mass * t.arm });
		toMass += mass;
		toMoment += mass * t.arm;
		out.push({ id: `tank:${t.id}`, label: t.label, status: volume <= t.capacity + EPSILON ? 'ok' : 'exceeded', value: volume, limit: t.capacity });
	});

	const burned = input.flightTimeHours * input.fuelFlow;
	const burn = burnFuel(a, input.fuel, input.burnPlan, burned);
	let ldMass = dry.mass, ldMoment = dry.moment;
	a.tanks.forEach((t) => { const mass = burn.left[t.id] * t.density; ldMass += mass; ldMoment += mass * t.arm; });

	const point = (mass: number, moment: number): Point => {
		const arm = moment / mass;
		return { mass, moment, arm, percentMac: a.mac ? ((arm - a.mac.leadingEdgeArm) / a.mac.length) * 100 : null };
	};
	const takeoff = point(toMass, toMoment), landing = point(ldMass, ldMoment);

	out.push({ id: 'takeoffMass', label: 'Takeoff mass', status: toMass <= limits.maxTakeoff.value + EPSILON ? 'ok' : 'exceeded', value: toMass, limit: limits.maxTakeoff.value });
	out.push({ id: 'takeoffCg', label: 'Takeoff CG', status: insideEnvelope(a, envelope, toMass, takeoff.arm) ? 'ok' : 'exceeded', value: takeoff.arm });
	out.push({ id: 'landingMass', label: 'Landing mass', status: ldMass <= limits.maxLanding.value + EPSILON ? 'ok' : 'exceeded', value: ldMass, limit: limits.maxLanding.value });
	out.push({ id: 'landingCg', label: 'Landing CG', status: insideEnvelope(a, envelope, ldMass, landing.arm) ? 'ok' : 'exceeded', value: landing.arm });
	out.push({ id: 'fuelBurn', label: 'Fuel for the flight', status: burn.exceeds ? 'exceeded' : 'ok', value: burned });

	return { rows, takeoff, landing, burned, burnExceedsFuel: burn.exceeds, fuelAtLanding: burn.left, limits: out };
}
