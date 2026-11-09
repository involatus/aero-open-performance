/**
 * The pilot's Calculation, independent of any screen: its fields, inputs, to-do list and next flight.
 * Everything aircraft-specific comes from the aircraft file.
 */
import type { Aircraft, CalculationInput, Condition, Performance, WindForDistances } from '../aircraft/schema.ts';
import type { Airfield, RunwayEnd } from '../airfield/airfields.ts';
import type { Calculation as Results } from '../engine/index.ts';
import { parseMetar } from '../weather/metar.ts';
import type { WeatherReport } from '../weather/provider.ts';

export type FieldStatus = 'pre' | 'ok' | 'pilot';
/** The airfield a value belongs to. Landing is at the departure airfield unless the pilot chooses another. */
export type Place = 'departure' | 'landing';
export type ChosenAirfield = { ident: string; name: string; date: string; runway: { designator: string; surface: string; lengthM: number | null } | null };
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
	/** The pilot may plan with no wind or a 3 kt tailwind. Older saved calculations have none, meaning as entered. */
	windForDistances?: WindForDistances;
	notes: Record<string, boolean>;
	weather?: AppliedWeather | null;
	/** The airfield and runway chosen from the airfield list, shown to help choose the matching condition. */
	airfield?: ChosenAirfield | null;
	/** Landing at another airfield than the departure one. Its values sit under keys such as land:qnh. */
	landingElsewhere?: boolean;
	landingAirfield?: ChosenAirfield | null;
	landingWeather?: AppliedWeather | null;
	landingWindForDistances?: WindForDistances;
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
	/** Units the pilot can switch between, right in the field. */
	units?: string[];
	/** A short explanation under the value, such as the heading a runway number stands for. */
	hint?: string;
	/** Facts from the aircraft file beside the label, such as "arm 143.5 in · max 130". */
	meta?: string;
};
export type ToDo = { key: string; label: string; step: number };

export const STEP_NAMES = ['Load', 'Fuel', 'Conditions', 'Send'];

/** Variable wind has no direction, so every Operator's calculations apply it as a tailwind. */
export const VARIABLE_WIND = 'VRB';
export const isVariableWind = (calc: Pick<Calculation, 'values'>, place: Place = 'departure') => calc.values[keyAt(place, 'wdir')] === VARIABLE_WIND;

/** The landing airfield's values sit beside the departure ones under their own keys, such as land:qnh. */
export const keyAt = (place: Place, key: string) => (place === 'landing' ? `land:${key}` : key);
export const airfieldAt = (calc: Calculation, place: Place) => (place === 'landing' ? calc.landingAirfield : calc.airfield) ?? null;
export const weatherAt = (calc: Calculation, place: Place) => (place === 'landing' ? calc.landingWeather : calc.weather) ?? null;
export const windChoiceAt = (calc: Calculation, place: Place): WindForDistances => (place === 'landing' ? calc.landingWindForDistances : calc.windForDistances) ?? 'entered';
/** The places whose conditions the pilot enters: the departure, and the landing when it is elsewhere. */
export const placesOf = (calc: Pick<Calculation, 'landingElsewhere'>): Place[] => (calc.landingElsewhere ? ['departure', 'landing'] : ['departure']);

/** Converted values such as 113.56235352 L read as 113.6. */
export const tenths = (x: number) => String(Math.round(x * 10) / 10);

/** Where values from the published aircraft data come from. The Data Owner checked them, so pilots don't confirm them. */
export const AIRCRAFT_DATA = 'aircraft data';

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

/** A runway's number is its heading in tens of degrees: runway 08 means 080°. */
export function runwayHeading(text: string | undefined): number | null {
	const n = parse(text);
	return n === null ? null : n * 10;
}
function runwayHint(text: string | undefined) {
	const h = runwayHeading(text);
	return h === null ? 'Runway number, such as 08 for 080°' : `Runway ${String(h / 10).padStart(2, '0')}, heading ${String(h).padStart(3, '0')}°`;
}

