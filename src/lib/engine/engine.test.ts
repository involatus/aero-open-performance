import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { validateAircraft, formatIsReadable } from '../aircraft/validate.ts';
import type { Aircraft, CalculationInput } from '../aircraft/schema.ts';
import { calculate, runHandCases } from './index.ts';
import { burnFuel, insideEnvelope } from './mass-balance.ts';
import { bracket, interpolate, type AxisLike } from './interpolate.ts';
import { roundUp } from './performance.ts';
import { atmosphere } from './atmosphere.ts';
import { convertLength, convertMass, convertTemperature } from './units.ts';

const DIR = 'aircraft-examples';
const raw = (name: string) => JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8'));
const load = (name: string): Aircraft => {
	const r = validateAircraft(raw(name));
	if (!r.ok) throw new Error(r.problems.join('\n'));
	return r.aircraft;
};
const NAMES = readdirSync(DIR).map((f) => f.replace('.json', ''));
const baseInput = (a: Aircraft, over: Partial<CalculationInput> = {}): CalculationInput => ({
	configuration: a.configurations[0].id, loads: {}, fuel: {}, burnPlan: a.defaultBurnPlan, flightTimeHours: 0, fuelFlow: 0,
	elevation: { value: 0, unit: 'ft' }, qnh: 1013.25, oat: 15, windDirection: 0, windSpeed: 0, runwayHeading: 0,
	takeoffCondition: 'hard', landingCondition: 'hard', ...over
});

describe('test aircraft files', () => {
	it('has the four agreed aircraft', () => expect(NAMES.sort()).toEqual(['test-dr-style', 'test-glastar-style', 'test-kitfox-style', 'test-sr22-style']));
	it.each(NAMES)('%s is valid and marked fictional', (n) => expect(load(n).fictional).toBe(true));
	it.each(NAMES)('%s passes its hand-calculated cases', (n) => expect(runHandCases(load(n))).toEqual([]));
});

describe('printed values stay exact', () => {
	const axis = (values: number[]): AxisLike => ({ name: 'x', values, below: 'none', above: 'none' });

	it('returns the stored cell for every cell of every table', () => {
		for (const n of NAMES) {
			const a = load(n);
			for (const table of Object.values(a.tables)) {
				for (const cells of [table.outputs.total, table.outputs.groundRoll]) {
					if (!cells) continue;
					const walk = (node: unknown, depth: number, picks: number[]) => {
						if (depth === table.axes.length) {
							const brackets = picks.map((p, i) => bracket(table.axes[i], table.axes[i].values[p])!);
							expect(interpolate(cells, brackets)).toBe(node);
							return;
						}
						(node as unknown[]).forEach((child, i) => walk(child, depth + 1, [...picks, i]));
					};
					walk(cells, 0, []);
				}
			}
		}
	});

	it('is exact even where a + (b - a) * t would drift', () => {
		fc.assert(fc.property(fc.double({ min: 0, max: 5000, noNaN: true }), fc.double({ min: 0, max: 5000, noNaN: true }), (lo, hi) => {
			const b = bracket(axis([0, 1]), 1)!;
			expect(interpolate([lo, hi], [b])).toBe(hi);
		}));
	});

	it('returns printed values through the whole engine', () => {
		const a = load('test-glastar-style'), t = a.tables.takeoff;
		t.axes[0].values.forEach((alt, i) => t.axes[1].values.forEach((oat, j) => {
			const r = calculate(a, baseInput(a, { elevation: { value: alt, unit: 'ft' }, oat }));
			expect(r.takeoff.rawTotal).toBe((t.outputs.total as number[][])[i][j]);
			expect(r.takeoff.total).toBe((t.outputs.total as number[][])[i][j]);
		}));
	});
});

