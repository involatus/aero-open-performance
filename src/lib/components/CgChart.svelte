<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation } from '#lib/engine/index.ts';
	import { configurationOf, envelopeArm } from '#lib/engine/mass-balance.ts';

	let { aircraft, results, configuration }: { aircraft: Aircraft; results: Calculation; configuration: string } = $props();

	const W = 440, H = 260, L = 50, R = 16, T = 14, B = 38;
	let config = $derived(configurationOf(aircraft, configuration));
	let envelope = $derived(config.envelope ?? aircraft.envelope);
	let limits = $derived(config.massLimits ?? aircraft.massLimits);
	let points = $derived(envelope.points.map((p) => ({ mass: p.mass, arm: envelopeArm(aircraft, p) })));
	let to = $derived(results.massBalance.takeoff);
	let ld = $derived(results.massBalance.landing);

	function niceStep(span: number, count: number) {
		const raw = span / count, power = 10 ** Math.floor(Math.log10(raw)), f = raw / power;
		return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
	}
	function domain(values: number[]) {
		const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo || 1) * 0.08;
		return [lo - pad, hi + pad];
	}
	let massDomain = $derived(domain([...points.map((p) => p.mass), to.mass, ld.mass]));
	let armDomain = $derived(domain([...points.map((p) => p.arm), to.arm, ld.arm]));
	let x = $derived((arm: number) => L + ((arm - armDomain[0]) / (armDomain[1] - armDomain[0])) * (W - L - R));
	let y = $derived((mass: number) => T + ((massDomain[1] - mass) / (massDomain[1] - massDomain[0])) * (H - T - B));
	function ticks([lo, hi]: number[], count: number) {
		const step = niceStep(hi - lo, count), out: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
		return out;
	}
	let massTicks = $derived(ticks(massDomain, 4));
	let armTicks = $derived(ticks(armDomain, 5));
	let polygon = $derived(points.map((p) => `${x(p.arm).toFixed(1)},${y(p.mass).toFixed(1)}`).join(' '));
	let landingLine = $derived(limits.maxLanding.value < limits.maxTakeoff.value);
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`CG envelope. Takeoff ${to.mass.toFixed(0)} ${aircraft.units.mass} at ${to.arm.toFixed(aircraft.display.armDecimals)} ${aircraft.units.arm}. Landing ${ld.mass.toFixed(0)} ${aircraft.units.mass} at ${ld.arm.toFixed(aircraft.display.armDecimals)} ${aircraft.units.arm}.`}>
	{#each massTicks as m (m)}
		<line x1={L} x2={W - R} y1={y(m)} y2={y(m)} stroke="var(--line)" />
		<text x={L - 6} y={y(m) + 4} text-anchor="end">{m}</text>
	{/each}
	{#each armTicks as a (a)}
		<text x={x(a)} y={H - B + 16} text-anchor="middle">{a}</text>
	{/each}
	<polygon points={polygon} fill="var(--good-bg)" stroke="var(--good)" stroke-width="1.5" />
	{#if landingLine}
		<line x1={x(armDomain[0])} x2={x(armDomain[1])} y1={y(limits.maxLanding.value)} y2={y(limits.maxLanding.value)} stroke="var(--amber)" stroke-dasharray="5 4" />
		<text x={W - R - 2} y={y(limits.maxLanding.value) - 4} text-anchor="end">Max landing {limits.maxLanding.value}</text>
	{/if}
	<line x1={x(to.arm)} y1={y(to.mass)} x2={x(ld.arm)} y2={y(ld.mass)} stroke="var(--accent)" stroke-width="2" />
	<circle cx={x(to.arm)} cy={y(to.mass)} r="6" fill="var(--accent)" />
	<text class="lbl" x={x(to.arm) + 9} y={y(to.mass) - 5}>Takeoff</text>
	<circle cx={x(ld.arm)} cy={y(ld.mass)} r="6" fill="var(--panel)" stroke="var(--accent)" stroke-width="2" />
	<text class="lbl" x={x(ld.arm) + 9} y={y(ld.mass) + 16}>Landing</text>
	<text x={(L + W - R) / 2} y={H - 5} text-anchor="middle">CG arm, {aircraft.units.arm}. Mass, {aircraft.units.mass}.</text>
</svg>
