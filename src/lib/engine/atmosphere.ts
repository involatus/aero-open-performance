/** International Standard Atmosphere formulas, for dry air. See docs/FORMAT.md. */
import { M_PER_FT } from './units.ts';

export type Atmosphere = { elevationFt: number; pressureAltitudeFt: number; isaC: number; densityAltitudeFt: number | null };

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
	return { elevationFt, pressureAltitudeFt, isaC, densityAltitudeFt };
}