describe('interpolation', () => {
	const cells2 = fc.array(fc.integer({ min: 100, max: 3000 }), { minLength: 4, maxLength: 4 });
	it('stays between the surrounding values', () => {
		fc.assert(fc.property(cells2, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (c, x, y) => {
			const ax: AxisLike = { name: 'a', values: [0, 1], below: 'none', above: 'none' };
			const v = interpolate([[c[0], c[1]], [c[2], c[3]]], [bracket(ax, x)!, bracket(ax, y)!]);
			expect(v).toBeGreaterThanOrEqual(Math.min(...c) - 1e-9);
			expect(v).toBeLessThanOrEqual(Math.max(...c) + 1e-9);
		}));
	});
	it('applies the stated out-of-range rule', () => {
		const ax = (below: AxisLike['below'], above: AxisLike['above']): AxisLike => ({ name: 'a', values: [10, 20], below, above });
		expect(bracket(ax('none', 'none'), 9)).toBeNull();
		expect(bracket(ax('none', 'none'), 21)).toBeNull();
		expect(bracket(ax('nearest', 'none'), 9)).toMatchObject({ low: 0, high: 0, warn: false });
		expect(bracket(ax('none', 'nearestWarn'), 21)).toMatchObject({ low: 1, high: 1, warn: true });
	});
});

describe('rounding', () => {
	it('rounds up but ignores floating-point noise', () => {
		expect(roundUp(500)).toBe(500);
		expect(roundUp(500 + 1e-11)).toBe(500);
		expect(roundUp(500.01)).toBe(501);
		expect(roundUp(0.1 + 0.2 + 499.7)).toBe(500);
	});
	it('never understates and adds at most one unit', () => {
		fc.assert(fc.property(fc.double({ min: 0, max: 20000, noNaN: true }), (x) => {
			const r = roundUp(x);
			expect(r).toBeGreaterThanOrEqual(x - 1e-9);
			expect(r - x).toBeLessThan(1 + 1e-9);
		}));
	});
});

describe('mass and balance', () => {
	const dr = load('test-dr-style');
	it('never loses or creates fuel', () => {
		fc.assert(fc.property(fc.double({ min: 0, max: 50, noNaN: true }), fc.double({ min: 0, max: 50, noNaN: true }), fc.double({ min: 0, max: 120, noNaN: true }), fc.constantFrom('even', 'frontFirst', 'rearFirst'), (f, r, burn, plan) => {
			const { left, exceeds } = burnFuel(dr, { front: f, rear: r }, plan, burn);
			expect(left.front).toBeGreaterThanOrEqual(-1e-9);
			expect(left.rear).toBeGreaterThanOrEqual(-1e-9);
			expect(exceeds).toBe(burn > f + r + 1e-9);
			if (!exceeds) expect(left.front + left.rear).toBeCloseTo(f + r - burn, 8);
			else expect(left.front + left.rear).toBeCloseTo(0, 8);
		}));
	});
	it('passes an emptied tank\'s share to the other tank when burning evenly', () => {
		const { left } = burnFuel(dr, { front: 5, rear: 50 }, 'even', 20);
		expect(left.front).toBeCloseTo(0, 9);
		expect(left.rear).toBeCloseTo(35, 9);
	});
	it('subtracts burned fuel in mass, not volume', () => {
		const r = calculate(dr, baseInput(dr, { fuel: { front: 20, rear: 20 }, flightTimeHours: 1, fuelFlow: 22 }));
		expect(r.massBalance.landing.mass).toBeCloseTo(r.massBalance.takeoff.mass - 22 * 0.72, 9);
		expect(r.massBalance.landing.moment).toBeCloseTo(r.massBalance.takeoff.moment - 11 * 0.72 * -0.2 - 11 * 0.72 * 1.1, 9);
	});
	it('counts a value exactly on a limit as passing', () => {
		const e = dr.envelope;
		expect(insideEnvelope(dr, e, 800, 0.56)).toBe(true);
		expect(insideEnvelope(dr, e, 600, 0.3)).toBe(true);
		expect(insideEnvelope(dr, e, 750, 0.32)).toBe(true);
		expect(insideEnvelope(dr, e, 800.001, 0.4)).toBe(false);
		expect(insideEnvelope(dr, e, 600, 0.299)).toBe(false);
		expect(insideEnvelope(dr, e, 750, 0.319)).toBe(false);
		const atLimit = calculate(dr, baseInput(dr, { loads: { rear: { mass: 100 } } }));
		expect(atLimit.exceeded).not.toContain('station:rear');
		const over = calculate(dr, baseInput(dr, { loads: { rear: { mass: 100.01 } } }));
		expect(over.exceeded).toContain('station:rear');
	});
	it('uses each seat position\'s arm', () => {
		const at = (position: string) => calculate(dr, baseInput(dr, { loads: { pilot: { mass: 100, position } } })).massBalance.takeoff.moment;
		expect(at('rear') - at('forward')).toBeCloseTo(100 * 0.06, 9);
	});
	it('uses a Configuration\'s own weighing and its no-data performance', () => {
		const r = calculate(dr, baseInput(dr, { configuration: 'skis' }));
		expect(r.massBalance.takeoff.mass).toBe(550);
		expect(r.takeoff.status).toBe('noData');
	});
	it('converts percent MAC limits', () => {
		const g = load('test-glastar-style');
		expect(insideEnvelope(g, g.envelope, 1500, 89.4 + 0.14 * 44)).toBe(true);
		expect(insideEnvelope(g, g.envelope, 1500, 89.4 + 0.14 * 44 - 0.01)).toBe(false);
		expect(calculate(g, baseInput(g)).massBalance.takeoff.percentMac).toBeCloseTo(((124000 / 1312 - 89.4) / 44) * 100, 9);
	});
});

