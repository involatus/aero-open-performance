/**
 * The weather decisions for one airfield on the Conditions step: when to fetch by itself, where "Nearest"
 * looks, and how the report's station is described. The component only renders and calls these.
 */
import { OLD_REPORT_MINUTES, reportAgeMinutes, type AppliedWeather, type Place } from './calculation.ts';
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
