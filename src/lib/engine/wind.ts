/**
 * Wind on a runway: how the entered wind splits along and across it, how variable wind counts,
 * and which wind the distances use when the pilot plans with another one. The runway picker,
 * the engine and the Report all take their wind from here, so they can't disagree.
 */
import type { WindForDistances } from '../aircraft/schema.ts';

/** Along the runway, positive for a headwind and negative for a tailwind, and across it, never negative. In knots. */
export type Wind = { headwind: number; crosswind: number };

/** Variable wind, as a METAR writes it. */
export const VARIABLE_WIND = 'VRB';
/** Where the wind blows from: degrees, or variable. */
export type WindFrom = number | typeof VARIABLE_WIND;

/** Variable wind has no direction, so it counts as a tailwind at its full speed on every runway, with no crosswind. */
export function windComponents(from: WindFrom, speed: number, runwayHeading: number): Wind {
	if (from === VARIABLE_WIND) return { headwind: -speed, crosswind: 0 };
	const angle = ((from - runwayHeading) * Math.PI) / 180;
	return { headwind: speed * Math.cos(angle), crosswind: Math.abs(speed * Math.sin(angle)) };
}

/** The headwind each choice plans with. None for the entered wind. */
const CHOSEN_HEADWIND: Record<WindForDistances, number | null> = { entered: null, none: 0, tail3: -3 };

/**
 * A pilot may plan with no wind or a 3 kt tailwind instead of the entered wind, for example when the
 * METAR is from another field. The choice is the pilot's and is used as chosen, even where it ignores a
 * stronger entered tailwind; the app and the Report then say so. The crosswind stays the entered one.
 */
export function windForDistances(wind: Wind | null, choice: WindForDistances = 'entered'): Wind | null {
	const chosen = CHOSEN_HEADWIND[choice];
	if (!wind || chosen === null) return wind;
	return { headwind: chosen, crosswind: wind.crosswind };
}

/** The pilot's choice leaves out a stronger entered tailwind, so the distances are shorter than with the entered wind. */
export function ignoresEnteredTailwind(wind: Wind | null, choice: WindForDistances): boolean {
	const chosen = CHOSEN_HEADWIND[choice];
	return chosen !== null && !!wind && wind.headwind < chosen - 1e-9;
}