describe('warnings', () => {
	it('warns on fixed values only when the inputs differ', () => {
		const k = load('test-kitfox-style');
		expect(calculate(k, baseInput(k)).landing.warnings.join()).not.toContain('Not corrected');
		expect(calculate(k, baseInput(k, { oat: 20 })).landing.warnings.join()).toContain('Not corrected');
	});
	it('says when wind did not change the distance', () => {
		const d = load('test-dr-style');
		expect(calculate(d, baseInput(d)).takeoff.warnings.join()).toContain('did not change');
		const k = load('test-kitfox-style');
		expect(calculate(k, baseInput(k)).takeoff.warnings.join()).not.toContain('did not change');
	});
	it('warns when using the nearest value', () => {
		const k = load('test-kitfox-style');
		const hot = calculate(k, baseInput(k, { oat: 45 }));
		expect(hot.takeoff.status).toBe('ok');
		expect(hot.takeoff.warnings.join()).toContain('outside the table');
	});
	it('warns on crosswind without blocking', () => {
		const d = load('test-dr-style');
		const r = calculate(d, baseInput(d, { windDirection: 90, windSpeed: 20 }));
		expect(r.massBalance.limits.find((l) => l.id === 'crosswind')?.status).toBe('warning');
		expect(r.exceeded).not.toContain('crosswind');
	});
});

describe('wind for the distances', () => {
	const k = load('test-kitfox-style');
	const distances = (over: Partial<CalculationInput>) => {
		const r = calculate(k, baseInput(k, over));
		return [r.takeoff.total, r.takeoff.groundRoll, r.landing.total, r.landing.groundRoll];
	};
	const head = { windDirection: 0, windSpeed: 12 }, tail = { windDirection: 180, windSpeed: 8 };
	it('uses the entered wind by default', () => {
		expect(distances(head)).toEqual(distances({ ...head, windForDistances: 'entered' }));
		expect(distances(head)).not.toEqual(distances({ windSpeed: 0 }));
	});
	it('No wind leaves out a headwind', () => expect(distances({ ...head, windForDistances: 'none' })).toEqual(distances({ windSpeed: 0 })));
	it('Tailwind 3 kt replaces a headwind', () => expect(distances({ ...head, windForDistances: 'tail3' })).toEqual(distances({ windDirection: 180, windSpeed: 3 })));
	it('is never less conservative than the entered wind', () => {
		expect(distances({ ...tail, windForDistances: 'none' })).toEqual(distances(tail));
		expect(distances({ ...tail, windForDistances: 'tail3' })).toEqual(distances(tail));
	});
	it('keeps the entered wind for the crosswind check and the display', () => {
		const d = load('test-dr-style');
		const r = calculate(d, baseInput(d, { windDirection: 90, windSpeed: 20, windForDistances: 'none' }));
		expect(r.wind?.crosswind).toBeCloseTo(20, 9);
		expect(r.massBalance.limits.find((l) => l.id === 'crosswind')?.status).toBe('warning');
		expect(r.distanceWind?.crosswind).toBeCloseTo(20, 9);
		expect(r.distanceWind?.headwind).toBe(0);
	});
});

