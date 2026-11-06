/** CG chart geometry, shared by the screen and the Report so both always draw the same thing. */
import type { Aircraft } from '../aircraft/schema.ts';
import type { Calculation as Results } from '../engine/index.ts';
import { configurationOf, envelopeArm } from '../engine/mass-balance.ts';

export const CHART = { W: 440, H: 260, L: 50, R: 16, T: 14, B: 38 };

function niceStep(span: number, count: number) {
	const raw = span / count, power = 10 ** Math.floor(Math.log10(raw)), f = raw / power;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
}
function domain(values: number[]): [number, number] {
	const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo || 1) * 0.08;
	return [lo - pad, hi + pad];
}
function ticks([lo, hi]: [number, number], count: number) {
	const step = niceStep(hi - lo, count), out: number[] = [];
	for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
	return out;
}

export function chartGeometry(a: Aircraft, results: Results, configuration: string) {
	const { W, H, L, R, T, B } = CHART;
	const config = configurationOf(a, configuration);
	const envelope = config.envelope ?? a.envelope, limits = config.massLimits ?? a.massLimits;
	const points = envelope.points.map((p) => ({ mass: p.mass, arm: envelopeArm(a, p) }));
	const to = results.massBalance.takeoff, ld = results.massBalance.landing;
	const massDomain = domain([...points.map((p) => p.mass), to.mass, ld.mass]);
	const armDomain = domain([...points.map((p) => p.arm), to.arm, ld.arm]);
	const x = (arm: number) => L + ((arm - armDomain[0]) / (armDomain[1] - armDomain[0])) * (W - L - R);
	const y = (mass: number) => T + ((massDomain[1] - mass) / (massDomain[1] - massDomain[0])) * (H - T - B);
	return {
		x, y, to, ld, armDomain,
		massTicks: ticks(massDomain, 4),
		armTicks: ticks(armDomain, 5),
		polygon: points.map((p) => `${x(p.arm).toFixed(1)},${y(p.mass).toFixed(1)}`).join(' '),
		maxLanding: limits.maxLanding.value < limits.maxTakeoff.value ? limits.maxLanding.value : null
	};
}

/** A self-contained SVG for the Report, using print colours rather than theme tokens. */
export function chartSvg(a: Aircraft, results: Results, configuration: string): string {
	const { W, H, L, R, B } = CHART, g = chartGeometry(a, results, configuration);
	const text = (px: number, py: number, s: string | number, anchor = 'start', extra = '') => `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#566778" ${extra}>${s}</text>`;
	const parts: string[] = [];
	g.massTicks.forEach((m) => { parts.push(`<line x1="${L}" x2="${W - R}" y1="${g.y(m).toFixed(1)}" y2="${g.y(m).toFixed(1)}" stroke="#d5dde4"/>`, text(L - 6, g.y(m) + 4, m, 'end')); });
	g.armTicks.forEach((v) => parts.push(text(g.x(v), H - B + 16, v, 'middle')));
	parts.push(`<polygon points="${g.polygon}" fill="#d9f0e3" stroke="#16663f" stroke-width="1.5"/>`);
	if (g.maxLanding !== null) parts.push(`<line x1="${g.x(g.armDomain[0]).toFixed(1)}" x2="${g.x(g.armDomain[1]).toFixed(1)}" y1="${g.y(g.maxLanding).toFixed(1)}" y2="${g.y(g.maxLanding).toFixed(1)}" stroke="#805300" stroke-dasharray="5 4"/>`, text(W - R - 2, g.y(g.maxLanding) - 4, `Max landing ${g.maxLanding}`, 'end'));
	parts.push(`<line x1="${g.x(g.to.arm).toFixed(1)}" y1="${g.y(g.to.mass).toFixed(1)}" x2="${g.x(g.ld.arm).toFixed(1)}" y2="${g.y(g.ld.mass).toFixed(1)}" stroke="#14578f" stroke-width="2"/>`);
	parts.push(`<circle cx="${g.x(g.to.arm).toFixed(1)}" cy="${g.y(g.to.mass).toFixed(1)}" r="6" fill="#14578f"/>`, text(g.x(g.to.arm) + 9, g.y(g.to.mass) - 5, 'Takeoff', 'start', 'font-weight="bold"'));
	parts.push(`<circle cx="${g.x(g.ld.arm).toFixed(1)}" cy="${g.y(g.ld.mass).toFixed(1)}" r="6" fill="#ffffff" stroke="#14578f" stroke-width="2"/>`, text(g.x(g.ld.arm) + 9, g.y(g.ld.mass) + 16, 'Landing', 'start', 'font-weight="bold"'));
	parts.push(text((L + W - R) / 2, H - 5, `CG arm, ${a.units.arm}. Mass, ${a.units.mass}.`, 'middle'));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}
