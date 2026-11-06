/**
 * The pilot's Calculation, independent of any screen: its fields, inputs, to-do list and next flight.
 * Everything aircraft-specific comes from the aircraft file.
 */
import type { Aircraft, CalculationInput, Performance } from '../aircraft/schema.ts';
import type { Calculation as Results } from '../engine/index.ts';
import { parseMetar } from '../weather/metar.ts';
import type { WeatherReport } from '../weather/provider.ts';

export type FieldStatus = 'pre' | 'ok' | 'pilot';
export type Calculation = {
	id: string;
	created: number;
	aircraft: string;
	step: number;
	configuration: string;
	values: Record<string, string>;
	status: Record<string, FieldStatus>;
	sources: Record<string, string>;
	changed: Record<string, string>;
	positions: Record<string, string>;
	burnPlan: string;
	takeoffCondition: string;
	landingCondition: string;
	elevationUnit: 'm' | 'ft';
	notes: Record<string, boolean>;
	weather?: AppliedWeather | null;
	notice?: string | null;
};
export type AppliedWeather = { raw: string; station: string; stationName: string | null; distanceKm: number | null; observed: string | null; flags: string[] };
export type Field = {
	key: string;
	label: string;
	unit: string;
	decimals: boolean;
	negative: boolean;
	range: [number, number];
	quick: string[];
	capacity?: number;
	required: boolean;
};
export type ToDo = { key: string; label: string; step: number };

export const STEP_NAMES = ['Load', 'Fuel', 'Conditions', 'Send'];