describe('landing at another airfield', () => {
	// Its landing table has altitude, temperature and a wind correction.
	const k = load('test-sr22-style'), d = load('test-dr-style');
	const place = (over: Partial<NonNullable<CalculationInput['landingAt']>> = {}): NonNullable<CalculationInput['landingAt']> => {
		const i = baseInput(k);
		return { elevation: i.elevation, qnh: i.qnh, oat: i.oat, windDirection: i.windDirection, windSpeed: i.windSpeed, runwayHeading: i.runwayHeading, ...over };
	};
	it('gives the same results as landing at the departure airfield when the conditions match', () => {
		const same = calculate(k, baseInput(k)), at = calculate(k, baseInput(k, { landingAt: place() }));
		expect([at.takeoff.total, at.landing.total, at.landing.groundRoll]).toEqual([same.takeoff.total, same.landing.total, same.landing.groundRoll]);
		expect(same.landingAt).toBeNull();
	});
	it('uses the landing airfield for the landing only', () => {
		const same = calculate(k, baseInput(k));
		const high = calculate(k, baseInput(k, { landingAt: place({ elevation: { value: 3000, unit: 'ft' }, oat: 25 }) }));
		expect(high.takeoff.total).toBe(same.takeoff.total);
		expect(high.landing.total!).toBeGreaterThan(same.landing.total!);
		expect(high.landingAt?.atmosphere?.pressureAltitudeFt).toBeGreaterThan(same.atmosphere!.pressureAltitudeFt);
	});
	it('applies the landing wind and its own wind choice', () => {
		const head = calculate(k, baseInput(k, { landingAt: place({ windDirection: 0, windSpeed: 15, runwayHeading: 0 }) }));
		const none = calculate(k, baseInput(k, { landingAt: place({ windDirection: 0, windSpeed: 15, runwayHeading: 0, windForDistances: 'none' }) }));
		const calm = calculate(k, baseInput(k, { landingAt: place({ windSpeed: 0 }) }));
		expect(head.landing.total!).toBeLessThan(calm.landing.total!);
		expect(none.landing.total).toBe(calm.landing.total);
		expect(none.landingAt?.wind?.headwind).toBeCloseTo(15, 9);
	});
	it('checks the crosswind at each airfield', () => {
		const r = calculate(d, baseInput(d, { windSpeed: 0, landingAt: { ...place(), windDirection: 90, windSpeed: 20, runwayHeading: 0 } }));
		const ids = r.massBalance.limits.map((l) => [l.id, l.label]);
		expect(ids).toContainEqual(['landingCrosswind', 'Crosswind at landing']);
		expect(ids.map(([id]) => id)).not.toContain('crosswind');
	});
});

describe('atmosphere', () => {
	it('gives elevation as pressure altitude at standard QNH', () => expect(atmosphere(1000, 1013.25, 15).pressureAltitudeFt).toBeCloseTo(1000 / 0.3048, 9));
	it('rises when QNH falls', () => expect(atmosphere(0, 1000, null).pressureAltitudeFt).toBeGreaterThan(300));
	it('matches pressure altitude at ISA temperature', () => {
		const a = atmosphere(1000, 1013.25, null), isa = atmosphere(1000, 1013.25, a.isaC);
		expect(Math.abs(isa.densityAltitudeFt! - isa.pressureAltitudeFt)).toBeLessThan(30);
	});
	it('rises with temperature', () => expect(atmosphere(500, 1013.25, 30).densityAltitudeFt!).toBeGreaterThan(atmosphere(500, 1013.25, 10).densityAltitudeFt!));
});