/** The numeric fields of each step, built from the aircraft file. */
export function fieldsFor(a: Aircraft, calc: Pick<Calculation, 'elevationUnit'> & Partial<Pick<Calculation, 'values' | 'landingElsewhere'>>): Field[][] {
	const mass = a.units.mass, step = massStep(mass), maxMass = a.massLimits.maxTakeoff.value;
	const arm = (x: number) => `arm ${x.toFixed(a.display.armDecimals)} ${a.units.arm}`;
	const meta = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
	const load: Field[] = a.stations.map((s) => ({
		key: `load:${s.id}`, label: s.label, unit: mass, decimals: true, negative: false,
		range: [0, s.maxMass ? s.maxMass * 3 : maxMass], quick: [`-${step}`, `+${step}`, 'None'], required: false,
		// A station with seat stops has no single arm, so only its limit is shown.
		meta: meta(s.arm !== undefined && !s.positions && arm(s.arm), s.maxMass !== undefined && `max ${s.maxMass}`)
	}));
	const volume = a.units.volume, fuelStep = volume === 'USgal' ? '5' : '10';
	const fuel: Field[] = a.tanks.map((t) => ({
		key: `fuel:${t.id}`, label: t.label, unit: volume, decimals: true, negative: false,
		// An empty tank is empty. The to-do list only asks when every tank is.
		range: [0, t.capacity * 2], quick: [`-${fuelStep}`, `+${fuelStep}`, 'Full'], capacity: t.capacity, required: false,
		meta: meta(arm(t.arm), `holds ${tenths(t.capacity)}`)
	}));
	fuel.push(
		{ key: 'time', label: 'Flight time to landing', unit: 'h', decimals: true, negative: false, range: [0, 24], quick: ['=0.5', '=1', '=1.5', '=2'], required: true },
		{ key: 'flow', label: 'Fuel flow', unit: `${volume}/h`, decimals: true, negative: false, range: [0, 500], quick: [], required: true }
	);
	const elevMax = calc.elevationUnit === 'm' ? 6000 : 20000;
	// The landing airfield's fields say so, as they also appear in the to-do list and on the Report.
	const at = (place: Place): Field[] => {
		const k = (key: string) => keyAt(place, key);
		const name = (label: string) => (place === 'landing' ? `Landing ${/^[A-Z]{2,}/.test(label) ? label : label.toLowerCase()}` : label);
		return [
			{ key: k('elev'), label: name('Elevation'), unit: calc.elevationUnit, units: ['m', 'ft'], decimals: false, negative: true, range: [-500, elevMax], quick: [], required: true },
			{ key: k('rwy'), label: name('Runway'), unit: '', decimals: false, negative: false, range: [1, 36], quick: [], required: true, hint: runwayHint(calc.values?.[k('rwy')]) },
			{ key: k('qnh'), label: name('QNH'), unit: 'hPa', decimals: false, negative: false, range: [900, 1100], quick: [], required: true },
			{ key: k('oat'), label: name('OAT'), unit: '°C', decimals: true, negative: true, range: [-60, 60], quick: [], required: true },
			{ key: k('wdir'), label: name('Wind from'), unit: '°', decimals: false, negative: false, range: [0, 360], quick: [VARIABLE_WIND], required: true },
			{ key: k('wspd'), label: name('Wind speed'), unit: 'kt', decimals: false, negative: false, range: [0, 99], quick: [], required: true }
		];
	};
	return [load, fuel, placesOf({ landingElsewhere: calc.landingElsewhere }).flatMap(at), []];
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
	applyAircraftData(a, calc);
	return calc;
}