export function parse(text: string | undefined): number | null {
	if (text === undefined || text.trim() === '' || text === '-') return null;
	const n = Number(text.replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}

export function performanceOf(a: Aircraft, configurationId: string): Performance | null {
	const config = a.configurations.find((c) => c.id === configurationId);
	if (!config || config.performance === 'none') return null;
	return config.performance ?? a.performance;
}

function massStep(unit: string) { return unit === 'lb' ? '10' : '5'; }

/** The numeric fields of each step, built from the aircraft file. */
export function fieldsFor(a: Aircraft, calc: Pick<Calculation, 'elevationUnit'>): Field[][] {
	const mass = a.units.mass, step = massStep(mass), maxMass = a.massLimits.maxTakeoff.value;
	const load: Field[] = a.stations.map((s) => ({
		key: `load:${s.id}`, label: s.label, unit: mass, decimals: true, negative: false,
		range: [0, s.maxMass ? s.maxMass * 3 : maxMass], quick: [`-${step}`, `+${step}`, 'None'], required: false
	}));
	const volume = a.units.volume, fuelStep = volume === 'USgal' ? '5' : '10';
	const fuel: Field[] = a.tanks.map((t) => ({
		key: `fuel:${t.id}`, label: t.label, unit: volume, decimals: true, negative: false,
		range: [0, t.capacity * 2], quick: [`-${fuelStep}`, `+${fuelStep}`, 'Full'], capacity: t.capacity, required: true
	}));
	fuel.push(
		{ key: 'time', label: 'Flight time to landing', unit: 'h', decimals: true, negative: false, range: [0, 24], quick: ['=0.5', '=1', '=1.5', '=2'], required: true },
		{ key: 'flow', label: 'Fuel flow', unit: `${volume}/h`, decimals: true, negative: false, range: [0, 500], quick: [], required: true }
	);
	const elevMax = calc.elevationUnit === 'm' ? 6000 : 20000;
	const conditions: Field[] = [
		{ key: 'elev', label: 'Elevation', unit: calc.elevationUnit, decimals: false, negative: true, range: [-500, elevMax], quick: [], required: true },
		{ key: 'hdg', label: 'Runway heading', unit: '°', decimals: false, negative: false, range: [0, 360], quick: [], required: true },
		{ key: 'qnh', label: 'QNH', unit: 'hPa', decimals: false, negative: false, range: [900, 1100], quick: [], required: true },
		{ key: 'oat', label: 'OAT', unit: '°C', decimals: true, negative: true, range: [-60, 60], quick: [], required: true },
		{ key: 'wdir', label: 'Wind from', unit: '°', decimals: false, negative: false, range: [0, 360], quick: [], required: true },
		{ key: 'wspd', label: 'Wind speed', unit: 'kt', decimals: false, negative: false, range: [0, 99], quick: [], required: true }
	];
	return [load, fuel, conditions, []];
}

export function newCalculation(a: Aircraft, id: string, now: number): Calculation {
	const positions: Record<string, string> = {};
	a.stations.forEach((s) => { if (s.defaultPosition) positions[s.id] = s.defaultPosition; });
	const configuration = a.configurations[0].id;
	const perf = performanceOf(a, configuration);
	const calc: Calculation = {
		id, created: now, aircraft: a.registration, step: 0, configuration, values: {}, status: {}, sources: {}, changed: {}, positions,
		burnPlan: a.defaultBurnPlan, takeoffCondition: perf?.takeoff[0].id ?? '', landingCondition: perf?.landing[0].id ?? '', elevationUnit: 'm', notes: {}
	};
	if (a.fuelFlow) prefill(calc, 'flow', String(a.fuelFlow.value), 'aircraft data');
	return calc;
}

/** A Prefilled Value waits for the pilot's confirmation. Anything the pilot typed is never replaced. */
export function prefill(calc: Calculation, key: string, value: string, source: string) {
	if (calc.status[key] === 'pilot') return;
	const old = calc.values[key];
	if (old !== undefined && old !== '' && old !== value) calc.changed[key] = old; else delete calc.changed[key];
	calc.values[key] = value;
	calc.status[key] = 'pre';
	calc.sources[key] = source;
}

export function setByPilot(calc: Calculation, key: string, value: string) {
	calc.values[key] = value;
	calc.status[key] = 'pilot';
	delete calc.changed[key];
}

export function confirmValue(calc: Calculation, key: string) {
	if (calc.status[key] === 'pre') { calc.status[key] = 'ok'; delete calc.changed[key]; }
}

export const WEATHER_KEYS = ['qnh', 'oat', 'wdir', 'wspd'];
export const OLD_REPORT_MINUTES = 60;
export const OLD_CALCULATION_DAYS = 7;

/**
 * Prefills only what the report clearly states. A value it doesn't state is left empty,
 * and anything the pilot typed is never touched.
 */
export function applyWeather(calc: Calculation, report: WeatherReport, now: number) {
	const m = parseMetar(report.raw, now);
	const values: Record<string, number | null> = { qnh: m.qnh, oat: m.oat, wdir: m.windDirection, wspd: m.windSpeed };
	const source = `METAR ${report.station}`;
	for (const key of WEATHER_KEYS) {
		const value = values[key];
		if (value !== null) prefill(calc, key, String(value), source);
		else if (calc.status[key] !== 'pilot') {
			delete calc.values[key]; delete calc.status[key]; delete calc.sources[key]; delete calc.changed[key];
		}
	}
	calc.values.station = report.station;
	calc.weather = { raw: report.raw, station: report.station, stationName: report.stationName, distanceKm: report.distanceKm, observed: m.observed, flags: m.flags };
}

export function confirmWeather(calc: Calculation) {
	WEATHER_KEYS.forEach((key) => confirmValue(calc, key));
}

export function reportAgeMinutes(weather: AppliedWeather | null | undefined, now: number): number | null {
	if (!weather?.observed) return null;
	return Math.max(0, Math.round((now - Date.parse(weather.observed)) / 60000));
}

export function isOldCalculation(calc: Calculation, now: number): boolean {
	return now - calc.created > OLD_CALCULATION_DAYS * 86400000;
}

/** After installing new data: confirmations no longer hold, and choices that no longer exist are reset. */
export function reconcileAfterInstall(a: Aircraft, calc: Calculation, release: number) {
	for (const key of Object.keys(calc.status)) if (calc.status[key] === 'ok') calc.status[key] = 'pre';
	calc.notes = {};
	if (!a.configurations.some((c) => c.id === calc.configuration)) calc.configuration = a.configurations[0].id;
	if (!a.burnPlans.some((p) => p.id === calc.burnPlan)) calc.burnPlan = a.defaultBurnPlan;
	a.stations.forEach((s) => {
		if (s.positions && !s.positions.some((p) => p.id === calc.positions[s.id])) calc.positions[s.id] = s.defaultPosition!;
	});
	const perf = performanceOf(a, calc.configuration);
	if (perf) {
		if (!perf.takeoff.some((c) => c.id === calc.takeoffCondition)) calc.takeoffCondition = perf.takeoff[0].id;
		if (!perf.landing.some((c) => c.id === calc.landingCondition)) calc.landingCondition = perf.landing[0].id;
	}
	calc.notice = `Recalculated with Release ${release}. Please check and confirm the values again.`;
}

export function changeConfiguration(a: Aircraft, calc: Calculation, id: string) {
	calc.configuration = id;
	const perf = performanceOf(a, id);
	if (!perf) return;
	if (!perf.takeoff.some((c) => c.id === calc.takeoffCondition)) calc.takeoffCondition = perf.takeoff[0].id;
	if (!perf.landing.some((c) => c.id === calc.landingCondition)) calc.landingCondition = perf.landing[0].id;
}

export function toInput(a: Aircraft, calc: Calculation): CalculationInput {
	const loads: CalculationInput['loads'] = {}, fuel: CalculationInput['fuel'] = {};
	a.stations.forEach((s) => {
		loads[s.id] = { mass: Math.max(0, parse(calc.values[`load:${s.id}`]) ?? 0) };
		if (calc.positions[s.id]) loads[s.id].position = calc.positions[s.id];
	});
	a.tanks.forEach((t) => { fuel[t.id] = Math.max(0, parse(calc.values[`fuel:${t.id}`]) ?? 0); });
	const elevation = parse(calc.values.elev), qnh = parse(calc.values.qnh), speed = parse(calc.values.wspd);
	return {
		configuration: calc.configuration, loads, fuel, burnPlan: calc.burnPlan,
		flightTimeHours: Math.max(0, parse(calc.values.time) ?? 0),
		fuelFlow: Math.max(0, parse(calc.values.flow) ?? 0),
		elevation: elevation === null ? null : { value: elevation, unit: calc.elevationUnit },
		qnh: qnh !== null && qnh > 0 ? qnh : null,
		oat: parse(calc.values.oat),
		windDirection: parse(calc.values.wdir),
		windSpeed: speed !== null && speed >= 0 ? speed : null,
		runwayHeading: parse(calc.values.hdg),
		takeoffCondition: calc.takeoffCondition,
		landingCondition: calc.landingCondition
	};
}

export function isUnusual(field: Field, text: string | undefined): boolean {
	const n = parse(text);
	return n !== null && (n < field.range[0] || n > field.range[1]);
}

/** Which step fixes a given limit. */
export function stepOfLimit(id: string): number {
	if (id === 'takeoffMass' || id === 'takeoffCg' || id.startsWith('station:') || id.startsWith('combined:')) return 0;
	if (id === 'crosswind') return 2;
	return 1;
}

export function toDoList(a: Aircraft, calc: Calculation): ToDo[] {
	const items: ToDo[] = [];
	fieldsFor(a, calc).forEach((fields, step) => {
		fields.forEach((f) => {
			const text = calc.values[f.key];
			if (calc.status[f.key] === 'pre') items.push({ key: f.key, label: `Confirm ${f.label}`, step });
			else if (f.required && parse(text) === null) items.push({ key: f.key, label: `Enter ${f.label}`, step });
			else if (isUnusual(f, text)) items.push({ key: f.key, label: `Check ${f.label}`, step });
		});
	});
	const anyLoad = a.stations.some((s) => (parse(calc.values[`load:${s.id}`]) ?? 0) > 0);
	if (!anyLoad) items.unshift({ key: `load:${a.stations[0].id}`, label: `Enter ${a.stations[0].label}`, step: 0 });
	if (!calc.values.place?.trim()) items.push({ key: 'place', label: 'Enter departure airfield', step: 3 });
	if (!calc.values.name?.trim()) items.push({ key: 'name', label: 'Enter pilot name', step: 3 });
	a.notes.forEach((n) => { if (!calc.notes[n.id]) items.push({ key: `note:${n.id}`, label: 'Confirm manual note', step: 3 }); });
	return items;
}

export function canReport(a: Aircraft, calc: Calculation, results: Results): boolean {
	return toDoList(a, calc).length === 0 && results.exceeded.length === 0;
}

/** Copies aircraft and load. Landing fuel becomes takeoff fuel to confirm, and anything place-specific is cleared. */
export function nextFlight(a: Aircraft, calc: Calculation, results: Results, id: string, now: number): Calculation {
	const n = newCalculation(a, id, now);
	n.configuration = calc.configuration;
	n.positions = { ...calc.positions };
	n.burnPlan = calc.burnPlan;
	n.takeoffCondition = calc.takeoffCondition;
	n.landingCondition = calc.landingCondition;
	n.elevationUnit = calc.elevationUnit;
	a.stations.forEach((s) => {
		const key = `load:${s.id}`;
		if (calc.values[key] !== undefined) { n.values[key] = calc.values[key]; n.status[key] = 'pilot'; }
	});
	a.tanks.forEach((t) => {
		prefill(n, `fuel:${t.id}`, String(Math.round(results.massBalance.fuelAtLanding[t.id] * 10) / 10), 'previous flight');
	});
	if (calc.values.flow !== undefined) {
		n.values.flow = calc.values.flow;
		n.status.flow = calc.status.flow === 'pre' ? 'pre' : calc.status.flow;
		n.sources.flow = calc.sources.flow;
	}
	if (calc.values.name) { n.values.name = calc.values.name; }
	n.step = 1;
	return n;
}

/** Tab name: registration, departure identifier once known, and date. Identical names get a number. */
export function tabLabels(calcs: Calculation[]): string[] {
	const base = calcs.map((c) => {
		const date = new Date(c.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
		const place = c.values.place?.trim();
		return `${c.aircraft}${place ? ` ${place}` : ''}, ${date}`;
	});
	const seen: Record<string, number> = {};
	return base.map((b) => {
		seen[b] = (seen[b] ?? 0) + 1;
		return seen[b] > 1 ? `${b} (${seen[b]})` : b;
	});
}

/** One keypad press. The first press after opening a field replaces its value. */
export function applyKey(field: Pick<Field, 'decimals' | 'negative'>, current: string, fresh: boolean, key: string): string {
	if (key === 'back') return current.slice(0, -1);
	if (key === 'clear') return '';
	if (key === 'neg') {
		if (!field.negative) return current;
		return current.startsWith('-') ? current.slice(1) : `-${current}`;
	}
	const base = fresh ? '' : current;
	if (key === '.') {
		if (!field.decimals || base.includes('.')) return current;
		return `${base === '' || base === '-' ? `${base}0` : base}.`;
	}
	if (!/^[0-9]$/.test(key)) return current;
	if (base.replace(/[-.]/g, '').length >= 6) return current;
	if (base === '0') return key;
	if (base === '-0') return `-${key}`;
	return base + key;
}

export function applyQuick(field: Field, current: string | undefined, op: string): string {
	if (op.startsWith('=')) return op.slice(1);
	if (op === 'None') return '0';
	if (op === 'Full') return String(field.capacity);
	const n = (parse(current) ?? 0) + Number(op);
	return String(Math.max(0, Math.round(n * 10) / 10));
}
