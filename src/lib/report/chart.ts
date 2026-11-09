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

/** A self-contained SVG for the Report, in the same print colours as the rest of it. */
export function chartSvg(a: Aircraft, results: Results, configuration: string): string {
	const { W, H, L, R, B } = CHART, g = chartGeometry(a, results, configuration);
	const n = (v: number) => v.toFixed(1);
	const text = (px: number, py: number, s: string | number, anchor = 'start', fill = '#5A6876') => `<text x="${n(px)}" y="${n(py)}" text-anchor="${anchor}" font-size="11" fill="${fill}">${s}</text>`;
	const over = results.exceeded.some((id) => /^(takeoff|landing)(Mass|Cg)$/.test(id)), mark = over ? '#A12222' : '#13202D';
	const to = { x: g.x(g.to.arm), y: g.y(g.to.mass) }, ld = { x: g.x(g.ld.arm), y: g.y(g.ld.mass) };
	const parts: string[] = [];
	g.massTicks.forEach((m) => { parts.push(`<line x1="${L}" x2="${W - R}" y1="${n(g.y(m))}" y2="${n(g.y(m))}" stroke="#E1E6EB"/>`, text(L - 6, g.y(m) + 4, m, 'end')); });
	g.armTicks.forEach((v) => parts.push(text(g.x(v), H - B + 16, v, 'middle')));
	parts.push(`<polygon points="${g.polygon}" fill="#EAF2FA" stroke="#1D5C96" stroke-width="2" stroke-linejoin="round"/>`);
	if (g.maxLanding !== null) parts.push(`<line x1="${n(g.x(g.armDomain[0]))}" x2="${n(g.x(g.armDomain[1]))}" y1="${n(g.y(g.maxLanding))}" y2="${n(g.y(g.maxLanding))}" stroke="#7A4D00" stroke-dasharray="5 4"/>`, text(W - R - 2, g.y(g.maxLanding) - 4, `Max landing ${g.maxLanding}`, 'end', '#7A4D00'));
	parts.push(`<line x1="${n(to.x)}" y1="${n(to.y)}" x2="${n(ld.x)}" y2="${n(ld.y)}" stroke="${mark}" stroke-width="1" stroke-dasharray="3 2"/>`);
	parts.push(`<circle cx="${n(to.x)}" cy="${n(to.y)}" r="5" fill="${mark}"/>`, text(to.x + 9, to.y - 4, 'Takeoff', 'start', mark));
	parts.push(`<rect x="${n(ld.x - 4)}" y="${n(ld.y - 4)}" width="8" height="8" fill="#FFFFFF" stroke="${mark}" stroke-width="1.5"/>`, text(ld.x + 9, ld.y + 14, 'Landing', 'start', mark));
	parts.push(text((L + W - R) / 2, H - 5, `CG arm, ${a.units.arm}. Mass, ${a.units.mass}.`, 'middle'));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}
