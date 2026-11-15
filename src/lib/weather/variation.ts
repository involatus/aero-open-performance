/**
 * Magnetic variation, so a METAR's true wind can be compared with runways and ATIS, which are magnetic.
 * The World Magnetic Model (NOAA and BGS, WMM2025), bundled, so it works offline.
 */
import geomagnetism from 'geomagnetism';

/** Variation in degrees, east positive, at a place and date. Null if the model can't give one. */
export function variationAt(lat: number, lon: number, date: Date): number | null {
	try {
		const decl = geomagnetism.model(date).point([lat, lon]).decl;
		return Number.isFinite(decl) ? decl : null;
	} catch {
		return null;
	}
}

/** A true direction as magnetic, in whole degrees from 1 to 360 as winds are given. Calm (0) stays 0. */
export function toMagnetic(trueDegrees: number, variation: number): number {
	if (trueDegrees === 0) return 0;
	const m = Math.round(trueDegrees - variation) % 360;
	return m <= 0 ? m + 360 : m;
}