describe('validation', () => {
	const broken = (change: (d: any) => void) => { const d = raw('test-dr-style'); change(d); return validateAircraft(d); };
	it('rejects unknown fields', () => expect(broken((d) => { d.surprise = 1; }).ok).toBe(false));
	it('rejects a missing out-of-range choice', () => expect(broken((d) => { delete d.tables.hard.axes[0].above; }).ok).toBe(false));
	it('rejects a missing source', () => expect(broken((d) => { delete d.massLimits.maxTakeoff.source; }).ok).toBe(false));
	it('rejects an unknown source', () => expect(broken((d) => { d.massLimits.maxTakeoff.source = 'nope'; }).ok).toBe(false));
	it('rejects a table of the wrong shape', () => expect(broken((d) => { d.tables.hard.outputs.total[0].pop(); }).ok).toBe(false));
	it('rejects axes that do not rise', () => expect(broken((d) => { d.tables.hard.axes[0].values = [0, 500, 400, 1500]; }).ok).toBe(false));
	it('rejects a step using a distance before it exists', () => expect(broken((d) => { d.performance.takeoff[0].steps.unshift(d.performance.takeoff[0].steps.pop()); }).ok).toBe(false));
	it('rejects an unknown table', () => expect(broken((d) => { d.performance.takeoff[0].steps[0].table = 'nope'; }).ok).toBe(false));
	it('reads the same or an older format, and refuses a newer one', () => {
		expect(formatIsReadable('0.1.0', '0.1.0')).toBe(true);
		expect(formatIsReadable('0.1.9', '0.1.0')).toBe(true);
		expect(formatIsReadable('0.0.5', '0.1.0')).toBe(true);
		expect(formatIsReadable('0.2.0', '0.1.0')).toBe(false);
		expect(formatIsReadable('1.0.0', '0.1.0')).toBe(false);
		expect(formatIsReadable('nonsense', '0.1.0')).toBe(false);
	});
});

describe('published JSON Schema', () => {
	it('is up to date with the single definition', async () => {
		const { aircraftJsonSchema } = await import('../../../scripts/export-schema.ts');
		expect(JSON.parse(readFileSync('schema/aircraft.schema.json', 'utf8'))).toEqual(JSON.parse(JSON.stringify(aircraftJsonSchema())));
	});
	it('agrees with the app on every test aircraft', async () => {
		const { default: Ajv } = await import('ajv/dist/2020.js');
		const validate = new (Ajv as any)({ strict: false }).compile(JSON.parse(readFileSync('schema/aircraft.schema.json', 'utf8')));
		for (const n of NAMES) expect(validate(raw(n)), JSON.stringify(validate.errors)).toBe(true);
		const bad = raw(NAMES[0]);
		bad.surprise = 1;
		expect(validate(bad)).toBe(false);
	});
	it('uses JSON Schema 2020-12', () => expect(JSON.parse(readFileSync('schema/aircraft.schema.json', 'utf8')).$schema).toContain('2020-12'));
});

describe('unit conversion', () => {
	it('uses the exact constants', () => {
		expect(convertMass(1, 'lb', 'kg')).toBe(0.45359237);
		expect(convertLength(1, 'ft', 'm')).toBe(0.3048);
		expect(convertLength(1, 'in', 'm')).toBe(0.0254);
		expect(convertLength(100, 'cm', 'm')).toBe(1);
		expect(convertTemperature(20, 'C', 'F')).toBe(68);
		expect(convertTemperature(68, 'F', 'C')).toBe(20);
	});
	it('round-trips', () => {
		fc.assert(fc.property(fc.double({ min: 0, max: 20000, noNaN: true }), (x) => {
			expect(convertMass(convertMass(x, 'kg', 'lb'), 'lb', 'kg')).toBeCloseTo(x, 8);
			expect(convertLength(convertLength(x, 'ft', 'm'), 'm', 'ft')).toBeCloseTo(x, 8);
			expect(convertTemperature(convertTemperature(x, 'C', 'F'), 'F', 'C')).toBeCloseTo(x, 8);
		}));
	});
	it('rejects unknown units', () => {
		expect(() => convertMass(1, 'stone', 'kg')).toThrow();
		expect(() => convertLength(1, 'yd', 'm')).toThrow();
		expect(() => convertTemperature(1, 'K', 'C')).toThrow();
	});
});
