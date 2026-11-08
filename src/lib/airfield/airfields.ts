/**
 * Airfields from OurAirports, a community database kept on the device for offline use.
 * Every value it gives is a Prefilled Value the pilot checks against official sources.
 */
export type RunwayEnd = { designator: string; number: number; surface: string; surfaceKind: SurfaceKind; lengthM: number | null };
export type Airfield = { ident: string; name: string; elevationFt: number | null; lat: number; lon: number; runways: RunwayEnd[] };
export type AirfieldData = { source: string; date: string; airfields: Airfield[] };
export type SurfaceKind = 'paved' | 'grass' | 'gravel' | 'water' | 'unknown';

type Raw = { source: string; date: string; airports: [string, string, number | null, number, number, [string, string, string, number | null][]][] };

const KIND: [RegExp, SurfaceKind][] = [
	[/^(asp|asph|bit|con|conc|pem|tar|tarmac|paved|asphalt|concrete)/i, 'paved'],
	[/^(turf|grs|grass|gras|g$|gre)/i, 'grass'],
	[/^(gvl|grv|gravel)/i, 'gravel'],
	[/^water/i, 'water']
];
export function surfaceKind(raw: string): SurfaceKind {
	return KIND.find(([re]) => re.test(raw.trim()))?.[1] ?? 'unknown';
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
		runways: rws.flatMap(([le, he, surface, lengthFt]) => [le, he].flatMap((d) => {
			const number = runwayNumber(d);
			return number === null ? [] : [{ designator: d, number, surface, surfaceKind: surfaceKind(surface), lengthM: lengthFt === null ? null : Math.round(lengthFt * 0.3048) }];
		}))
	}));
	return { source: raw.source, date: raw.date, airfields };
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