/** Values from the aircraft data, such as the fuel flow. Anything the pilot typed stays. */
function applyAircraftData(a: Aircraft, calc: Calculation) {
	if (calc.status.flow === 'pilot') return;
	if (!a.fuelFlow) {
		if (calc.sources.flow === AIRCRAFT_DATA) { delete calc.values.flow; delete calc.status.flow; delete calc.sources.flow; }
		return;
	}
	calc.values.flow = tenths(a.fuelFlow.value);
	calc.status.flow = 'ok';
	calc.sources.flow = AIRCRAFT_DATA;
	delete calc.changed.flow;
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
export function applyWeather(calc: Calculation, report: WeatherReport, now: number, place: Place = 'departure') {
	const m = parseMetar(report.raw, now);
	const values: Record<string, number | string | null> = { qnh: m.qnh, oat: m.oat, wdir: m.windVariable ? VARIABLE_WIND : m.windDirection, wspd: m.windSpeed };
	const source = `METAR ${report.station}`;
	for (const base of WEATHER_KEYS) {
		const value = values[base], key = keyAt(place, base);
		if (value !== null) prefill(calc, key, String(value), source);
		else if (calc.status[key] !== 'pilot') {
			delete calc.values[key]; delete calc.status[key]; delete calc.sources[key]; delete calc.changed[key];
		}
	}
	calc.values[keyAt(place, 'station')] = report.station;
	const applied: AppliedWeather = { raw: report.raw, station: report.station, stationName: report.stationName, distanceKm: report.distanceKm, observed: m.observed, flags: m.flags };
	if (place === 'landing') calc.landingWeather = applied; else calc.weather = applied;
}

/** Prefills elevation, airfield name and weather station from the airfield list. Never overwrites what the pilot typed. */
export function applyAirfield(calc: Calculation, airfield: Airfield, date: string, place: Place = 'departure') {
	const source = `airfield list ${airfield.ident}, ${date}`, k = (key: string) => keyAt(place, key);
	if (airfield.elevationFt !== null) {
		const value = calc.elevationUnit === 'ft' ? airfield.elevationFt : Math.round(airfield.elevationFt * 0.3048);
		prefill(calc, k('elev'), String(value), source);
	}
	if (!calc.values[k('place')]) calc.values[k('place')] = `${airfield.ident} ${airfield.name}`;
	if (!calc.values[k('station')]) calc.values[k('station')] = airfield.ident;
	const chosen = { ident: airfield.ident, name: airfield.name, date, runway: null };
	if (place === 'landing') calc.landingAirfield = chosen; else calc.airfield = chosen;
}

export function applyRunway(calc: Calculation, end: RunwayEnd, place: Place = 'departure') {
	const airfield = airfieldAt(calc, place);
	if (!airfield) return;
	prefill(calc, keyAt(place, 'rwy'), String(end.number).padStart(2, '0'), `airfield list ${airfield.ident}, ${airfield.date}`);
	airfield.runway = { designator: end.designator, surface: end.surface, lengthM: end.lengthM };
}

/** The corrections a condition applies beyond its table, in words, so pilots see what a choice adds. */
export function conditionCorrections(condition: Condition | undefined): string[] {
	if (!condition || condition.kind !== 'steps') return [];
	const out: string[] = [];
	for (const s of condition.steps) {
		if (s.type === 'surface') out.push(`+${s.percent}% ground roll${s.carryToTotal ? ', also added to the total' : ''}`);
		else if (s.type === 'factor') out.push(`× ${s.value} ${s.applies.length === 2 ? 'both distances' : s.applies[0] === 'total' ? 'total distance' : 'ground roll'}${s.reason ? ` (${s.reason})` : ''}`);
		else if (s.type === 'fixed') out.push('A fixed distance from the manual');
	}
	return out;
}

export function confirmWeather(calc: Calculation, place: Place = 'departure') {
	WEATHER_KEYS.forEach((key) => confirmValue(calc, keyAt(place, key)));
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
	for (const key of Object.keys(calc.status)) if (calc.status[key] === 'ok' && calc.sources[key] !== AIRCRAFT_DATA) calc.status[key] = 'pre';
	if (calc.sources.flow === AIRCRAFT_DATA || calc.values.flow === undefined) applyAircraftData(a, calc);
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
	return {
		configuration: calc.configuration, loads, fuel, burnPlan: calc.burnPlan,
		flightTimeHours: Math.max(0, parse(calc.values.time) ?? 0),
		fuelFlow: Math.max(0, parse(calc.values.flow) ?? 0),
		...placeInput(calc, 'departure'),
		...(calc.landingElsewhere ? { landingAt: placeInput(calc, 'landing') } : {}),
		takeoffCondition: calc.takeoffCondition,
		landingCondition: calc.landingCondition
	};
}

function placeInput(calc: Calculation, place: Place): NonNullable<CalculationInput['landingAt']> {
	const v = (key: string) => calc.values[keyAt(place, key)];
	const elevation = parse(v('elev')), qnh = parse(v('qnh')), speed = parse(v('wspd'));
	// Older saved calculations still have a heading instead of a runway number.
	const heading = v('rwy') !== undefined && v('rwy') !== '' ? runwayHeading(v('rwy')) : place === 'departure' ? parse(calc.values.hdg) : null;
	// Blowing from straight behind is how the engine sees a tailwind.
	const direction = isVariableWind(calc, place) ? (heading === null ? null : (heading + 180) % 360) : parse(v('wdir'));
	return {
		elevation: elevation === null ? null : { value: elevation, unit: calc.elevationUnit },
		qnh: qnh !== null && qnh > 0 ? qnh : null,
		oat: parse(v('oat')),
		windDirection: direction,
		windSpeed: speed !== null && speed >= 0 ? speed : null,
		runwayHeading: heading,
		windForDistances: windChoiceAt(calc, place)
	};
}

export function isUnusual(field: Field, text: string | undefined): boolean {
	const n = parse(text);
	return n !== null && (n < field.range[0] || n > field.range[1]);
}

/** Which step fixes a given limit. */
export function stepOfLimit(id: string): number {
	if (id === 'takeoffMass' || id === 'takeoffCg' || id.startsWith('station:') || id.startsWith('combined:')) return 0;
	if (id === 'crosswind' || id === 'landingCrosswind') return 2;
	return 1;
}

export function toDoList(a: Aircraft, calc: Calculation): ToDo[] {
	const items: ToDo[] = [];
	fieldsFor(a, calc).forEach((fields, step) => {
		fields.forEach((f) => {
			const text = calc.values[f.key];
			if (calc.status[f.key] === 'pre') items.push({ key: f.key, label: `Confirm ${f.label}`, step });
			else if (f.required && parse(text) === null && !(f.key.endsWith('wdir') && text === VARIABLE_WIND)) items.push({ key: f.key, label: `Enter ${f.label}`, step });
			else if (isUnusual(f, text)) items.push({ key: f.key, label: `Check ${f.label}`, step });
		});
	});
	const anyLoad = a.stations.some((s) => (parse(calc.values[`load:${s.id}`]) ?? 0) > 0);
	if (!anyLoad) items.unshift({ key: `load:${a.stations[0].id}`, label: `Enter ${a.stations[0].label}`, step: 0 });
	const anyFuel = a.tanks.some((t) => (parse(calc.values[`fuel:${t.id}`]) ?? 0) > 0);
	if (!anyFuel) {
		// First among the Fuel step's items, so the list keeps the order of the steps.
		const at = items.findIndex((t) => t.step >= 1);
		items.splice(at < 0 ? items.length : at, 0, { key: `fuel:${a.tanks[0].id}`, label: `Enter ${a.tanks[0].label}`, step: 1 });
	}
	if (!calc.values.place?.trim()) items.push({ key: 'place', label: 'Enter departure airfield', step: 3 });
	if (calc.landingElsewhere && !calc.values['land:place']?.trim()) items.push({ key: 'land:place', label: 'Enter landing airfield', step: 3 });
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
	// Landed elsewhere: the next flight departs from there.
	if (calc.landingElsewhere) {
		if (calc.landingAirfield) n.airfield = { ...calc.landingAirfield, runway: null };
		if (calc.values['land:place']) n.values.place = calc.values['land:place'];
		if (calc.values['land:station']) n.values.station = calc.values['land:station'];
		if (calc.values['land:elev']) prefill(n, 'elev', calc.values['land:elev'], 'previous flight, landing airfield');
	}
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
	if (op === VARIABLE_WIND) return VARIABLE_WIND;
	if (op === 'None') return '0';
	// Rounded down, so Full never lands just above a converted capacity such as 113.56235352.
	if (op === 'Full') return String(Math.floor(field.capacity! * 10) / 10);
	const n = (parse(current) ?? 0) + Number(op);
	return String(Math.max(0, Math.round(n * 10) / 10));
}
