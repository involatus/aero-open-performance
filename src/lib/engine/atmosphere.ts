/** International Standard Atmosphere formulas, for dry air. See docs/FORMAT.md. */
import { M_PER_FT } from './units.ts';

/** The flight-school rule of thumb, shown beside the exact values so a pilot can compare with their own working. */
export type RuleOfThumb = { pressureAltitudeFt: number; isaC: number; densityAltitudeFt: number | null };
export type Atmosphere = { elevationFt: number; pressureAltitudeFt: number; isaC: number; densityAltitudeFt: number | null; ruleOfThumb: RuleOfThumb };

/**
 * 27 ft per hPa from 1013 hPa, ISA falling 2 °C per 1000 ft from 15 °C, and 120 ft per °C above or below ISA.
 * Display only: the tables always use the exact values.
 */
export function ruleOfThumb(elevationFt: number, qnhHpa: number, oatC: number | null): RuleOfThumb {
	const pressureAltitudeFt = elevationFt + (1013 - qnhHpa) * 27;
	const isaC = 15 - (2 * pressureAltitudeFt) / 1000;
	return { pressureAltitudeFt, isaC, densityAltitudeFt: oatC === null ? null : pressureAltitudeFt + 120 * (oatC - isaC) };
}

export function atmosphere(elevationM: number, qnhHpa: number, oatC: number | null): Atmosphere {
	const elevationFt = elevationM / M_PER_FT;
	const pressureAltitudeFt = elevationFt + 145366.45 * (1 - Math.pow(qnhHpa / 1013.25, 0.190284));
	const isaC = 15 - (1.98 * pressureAltitudeFt) / 1000;
	let densityAltitudeFt: number | null = null;
	if (oatC !== null) {
		const pressureRatio = Math.pow(1 - pressureAltitudeFt / 145366.45, 1 / 0.190284);
		const densityRatio = pressureRatio / ((oatC + 273.15) / 288.15);
		densityAltitudeFt = 145442.16 * (1 - Math.pow(densityRatio, 0.234969));
	}
	return { elevationFt, pressureAltitudeFt, isaC, densityAltitudeFt, ruleOfThumb: ruleOfThumb(elevationFt, qnhHpa, oatC) };
}
