/** The fictional aircraft offered until Data Releases exist. Each is validated before use. */
import dr from '../../../aircraft-examples/test-dr-style.json';
import sr from '../../../aircraft-examples/test-sr22-style.json';
import gl from '../../../aircraft-examples/test-glastar-style.json';
import kf from '../../../aircraft-examples/test-kitfox-style.json';
import type { Aircraft } from '../aircraft/schema.ts';
import { validateAircraft } from '../aircraft/validate.ts';

export const demoAircraft: Aircraft[] = [dr, sr, gl, kf].map((data) => {
	const result = validateAircraft(data);
	if (!result.ok) throw new Error(`Invalid demo aircraft: ${result.problems.join('; ')}`);
	return result.aircraft;
});
