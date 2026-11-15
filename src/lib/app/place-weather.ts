/**
 * The weather decisions for one airfield on the Conditions step: when to fetch by itself, where "Nearest"
 * looks, and how the report's station is described. The component only renders and calls these.
 */
import { OLD_REPORT_MINUTES, VARIABLE_WIND, WEATHER_KEYS, degrees, isFromMetar, keyAt, parse, reportAgeMinutes, runwayText, type AppliedWeather, type Calculation, type Place } from './calculation.ts';
import type { Wind } from '../engine/performance.ts';
import { variationAt } from '../weather/variation.ts';

/** The variation that turns a METAR's true wind magnetic: the chosen airfield's. None without an airfield. */
export const variationFor = (airfield: { lat: number; lon: number } | null, now: number) => (airfield ? variationAt(airfield.lat, airfield.lon, new Date(now)) : null);

export type Fetch = { fetch: false } | { fetch: true; note: string };

/**
 * Back on the step with an airfield chosen: fetch when there is no report yet, and refresh an old one
 * only while nobody has confirmed its values, so a confirmed value never changes unseen.
 */
export function weatherOnReturn(weather: AppliedWeather | null | undefined, valuesToConfirm: number, now: number): Fetch {
	if (!weather) return { fetch: true, note: '' };
	const age = reportAgeMinutes(weather, now);
	if (age !== null && age > OLD_REPORT_MINUTES && valuesToConfirm > 0) return { fetch: true, note: `Weather refreshed: the earlier report was ${age} minutes old.` };
	return { fetch: false };
}

export type Nearest = { from: 'airfield'; lat: number; lon: number } | { from: 'device' } | { from: 'none'; message: string };

/** The chosen airfield's position first. The device's own position only for the departure, where it is. */
export function nearestFrom(place: Place, airfield: { lat: number; lon: number } | null, canLocate: boolean): Nearest {
	if (airfield) return { from: 'airfield', lat: airfield.lat, lon: airfield.lon };
	if (place === 'landing') return { from: 'none', message: 'Find the landing airfield first, or enter its weather station.' };
	if (!canLocate) return { from: 'none', message: 'This device can\'t share its location. Enter a station code instead.' };
	return { from: 'device' };
}

/** The station, plus how far away it is when it isn't the chosen airfield. */
export function stationLine(w: Pick<AppliedWeather, 'station' | 'stationName' | 'distanceKm'>, airfieldIdent: string | null): string {
	const name = `${w.station}${w.stationName ? ` ${w.stationName}` : ''}`;
	if (w.station === airfieldIdent || (w.distanceKm !== null && w.distanceKm < 1)) return name;
	if (w.distanceKm !== null) return `${name}, ${w.distanceKm.toFixed(1)} km away`;
	return airfieldIdent ? `${name}, not ${airfieldIdent}` : name;
}

export type WeatherRow = { id: 'qnh' | 'oat' | 'wind'; label: string; keys: string[]; value: string | null; fromMetar: boolean };

/**
 * The weather as a short list: each row's value as written, or null while one of its values is missing,
 * and whether all of it is still the METAR's (a summary until changed) or typed by the pilot.
 */
export function weatherRows(calc: Pick<Calculation, 'values' | 'status' | 'sources'>, place: Place): WeatherRow[] {
	const v = (base: string) => calc.values[keyAt(place, base)];
	const has = (base: string) => (base === 'wdir' && v(base) === VARIABLE_WIND) || parse(v(base)) !== null;
	const metar = (base: string) => isFromMetar(calc, keyAt(place, base)) && calc.status[keyAt(place, base)] !== 'pilot';
	const row = (id: WeatherRow['id'], label: string, keys: string[], text: () => string): WeatherRow =>
		({ id, label, keys, value: keys.every(has) ? text() : null, fromMetar: keys.every(metar) });
	return [
		row('qnh', 'QNH', ['qnh'], () => `${v('qnh')} hPa`),
		row('oat', 'OAT', ['oat'], () => `${v('oat')} °C`),
		row('wind', 'Wind', ['wdir', 'wspd'], () => `${v('wdir') === VARIABLE_WIND ? 'VRB' : degrees(Number(v('wdir')))} / ${v('wspd')} kt`)
	];
}

/** Confirmed: no METAR value waits for the pilot, and at least one came from the METAR. */
export function weatherConfirmed(calc: Pick<Calculation, 'status' | 'sources'>, place: Place): boolean {
	const keys = WEATHER_KEYS.map((b) => keyAt(place, b));
	return !keys.some((k) => calc.status[k] === 'pre') && keys.some((k) => calc.status[k] === 'ok' && isFromMetar(calc, k));
}

/** What the distances use, in words: "tailwind 2 kt on runway 30". */
export function distancesUseText(wind: Wind | null, runway: number | null): string | null {
	if (!wind) return null;
	const h = Math.round(wind.headwind), on = runway !== null ? ` on runway ${runwayText(runway)}` : '';
	return h === 0 ? `no wind${on}` : `${h > 0 ? 'headwind' : 'tailwind'} ${Math.abs(h)} kt${on}`;
}
