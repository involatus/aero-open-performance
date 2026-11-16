/**
 * The pilot's Calculation, independent of any screen: its fields, inputs, to-do list and next flight.
 * Everything aircraft-specific comes from the aircraft file.
 */
import type { Aircraft, CalculationInput, Condition, Performance, PowerSetting, WindForDistances } from '../aircraft/schema.ts';
import { magneticHeading, runwayNumber, surfaceKind, type Airfield, type RunwayEnd } from '../airfield/airfields.ts';
import type { Calculation as Results } from '../engine/index.ts';
import { M_PER_FT } from '../engine/units.ts';
import { toMagnetic } from '../weather/variation.ts';
import { VARIABLE_WIND, windComponents } from '../engine/wind.ts';
import { parseMetar } from '../weather/metar.ts';
import type { WeatherReport } from '../weather/provider.ts';

export type FieldStatus = 'pre' | 'ok' | 'pilot';
export type Phase = 'takeoff' | 'landing';
/**
 * Who chose a condition. `pilot`: the pilot. `runway`: the chosen runway's surface in the airfield list decides it,
 * as every other condition is for another surface. `airfield`: that surface suggests it, but the aircraft also has a
 * condition the list can't judge, such as snow, so the pilot confirms it.
 */
export type ConditionChoice = 'pilot' | 'runway' | 'airfield';
/** The airfield a value belongs to. Landing is at the departure airfield unless the pilot chooses another. */
export type Place = 'departure' | 'landing';
/** `runway.heading`: its magnetic heading from the list's measured one; absent in older calculations. */
export type ChosenAirfield = { ident: string; name: string; date: string; runway: { designator: string; surface: string; lengthM: number | null; heading?: number } | null };
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
	/** The power setting the fuel flow comes from. None for an aircraft without power settings, and in older saved calculations. */
	powerSetting?: string;
	takeoffCondition: string;
	landingCondition: string;
	/** Who chose each condition. None means the first condition, still to choose. */
	conditionChoice?: Partial<Record<Phase, ConditionChoice>>;
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
/** `trueDirection` and `variation` are set when the METAR's true wind was turned magnetic. */
export type AppliedWeather = { raw: string; station: string; stationName: string | null; distanceKm: number | null; observed: string | null; flags: string[]; trueDirection?: number; variation?: number };
export type Field = {
	key: string;
	label: string;
	unit: string;
	decimals: boolean;
	negative: boolean;
	range: [number, number];
	quick: string[];
	capacity?: number;
	/** A slider for a quick setting: it pulls onto `snaps`, and `marks` are tappable labels under it. */
	slider?: { max: number; step: number; snaps: number[]; zone: number; marks: { value: number; label: string; spoken: string }[] };
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
export { VARIABLE_WIND } from '../engine/wind.ts';
export const isVariableWind = (calc: Pick<Calculation, 'values'>, place: Place = 'departure') => calc.values[keyAt(place, 'wdir')] === VARIABLE_WIND;

/** The landing airfield's values sit beside the departure ones under their own keys, such as land:qnh. */
export const keyAt = (place: Place, key: string) => (place === 'landing' ? `land:${key}` : key);
export const airfieldAt = (calc: Calculation, place: Place) => (place === 'landing' ? calc.landingAirfield : calc.airfield) ?? null;
export const weatherAt = (calc: Calculation, place: Place) => (place === 'landing' ? calc.landingWeather : calc.weather) ?? null;
export const windChoiceAt = (calc: Calculation, place: Place): WindForDistances => (place === 'landing' ? calc.landingWindForDistances : calc.windForDistances) ?? 'entered';
/** Sets which wind a place's distances use. */
export function setWindChoice(calc: Calculation, place: Place, choice: WindForDistances) {
	if (place === 'landing') calc.landingWindForDistances = choice; else calc.windForDistances = choice;
}
/** The place a key belongs to, and the key without its place, so callers never parse the prefix. */
export const placeOfKey = (key: string): Place => (key.startsWith(keyAt('landing', '')) ? 'landing' : 'departure');
export const baseKey = (key: string) => (placeOfKey(key) === 'landing' ? key.slice(keyAt('landing', '').length) : key);
/** Where the landing happens: the landing airfield when elsewhere, otherwise the departure. */
export const landingPlace = (calc: Pick<Calculation, 'landingElsewhere'>): Place => (calc.landingElsewhere ? 'landing' : 'departure');
/** The runway chosen from the list, while the runway number still names it; typing another number leaves it behind. */
export function chosenRunway(calc: Partial<Pick<Calculation, 'values' | 'airfield' | 'landingAirfield'>>, place: Place) {
	const runway = (place === 'landing' ? calc.landingAirfield : calc.airfield)?.runway;
	const number = parse(calc.values?.[keyAt(place, 'rwy')]);
	return runway && number !== null && runwayNumber(runway.designator) === number ? runway : null;
}
/** The chosen runway the takeoff or landing uses. */
export const runwayFor = (calc: Calculation, phase: Phase) => chosenRunway(calc, phase === 'landing' ? landingPlace(calc) : 'departure');

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

export type RunwayWind = { headwind: number; crosswind: number; variable: boolean };
/**
 * Each runway's wind components from the entered wind, and the runway most into the wind, so a pilot who
 * doesn't know the active runway yet can see the choice. Variable wind counts as a tailwind on every runway,
 * as in the calculation, so no runway is "into wind" then. Each runway's `heading` is magnetic; without one its number stands for it.
 */
export function runwayWinds(runways: Array<{ designator: string; number: number; heading?: number }>, wdir: string | undefined, wspd: string | undefined) {
	const speed = parse(wspd), variable = wdir === VARIABLE_WIND, direction = variable ? null : parse(wdir);
	const winds = new Map<string, RunwayWind>();
	if (speed === null || (!variable && direction === null)) return { winds, intoWind: null as string | null };
	for (const r of runways) {
		winds.set(r.designator, { ...windComponents(variable ? VARIABLE_WIND : direction!, speed, r.heading ?? r.number * 10), variable });
	}
	let intoWind: string | null = null, best = 0.5;
	if (!variable) for (const [d, w] of winds) if (w.headwind > best) { best = w.headwind; intoWind = d; }
	return { winds, intoWind };
}
/** "Headwind 6 kt · cross 2 kt", in whole knots. */
export function runwayWindText(w: RunwayWind): string {
	if (w.variable) return `Variable: tailwind ${Math.round(-w.headwind)} kt`;
	const along = Math.round(Math.abs(w.headwind)), cross = Math.round(w.crosswind);
	if (!along && !cross) return 'Calm';
	return [along ? `${w.headwind > 0 ? 'Headwind' : 'Tailwind'} ${along} kt` : '', cross ? `cross ${cross} kt` : ''].filter(Boolean).join(' · ');
}
/** Under the wind field, only when the METAR's true wind was turned magnetic and the pilot hasn't changed it. */
/**
 * The METAR's true wind and the variation used, while the wind shown is still that converted value.
 * Null once the pilot typed their own, or when nothing was converted. The field hint and the Report both ask here.
 */
export function magneticWind(calc: Partial<Pick<Calculation, 'weather' | 'landingWeather' | 'sources' | 'status'>>, place: Place): { trueDirection: number; variation: number } | null {
	const w = place === 'landing' ? calc.landingWeather : calc.weather, key = keyAt(place, 'wdir');
	if (!w || w.trueDirection === undefined || w.variation === undefined || !calc.sources || !isFromMetar({ sources: calc.sources }, key) || calc.status?.[key] === 'pilot') return null;
	return { trueDirection: w.trueDirection, variation: w.variation };
}
/** Headings and wind directions as written: 080°. */
export const degrees = (x: number) => `${String(x).padStart(3, '0')}°`;
function magneticHint(calc: Parameters<typeof magneticWind>[0], place: Place): string | undefined {
	const m = magneticWind(calc, place);
	return m ? `Magnetic: METAR ${degrees(m.trueDirection)} true, variation ${Math.abs(m.variation).toFixed(0)}° ${m.variation >= 0 ? 'E' : 'W'}` : undefined;
}
/** The Loading Station a load field belongs to, so callers don't rebuild the field key. */
export const stationOfField = (a: Aircraft, key: string) => a.stations.find((s) => `load:${s.id}` === key);
/**
 * The runway a place uses: its number, and its heading, magnetic. The measured heading from the airfield
 * list when this runway was chosen there; otherwise the number stands for it.
 */
export function runwayAt(calc: Partial<Pick<Calculation, 'values' | 'airfield' | 'landingAirfield'>>, place: Place): { number: number; heading: number; measured: boolean } | null {
	const number = parse(calc.values?.[keyAt(place, 'rwy')]);
	if (number === null) return null;
	const measured = chosenRunway(calc, place)?.heading ?? null;
	return { number, heading: measured ?? number * 10, measured: measured !== null };
}
export const runwayText = (number: number) => String(number).padStart(2, '0');
function runwayHint(calc: Parameters<typeof runwayAt>[0], place: Place) {
	const r = runwayAt(calc, place);
	if (!r) return 'Runway number, such as 08 for 080°';
	return `Runway ${runwayText(r.number)}, heading ${degrees(r.heading)}${r.measured ? ' magnetic, measured' : ''}`;
}

/** The numeric fields of each step, built from the aircraft file. */
const QUARTERS = [[0, 'Empty', 'Empty'], [0.25, '¼', 'A quarter'], [0.5, '½', 'Half'], [0.75, '¾', 'Three quarters'], [1, 'Full', 'Full']] as const;

/** A tank's slider: free in whole litres or half gallons, pulled onto a quarter point within 2 % of the capacity. */
function tankSlider(capacity: number, unit: string): Field['slider'] {
	const marks = QUARTERS.map(([f, label, spoken]) => ({ value: Number((f * capacity).toFixed(2)), label, spoken: `${spoken}, ${tenths(f * capacity)} ${unit}` }));
	return { max: capacity, step: unit === 'USgal' ? 0.5 : 1, snaps: marks.map((m) => m.value), zone: capacity * 0.02, marks };
}

/**
 * Flight time: up to how long full tanks last at the aircraft's fuel flow (its lowest, so the longest
 * time), or 4 hours when the aircraft has none. Moved in 3 minutes, and pulled onto a quarter hour within 2.4 minutes.
 */
function timeSlider(a: Aircraft): Field['slider'] {
	const flows = [...(a.powerSettings ?? []).map((p) => p.fuelFlow), ...(a.fuelFlow ? [a.fuelFlow.value] : [])];
	const full = a.tanks.reduce((sum, t) => sum + t.capacity, 0);
	const hours = flows.length ? full / Math.min(...flows) : 4;
	const max = Math.min(24, Math.max(1, Math.ceil(hours * 4) / 4));
	const every = max > 8 ? 2 : 1;
	const snaps = Array.from({ length: Math.floor(max * 4) + 1 }, (_, i) => i / 4);
	const marks = Array.from({ length: Math.floor(max / every) + 1 }, (_, i) => i * every).map((h) => ({ value: h, label: `${h}`, spoken: `${h} hours` }));
	return { max, step: 0.05, snaps, zone: 0.04, marks };
}

export function fieldsFor(a: Aircraft, calc: Pick<Calculation, 'elevationUnit'> & Partial<Pick<Calculation, 'values' | 'landingElsewhere' | 'weather' | 'landingWeather' | 'sources' | 'status' | 'airfield' | 'landingAirfield'>>): Field[][] {
	const mass = a.units.mass, step = massStep(mass), maxMass = a.massLimits.maxTakeoff.value;
	const arm = (x: number) => `arm ${x.toFixed(a.display.armDecimals)} ${a.units.arm}`;
	const meta = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
	const load: Field[] = a.stations.map((s) => ({
		key: `load:${s.id}`, label: s.label, unit: mass, decimals: true, negative: false,
		range: [0, s.maxMass ? s.maxMass * 3 : maxMass], quick: [`-${step}`, `+${step}`, 'None'], required: false,
		// A station with seat stops has no single arm, so only its limit is shown.
		meta: meta(s.arm !== undefined && !s.positions && arm(s.arm), s.maxMass !== undefined && `max ${s.maxMass}`)
	}));
	const volume = a.units.volume;
	const fuel: Field[] = a.tanks.map((t) => ({
		key: `fuel:${t.id}`, label: t.label, unit: volume, decimals: true, negative: false,
		// An empty tank is empty. The to-do list only asks when every tank is.
		range: [0, t.capacity * 2], quick: [], capacity: t.capacity, required: false,
		meta: meta(arm(t.arm), `holds ${tenths(t.capacity)}`),
		slider: tankSlider(t.capacity, volume)
	}));
	fuel.push(
		{ key: 'time', label: 'Flight time to landing', unit: 'h', decimals: true, negative: false, range: [0, 24], quick: [], required: true, slider: timeSlider(a) },
		{ key: 'flow', label: 'Fuel flow', unit: `${volume}/h`, decimals: true, negative: false, range: [0, 500], quick: [], required: true }
	);
	const elevMax = calc.elevationUnit === 'm' ? 6000 : 20000;
	// The landing airfield's fields say so, as they also appear in the to-do list and on the Report.
	const at = (place: Place): Field[] => {
		const k = (key: string) => keyAt(place, key);
		const name = (label: string) => (place === 'landing' ? `Landing ${/^[A-Z]{2,}/.test(label) ? label : label.toLowerCase()}` : label);
		return [
			{ key: k('elev'), label: name('Elevation'), unit: calc.elevationUnit, units: ['m', 'ft'], decimals: false, negative: true, range: [-500, elevMax], quick: [], required: true },
			{ key: k('rwy'), label: name('Runway'), unit: '', decimals: false, negative: false, range: [1, 36], quick: [], required: true, hint: runwayHint(calc, place) },
			{ key: k('qnh'), label: name('QNH'), unit: 'hPa', decimals: false, negative: false, range: [900, 1100], quick: [], required: true },
			{ key: k('oat'), label: name('OAT'), unit: '°C', decimals: true, negative: true, range: [-60, 60], quick: [], required: true },
			{ key: k('wdir'), label: name('Wind from'), unit: '°', decimals: false, negative: false, range: [0, 360], quick: [VARIABLE_WIND], required: true, hint: magneticHint(calc, place) },
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
	const settings = a.powerSettings ?? [];
	const setting = settings.find((p) => p.id === calc.powerSetting) ?? settings[0];
	if (setting) calc.powerSetting = setting.id; else delete calc.powerSetting;
	const flow = setting?.fuelFlow ?? a.fuelFlow?.value;
	if (flow === undefined) {
		if (calc.sources.flow === AIRCRAFT_DATA) { delete calc.values.flow; delete calc.status.flow; delete calc.sources.flow; }
		return;
	}
	calc.values.flow = tenths(flow);
	calc.status.flow = 'ok';
	calc.sources.flow = AIRCRAFT_DATA;
	delete calc.changed.flow;
}

/** The power setting the fuel flow comes from, or null when the pilot typed the fuel flow or the aircraft has none. */
export function chosenPowerSetting(a: Aircraft, calc: Calculation): PowerSetting | null {
	if (calc.status.flow === 'pilot') return null;
	return a.powerSettings?.find((p) => p.id === calc.powerSetting) ?? null;
}

/**
 * The pilot picks a power setting: its fuel flow replaces any the pilot typed. `null` is "Other":
 * the fuel flow becomes the pilot's own, kept as it is until they type another.
 */
export function choosePowerSetting(a: Aircraft, calc: Calculation, id: string | null) {
	if (id === null) { setByPilot(calc, 'flow', calc.values.flow ?? ''); return; }
	calc.powerSetting = id;
	delete calc.status.flow;
	applyAircraftData(a, calc);
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

/** The source a METAR value carries, and the one test for it, so writing and reading can't drift apart. */
const metarSource = (station: string) => `METAR ${station}`;
export function isFromMetar(calc: Pick<Calculation, 'sources'>, key: string): boolean {
	return calc.sources[key]?.startsWith(metarSource('')) ?? false;
}

/**
 * Prefills only what the report clearly states. A value it doesn't state is left empty,
 * and anything the pilot typed is never touched.
 */
export function applyWeather(calc: Calculation, report: WeatherReport, now: number, place: Place = 'departure', variation: number | null = null) {
	const m = parseMetar(report.raw, now);
	// METAR wind is true; runways and ATIS are magnetic. A variation under half a degree changes nothing.
	const turned = !m.windVariable && m.windDirection !== null && variation !== null && Math.abs(variation) >= 0.5;
	const direction = turned ? toMagnetic(m.windDirection!, variation!) : m.windDirection;
	const values: Record<string, number | string | null> = { qnh: m.qnh, oat: m.oat, wdir: m.windVariable ? VARIABLE_WIND : direction, wspd: m.windSpeed };
	const source = metarSource(report.station);
	for (const base of WEATHER_KEYS) {
		const value = values[base], key = keyAt(place, base);
		if (value !== null) prefill(calc, key, String(value), source);
		else if (calc.status[key] !== 'pilot') {
			delete calc.values[key]; delete calc.status[key]; delete calc.sources[key]; delete calc.changed[key];
		}
	}
	calc.values[keyAt(place, 'station')] = report.station;
	const applied: AppliedWeather = { raw: report.raw, station: report.station, stationName: report.stationName, distanceKm: report.distanceKm, observed: m.observed, flags: m.flags, ...(turned && direction !== m.windDirection ? { trueDirection: m.windDirection!, variation: variation! } : {}) };
	if (place === 'landing') calc.landingWeather = applied; else calc.weather = applied;
}

/** Prefills elevation, airfield name and weather station from the airfield list. Never overwrites what the pilot typed. */
export function applyAirfield(calc: Calculation, airfield: Airfield, date: string, place: Place = 'departure') {
	const source = `airfield list ${airfield.ident}, ${date}`, k = (key: string) => keyAt(place, key);
	if (airfield.elevationFt !== null) {
		const value = calc.elevationUnit === 'ft' ? airfield.elevationFt : Math.round(airfield.elevationFt * M_PER_FT);
		prefill(calc, k('elev'), String(value), source);
	}
	if (!calc.values[k('place')]) calc.values[k('place')] = `${airfield.ident} ${airfield.name}`;
	if (!calc.values[k('station')]) calc.values[k('station')] = airfield.ident;
	const chosen = { ident: airfield.ident, name: airfield.name, date, runway: null };
	if (place === 'landing') calc.landingAirfield = chosen; else calc.airfield = chosen;
}

/** `variation`: the airfield's, so the runway's measured true heading is kept as magnetic. */
export function applyRunway(calc: Calculation, end: RunwayEnd, place: Place = 'departure', variation: number | null = null) {
	const airfield = airfieldAt(calc, place);
	if (!airfield) return;
	prefill(calc, keyAt(place, 'rwy'), String(end.number).padStart(2, '0'), `airfield list ${airfield.ident}, ${airfield.date}`);
	// Without a variation a measured true heading isn't magnetic, so none is kept and the runway number stands for it.
	airfield.runway = { designator: end.designator, surface: end.surface, lengthM: end.lengthM, ...(end.headingTrue !== null && variation !== null ? { heading: magneticHeading(end, variation) } : {}) };
	// Tapping the runway is the pilot's choice of this airfield and runway, so its elevation from the list counts as checked too.
	confirmValue(calc, keyAt(place, 'rwy'));
	if (calc.sources[keyAt(place, 'elev')]?.startsWith('airfield list')) confirmValue(calc, keyAt(place, 'elev'));
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

const PHASES: Phase[] = ['takeoff', 'landing'];
const conditionKey = (phase: Phase) => (phase === 'takeoff' ? 'takeoffCondition' : 'landingCondition');
export const conditionAt = (calc: Calculation, phase: Phase) => calc[conditionKey(phase)];
export const conditionChoiceAt = (calc: Calculation, phase: Phase) => calc.conditionChoice?.[phase] ?? null;
/** The to-do item and element id for a phase's condition. */
export const conditionItemKey = (phase: Phase) => `condition:${phase}`;

function setCondition(calc: Calculation, phase: Phase, id: string, by: ConditionChoice | null) {
	if (calc[conditionKey(phase)] !== id) calc[conditionKey(phase)] = id;
	if (conditionChoiceAt(calc, phase) === by) return;
	const next = { ...calc.conditionChoice };
	if (by) next[phase] = by; else delete next[phase];
	calc.conditionChoice = next;
}

/** Chosen by the pilot, or settled by the chosen runway's surface: nothing left to confirm. */
export const conditionSettled = (calc: Calculation, phase: Phase) => ['pilot', 'runway'].includes(conditionChoiceAt(calc, phase) ?? '');

/** The pilot's choice, or confirmation of the one the app made. */
export function chooseCondition(calc: Calculation, phase: Phase, id: string) {
	setCondition(calc, phase, id, 'pilot');
}

/**
 * The only condition for the runway's surface in the airfield list, and whether that settles it: it does when every
 * other condition is for another surface. A condition for any surface, such as snow, is a state the list can't know.
 * None when the surface is unknown or several conditions fit.
 */
export function conditionForRunway(list: Condition[], runway: { surface: string } | null): { condition: Condition; settled: boolean } | null {
	const kind = runway ? surfaceKind(runway.surface) : 'unknown';
	const fits = kind === 'unknown' ? [] : list.filter((c) => c.surface === kind);
	if (fits.length !== 1) return null;
	return { condition: fits[0], settled: list.every((c) => c === fits[0] || (c.surface !== undefined && c.surface !== kind)) };
}

/** Where a condition came from when the airfield list settled it, worded as the other sources: "airfield list LSZK, 2026-11-15". */
export function conditionSource(calc: Calculation, phase: Phase): string | null {
	if (conditionChoiceAt(calc, phase) !== 'runway') return null;
	const airfield = airfieldAt(calc, phase === 'landing' ? landingPlace(calc) : 'departure');
	return airfield ? `airfield list ${airfield.ident}, ${airfield.date}` : null;
}

/**
 * Chooses each condition the pilot hasn't from the chosen runway's surface: settled when no other condition could
 * apply, otherwise for the pilot to confirm. When that runway no longer gives one, the app's choice stays but is no
 * longer marked as from the list, so the pilot chooses.
 * Changes nothing when nothing changed, so it can run after any change.
 */
export function matchConditions(a: Aircraft, calc: Calculation) {
	const perf = performanceOf(a, calc.configuration);
	if (!perf) return;
	for (const phase of PHASES) {
		const list = perf[phase], by = conditionChoiceAt(calc, phase);
		if (!list.some((c) => c.id === conditionAt(calc, phase))) { setCondition(calc, phase, list[0].id, null); continue; }
		if (by === 'pilot') continue;
		const match = conditionForRunway(list, runwayFor(calc, phase));
		if (match) setCondition(calc, phase, match.condition.id, match.settled ? 'runway' : 'airfield');
		else if (by) setCondition(calc, phase, conditionAt(calc, phase), null);
	}
}

export function confirmWeather(calc: Calculation, place: Place = 'departure') {
	WEATHER_KEYS.forEach((key) => confirmValue(calc, keyAt(place, key)));
}
/** Takes back a confirmation of the METAR's values; what the pilot typed stays theirs. */
export function unconfirmWeather(calc: Calculation, place: Place = 'departure') {
	WEATHER_KEYS.forEach((base) => { const key = keyAt(place, base); if (calc.status[key] === 'ok' && isFromMetar(calc, key)) calc.status[key] = 'pre'; });
}
/** The to-do item and element id for a place's weather, confirmed as one. */
export const weatherItemKey = (place: Place) => `weather:${place}`;

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
	delete calc.conditionChoice;
	matchConditions(a, calc);
	calc.notice = `Recalculated with Release ${release}. Please check and confirm the values again.`;
}

export function changeConfiguration(a: Aircraft, calc: Calculation, id: string) {
	calc.configuration = id;
	matchConditions(a, calc);
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
	const heading = v('rwy') !== undefined && v('rwy') !== '' ? runwayAt(calc, place)?.heading ?? null : place === 'departure' ? parse(calc.values.hdg) : null;
	const direction = isVariableWind(calc, place) ? VARIABLE_WIND : parse(v('wdir'));
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

/** The manual notes for the pilot's choices: a ski note only with skis, for example. */
export function notesFor(a: Aircraft, calc: Pick<Calculation, 'configuration' | 'takeoffCondition' | 'landingCondition'>) {
	const has = (list: string[] | undefined, id: string) => !list || list.includes(id);
	return a.notes.filter((n) => has(n.appliesTo?.configurations, calc.configuration) && has(n.appliesTo?.takeoffConditions, calc.takeoffCondition) && has(n.appliesTo?.landingConditions, calc.landingCondition));
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
			// The METAR's values are checked together: one item per airfield, not one per value.
			const weather = WEATHER_KEYS.includes(baseKey(f.key)) ? placeOfKey(f.key) : null;
			if (calc.status[f.key] === 'pre' && weather) { if (!items.some((t) => t.key === weatherItemKey(weather))) items.push({ key: weatherItemKey(weather), label: weather === 'landing' ? 'Confirm the landing weather' : 'Confirm the weather', step }); }
			else if (calc.status[f.key] === 'pre') items.push({ key: f.key, label: `Confirm ${f.label}`, step });
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
	// The first condition is only a placeholder, often the shortest distance, so the pilot chooses one whenever there is a choice.
	const perf = performanceOf(a, calc.configuration);
	if (perf) {
		const at = items.findIndex((t) => t.step > 2);
		const choose = PHASES.filter((p) => perf[p].length > 1 && !conditionSettled(calc, p))
			.map((p): ToDo => ({ key: conditionItemKey(p), label: `${conditionChoiceAt(calc, p) === 'airfield' ? 'Confirm' : 'Choose'} ${p} surface`, step: 2 }));
		items.splice(at < 0 ? items.length : at, 0, ...choose);
	}
	if (!calc.values.place?.trim()) items.push({ key: 'place', label: 'Enter departure airfield', step: 3 });
	if (calc.landingElsewhere && !calc.values['land:place']?.trim()) items.push({ key: 'land:place', label: 'Enter landing airfield', step: 3 });
	if (!calc.values.name?.trim()) items.push({ key: 'name', label: 'Enter pilot name', step: 3 });
	notesFor(a, calc).forEach((n) => { if (!calc.notes[n.id]) items.push({ key: `note:${n.id}`, label: 'Confirm manual note', step: 3 }); });
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
	if (calc.powerSetting) n.powerSetting = calc.powerSetting;
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
