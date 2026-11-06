// Compares the app's engine with the separately written Python calculator on many random inputs.
// Results must match within 0.001 before rounding and exactly after it. A person resolves any difference.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Aircraft, CalculationInput } from '../../src/lib/aircraft/schema.ts';
import { validateAircraft } from '../../src/lib/aircraft/validate.ts';
import { calculate } from '../../src/lib/engine/index.ts';

const PER_AIRCRAFT = Number(process.env.REFERENCE_CASES ?? 25000);
const DIR = 'aircraft-examples';

function rng(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomInput(a: Aircraft, r: () => number): CalculationInput {
	const between = (lo: number, hi: number) => lo + r() * (hi - lo);
	const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
	const axisValues = (input: string) => Object.values(a.tables).flatMap((t) => t.axes.filter((x) => x.input === input).flatMap((x) => x.values));
	const loads: CalculationInput['loads'] = {};
	a.stations.forEach((s) => {
		const max = s.maxMass ?? 120;
		loads[s.id] = { mass: r() < 0.25 ? 0 : between(0, max * 1.3) };
		if (s.positions) loads[s.id].position = pick(s.positions).id;
	});
	const fuel: Record<string, number> = {};
	a.tanks.forEach((t) => { fuel[t.id] = r() < 0.1 ? t.capacity : between(0, t.capacity * 1.1); });
	const config = pick(a.configurations);
	const perf = config.performance && config.performance !== 'none' ? config.performance : a.performance;

	// Often lands exactly on a printed axis value, so exact matches get tested too.
	const alts = axisValues('pressureAltitude'), temps = axisValues('temperature');
	const onGrid = r() < 0.35;
	const altUnit = Object.values(a.tables).flatMap((t) => t.axes).find((x) => x.input === 'pressureAltitude')?.unit ?? 'ft';
	const elevation = r() < 0.03 ? null : onGrid && alts.length ? { value: pick(alts), unit: altUnit as 'm' | 'ft' } : { value: between(-200, 6000), unit: pick(['m', 'ft']) as 'm' | 'ft' };
	return {
		configuration: config.id,
		loads,
		fuel,
		burnPlan: pick(a.burnPlans).id,
		flightTimeHours: r() < 0.1 ? 0 : between(0, 6),
		fuelFlow: between(0, 40),
		elevation,
		qnh: r() < 0.03 ? null : onGrid ? 1013.25 : between(960, 1050),
		oat: r() < 0.03 ? null : onGrid && temps.length ? pick(temps) : between(-30, 55),
		windDirection: r() < 0.03 ? null : Math.floor(between(0, 360)),
		windSpeed: r() < 0.03 ? null : r() < 0.2 ? 0 : between(0, 35),
		runwayHeading: r() < 0.03 ? null : Math.floor(between(0, 360)),
		takeoffCondition: pick(perf.takeoff).id,
		landingCondition: pick(perf.landing).id
	};
}

let cases = 0;
const seen: Record<string, number> = {};
const differences: string[] = [];
const work = mkdtempSync(join(tmpdir(), 'reference-'));
try {
	readdirSync(DIR).filter((f) => f.endsWith('.json')).forEach((file, index) => {
		const path = join(DIR, file);
		const v = validateAircraft(JSON.parse(readFileSync(path, 'utf8')));
		if (!v.ok) throw new Error(`${file}: ${v.problems.join('; ')}`);
		const a = v.aircraft, r = rng(20261106 + index);
		const inputs = Array.from({ length: PER_AIRCRAFT }, () => randomInput(a, r));
		const inputPath = join(work, `${file}.jsonl`);
		writeFileSync(inputPath, inputs.map((i) => JSON.stringify(i)).join('\n') + '\n');
		const out = execFileSync('python3', ['-I', 'tools/reference-calculator/calculate.py', path, inputPath], { encoding: 'utf8', maxBuffer: 1 << 30 }).trim().split('\n');
		if (out.length !== inputs.length) throw new Error(`${file}: expected ${inputs.length} results, got ${out.length}`);

		inputs.forEach((input, i) => {
			cases++;
			const app = calculate(a, input), ref = JSON.parse(out[i]);
			const report = (field: string, x: unknown, y: unknown) => differences.push(`${file} case ${i} ${field}: app ${x}, reference ${y}\n  ${JSON.stringify(input)}`);
			const close = (field: string, x: number | null | undefined, y: number | null | undefined, tolerance = 0.001) => {
				if ((x ?? null) === null || (y ?? null) === null) { if ((x ?? null) !== (y ?? null)) report(field, x, y); }
				else if (Math.abs((x as number) - (y as number)) > tolerance) report(field, x, y);
			};
			close('takeoffMass', app.massBalance.takeoff.mass, ref.takeoffMass);
			close('takeoffArm', app.massBalance.takeoff.arm, ref.takeoffArm);
			close('landingMass', app.massBalance.landing.mass, ref.landingMass);
			close('landingArm', app.massBalance.landing.arm, ref.landingArm);
			close('pressureAltitudeFt', app.atmosphere?.pressureAltitudeFt, ref.pressureAltitudeFt);
			close('densityAltitudeFt', app.atmosphere?.densityAltitudeFt, ref.densityAltitudeFt);
			close('headwind', app.wind?.headwind, ref.headwind);
			close('crosswind', app.wind?.crosswind, ref.crosswind);
			const exceeded = [...app.exceeded].sort().join();
			if (exceeded !== [...ref.exceeded].sort().join()) report('exceeded', exceeded, ref.exceeded);
			for (const phase of ['takeoff', 'landing'] as const) {
				const x = app[phase], y = ref[phase];
				seen[`${phase} ${x.status}`] = (seen[`${phase} ${x.status}`] ?? 0) + 1;
				if (x.status !== y.status) { report(`${phase}.status`, x.status, y.status); continue; }
				close(`${phase}.rawTotal`, x.rawTotal, y.rawTotal);
				close(`${phase}.rawGroundRoll`, x.rawGroundRoll, y.rawGroundRoll);
				if ((x.total ?? null) !== (y.total ?? null)) report(`${phase}.total`, x.total, y.total);
				if ((x.groundRoll ?? null) !== (y.groundRoll ?? null)) report(`${phase}.groundRoll`, x.groundRoll, y.groundRoll);
				if (x.status === 'ok' && x.warnings.length !== y.warnings) report(`${phase}.warnings`, x.warnings.join(' | '), y.warnings);
			}
		});
	});
} finally {
	rmSync(work, { recursive: true, force: true });
}

console.log(`Compared ${cases} random inputs.`);
console.log(Object.entries(seen).sort().map(([k, n]) => `  ${k}: ${n}`).join('\n'));
if (differences.length) {
	console.log(`${differences.length} differences. First 15:`);
	differences.slice(0, 15).forEach((d) => console.log(d));
	process.exit(1);
}
console.log('No differences.');
