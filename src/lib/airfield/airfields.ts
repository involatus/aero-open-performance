/**
 * Airfields from OurAirports, a community database kept on the device for offline use.
 * Every value it gives is a Prefilled Value the pilot checks against official sources.
 */
import type { Surface } from '../aircraft/schema.ts';
import { M_PER_FT } from '../engine/units.ts';
import { toMagnetic } from '../weather/variation.ts';
/** `headingTrue`: the runway's measured heading from OurAirports, true north; null where it has none. */
export type RunwayEnd = { designator: string; number: number; surface: string; surfaceKind: SurfaceKind; lengthM: number | null; headingTrue: number | null };
export type Airfield = { ident: string; name: string; elevationFt: number | null; lat: number; lon: number; runways: RunwayEnd[] };
export type AirfieldData = { source: string; date: string; airfields: Airfield[] };
export type SurfaceKind = Surface | 'unknown';

// Each runway: both ends, surface, length in ft, then each end's true heading (lists made before carry no headings).
type Raw = { source: string; date: string; airports: [string, string, number | null, number, number, [string, string, string, number | null, (number | null)?, (number | null)?][]][] };

const KIND: [RegExp, SurfaceKind][] = [
	[/^(asp|asph|bit|con|conc|pem|tar|tarmac|paved|asphalt|concrete)/i, 'paved'],
	[/^(turf|grs|grass|gras|g$|gre)/i, 'grass'],
	[/^(gvl|grv|gravel)/i, 'gravel'],
	[/^water/i, 'water']
];
const kindOf = (word: string): SurfaceKind => KIND.find(([re]) => re.test(word))?.[1] ?? 'unknown';
/**
 * The kind of the first word, such as TURF in TURF-G. A later word of another kind, as in ASPH-TURF or
 * "Concrete and turf.", makes it unknown. Single letters after the first word are conditions, such as G for good.
 */
export function surfaceKind(raw: string): SurfaceKind {
	const [first, ...rest] = raw.trim().split(/[^\p{L}]+/u).filter(Boolean);
	const kind = first ? kindOf(first) : 'unknown';
	return rest.some((w) => w.length > 1 && ![kind, 'unknown'].includes(kindOf(w))) ? 'unknown' : kind;
}

/** "08", "26L" and "08R" give 8, 26 and 8. Helipads and letters-only ends give null. */
export function runwayNumber(designator: string): number | null {
	const m = /^(\d{1,2})[LRCW]?$/i.exec(designator.trim());
	const n = m ? Number(m[1]) : NaN;
	return n >= 1 && n <= 36 ? n : null;
}

export function parseAirfields(raw: Raw): AirfieldData {
	const airfields = raw.airports.map(([ident, name, elevationFt, lat, lon, rws]) => ({
		ident, name, elevationFt, lat, lon,
		runways: rws.flatMap(([le, he, surface, lengthFt, leHdg = null, heHdg = null]) => {
			// One end's heading gives the other's: the opposite direction.
			const opposite = (h: number | null) => (h === null ? null : (h + 180) % 360);
			const headings = [leHdg ?? opposite(heHdg), heHdg ?? opposite(leHdg)];
			return [le, he].flatMap((d, i) => {
				const number = runwayNumber(d);
				return number === null ? [] : [{ designator: d, number, surface, surfaceKind: surfaceKind(surface), lengthM: lengthFt === null ? null : Math.round(lengthFt * M_PER_FT), headingTrue: headings[i] }];
			});
		})
	}));
	return { source: raw.source, date: raw.date, airfields };
}

/**
 * The runway's magnetic heading, as runways are named and ATIS gives wind: its measured true heading
 * less the variation. Without a measured heading, the runway number stands for it (28 is 280°).
 */
export function magneticHeading(end: Pick<RunwayEnd, 'number' | 'headingTrue'>, variation: number | null): number {
	if (end.headingTrue === null) return end.number * 10;
	return toMagnetic(end.headingTrue || 360, variation ?? 0);
}

/** The exact identifier first, then names containing the text. */
export function findAirfields(data: AirfieldData, query: string, limit = 8): Airfield[] {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	const exact = data.airfields.filter((a) => a.ident.toLowerCase() === q);
	if (exact.length) return exact;
	return data.airfields.filter((a) => a.name.toLowerCase().includes(q)).slice(0, limit);
}

let cached: Promise<AirfieldData> | null = null;
/** Loaded on first use. The service worker keeps the file, so this works offline. */
export function loadAirfields(fetcher: typeof fetch = fetch): Promise<AirfieldData> {
	cached ??= fetcher('/airports.json').then((r) => {
		if (!r.ok) throw new Error('The airfield list isn\'t available on this device.');
		return r.json();
	}).then(parseAirfields).catch((e) => { cached = null; throw e; });
	return cached;
}
