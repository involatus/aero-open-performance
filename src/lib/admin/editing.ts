/**
 * Rules for the admin editors, independent of any screen: units as printed in the manual,
 * typed numbers, generated short names and sources picked by document and page.
 */
import { KG_PER_LB } from '#lib/engine/units.ts';

export type Units = { mass: 'kg' | 'lb'; arm: 'm' | 'cm' | 'in'; volume: 'L' | 'USgal' };
export type Kind = 'mass' | 'arm' | 'volume' | 'density' | 'moment';
type WithUnits = { units: Units; manualUnits?: Units };

const L_PER_USGAL = 3.785411784;
const KG: Record<Units['mass'], number> = { kg: 1, lb: KG_PER_LB };
const METRES: Record<Units['arm'], number> = { m: 1, cm: 0.01, in: 0.0254 };
const LITRES: Record<Units['volume'], number> = { L: 1, USgal: L_PER_USGAL };

/** How many units in `to` one unit in `from` is. */
export function factor(kind: Kind, from: Units, to: Units): number {
	const mass = KG[from.mass] / KG[to.mass], arm = METRES[from.arm] / METRES[to.arm], volume = LITRES[from.volume] / LITRES[to.volume];
	return { mass, arm, volume, density: mass / volume, moment: mass * arm }[kind];
}

/** 12 significant digits removes floating-point noise such as 242.82399999999998, far below any printed precision. */
const tidy = (x: number) => Number(x.toPrecision(12));

/** The units values are typed in: the manual's, or the units pilots see when no manual units are set. */
export const entryUnits = (a: WithUnits): Units => a.manualUnits ?? a.units;

/** A stored value, in the units the admin types. */
export function shown(a: WithUnits, kind: Kind, stored: number): number {
	// Fewer digits than are stored, so what was typed comes back exactly instead of 60021.0390001.
	return Number((stored * factor(kind, a.units, entryUnits(a))).toPrecision(10));
}

/** A typed value, in the units stored for pilots. */
export function stored(a: WithUnits, kind: Kind, typed: number): number {
	return tidy(typed * factor(kind, entryUnits(a), a.units));
}

export function unitLabel(u: Units, kind: Kind): string {
	return { mass: u.mass, arm: u.arm, volume: u.volume, density: `${u.mass}/${u.volume}`, moment: `${u.mass}·${u.arm}` }[kind];
}

export type Parsed = { value: number | null; error: string | null };

/**
 * Reads what people type: "1.5", "1,5", "1'960" or "1 960". "1,960" is refused, because a
 * US manual means 1960 and a European reader means 1.96, and guessing wrong is dangerous.
 */
export function parseNumber(text: string): Parsed {
	const t = text.trim().replace(/['’  ]/g, '');
	if (t === '') return { value: null, error: null };
	if (/^-?[1-9]\d*,\d{3}$/.test(t)) return { value: null, error: `Write ${t.replace(',', '')} or ${t.replace(',', '.')}: a comma before three digits could mean either.` };
	if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) return { value: Number(t.replace(/,/g, '')), error: null };
	if (!/^-?\d*(?:[.,]\d+)?$/.test(t) || t === '-') return { value: null, error: 'Enter a number.' };
	return { value: Number(t.replace(',', '.')), error: null };
}

/** A readable short name from a label, unique among `taken`. Pilots never see it. */
export function makeId(label: string, taken: Iterable<string>, fallback = 'item'): string {
	const used = new Set(taken);
	const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
	let id = base, n = 2;
	while (used.has(id)) id = `${base}-${n++}`;
	return id;
}

export type Source = { document: string; revision?: string; page?: string; date?: string };
export type Sources = Record<string, Source>;

const sameDocument = (a: Source, b: Source) => a.document === b.document && (a.revision ?? '') === (b.revision ?? '') && (a.date ?? '') === (b.date ?? '');

/** The documents behind the sources, each once, with the id of its entry without a page where there is one. */
export function documents(sources: Sources): { id: string; source: Source }[] {
	const out: { id: string; source: Source }[] = [];
	for (const [id, s] of Object.entries(sources)) {
		const i = out.findIndex((d) => sameDocument(d.source, s));
		if (i === -1) out.push({ id, source: { document: s.document, ...(s.revision ? { revision: s.revision } : {}), ...(s.date ? { date: s.date } : {}) } });
		else if (!s.page && sources[out[i].id].page) out[i].id = id;
	}
	return out;
}

/** The source for a document and page, added if it doesn't exist yet. Returns its id. */
export function sourceFor(sources: Sources, document: Source, page: string): string {
	const p = page.trim();
	const found = Object.entries(sources).find(([, s]) => sameDocument(s, document) && (s.page ?? '') === p);
	if (found) return found[0];
	const id = makeId(`${document.document.split(/\s+/).slice(0, 3).join(' ')}${p ? ` p ${p}` : ''}`, Object.keys(sources), 'source');
	sources[id] = { ...document, ...(p ? { page: p } : {}) };
	return id;
}

/** Every source id used anywhere in the aircraft. */
export function usedSources(value: unknown, out = new Set<string>()): Set<string> {
	if (Array.isArray(value)) value.forEach((v) => usedSources(v, out));
	else if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			if (k === 'source' && typeof v === 'string') out.add(v);
			else if (k !== 'sources') usedSources(v, out);
		}
	}
	return out;
}

/** Removes page entries nothing uses any more. Documents themselves stay, so they can still be chosen. */
export function pruneSources(a: { sources: Sources }) {
	const used = usedSources(a);
	const keep = new Set(documents(a.sources).map((d) => d.id));
	for (const [id, s] of Object.entries(a.sources)) if (s.page && !used.has(id) && !keep.has(id)) delete a.sources[id];
}

/** Stored values by kind, so changing the units pilots see converts everything already entered. */
export function convertAircraft(a: any, to: Units) {
	const from: Units = a.units;
	const f = (kind: Kind) => (x: number) => tidy(x * factor(kind, from, to));
	const mass = f('mass'), arm = f('arm'), volume = f('volume'), density = f('density'), moment = f('moment');
	const each = <T>(list: T[] | undefined, fn: (x: T) => void) => list?.forEach(fn);
	const point = (p: any) => { p.mass = mass(p.mass); if (p.arm !== undefined) p.arm = arm(p.arm); };
	const limits = (l: any) => { if (!l) return; l.maxTakeoff.value = mass(l.maxTakeoff.value); l.maxLanding.value = mass(l.maxLanding.value); };
	each(a.stations, (s: any) => {
		if (s.arm !== undefined) s.arm = arm(s.arm);
		if (s.maxMass !== undefined) s.maxMass = mass(s.maxMass);
		each(s.positions, (p: any) => { p.arm = arm(p.arm); });
	});
	each(a.tanks, (t: any) => { t.arm = arm(t.arm); t.capacity = volume(t.capacity); t.density = density(t.density); });
	each(a.combinedLimits, (l: any) => { l.maxMass = mass(l.maxMass); });
	limits(a.massLimits);
	each(a.envelope?.points, point);
	if (a.mac) { a.mac.leadingEdgeArm = arm(a.mac.leadingEdgeArm); a.mac.length = arm(a.mac.length); }
	if (a.fuelFlow) a.fuelFlow.value = volume(a.fuelFlow.value);
	each(a.configurations, (c: any) => {
		c.weighing.mass = mass(c.weighing.mass); c.weighing.moment = moment(c.weighing.moment);
		limits(c.massLimits);
		each(c.envelope?.points, point);
	});
	const steps = (p: any) => p && p !== 'none' && [...p.takeoff, ...p.landing].forEach((c: any) => each(c.steps, (s: any) => { if (s.type === 'massCorrection') s.referenceMass = mass(s.referenceMass); }));
	steps(a.performance);
	each(a.configurations, (c: any) => steps(c.performance));
	each(a.handCases, (h: any) => {
		for (const l of Object.values(h.input.loads) as any[]) l.mass = mass(l.mass);
		for (const k of Object.keys(h.input.fuel)) h.input.fuel[k] = volume(h.input.fuel[k]);
		h.input.fuelFlow = volume(h.input.fuelFlow);
		for (const k of ['takeoffMass', 'landingMass'] as const) if (h.expected[k] !== undefined) h.expected[k] = mass(h.expected[k]);
		for (const k of ['takeoffArm', 'landingArm'] as const) if (h.expected[k] !== undefined) h.expected[k] = arm(h.expected[k]);
	});
	a.units = { ...to };
}


/** Moves an item up (-1) or down (+1) in place. */
export function move<T>(list: T[], index: number, by: -1 | 1) {
	const to = index + by;
	if (to < 0 || to >= list.length) return;
	[list[index], list[to]] = [list[to], list[index]];
}

/** The source new items start with: the document without a page, or the first source. */
export function defaultSource(a: { sources: Sources }): string {
	return documents(a.sources)[0]?.id ?? Object.keys(a.sources)[0] ?? '';
}
