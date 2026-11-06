<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation } from '#lib/engine/index.ts';
	import { CHART, chartGeometry } from '#lib/report/chart.ts';

	let { aircraft, results, configuration }: { aircraft: Aircraft; results: Calculation; configuration: string } = $props();

	const { W, H, L, R, B } = CHART;
	let g = $derived(chartGeometry(aircraft, results, configuration));
	let to = $derived(g.to);
	let ld = $derived(g.ld);
	let x = $derived(g.x);
	let y = $derived(g.y);
	let massTicks = $derived(g.massTicks);
	let armTicks = $derived(g.armTicks);
	let polygon = $derived(g.polygon);
	let armDomain = $derived(g.armDomain);
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
	{#if g.maxLanding !== null}
		<line x1={x(armDomain[0])} x2={x(armDomain[1])} y1={y(g.maxLanding)} y2={y(g.maxLanding)} stroke="var(--amber)" stroke-dasharray="5 4" />
		<text x={W - R - 2} y={y(g.maxLanding) - 4} text-anchor="end">Max landing {g.maxLanding}</text>
	{/if}
	<line x1={x(to.arm)} y1={y(to.mass)} x2={x(ld.arm)} y2={y(ld.mass)} stroke="var(--accent)" stroke-width="2" />
	<circle cx={x(to.arm)} cy={y(to.mass)} r="6" fill="var(--accent)" />
	<text class="lbl" x={x(to.arm) + 9} y={y(to.mass) - 5}>Takeoff</text>
	<circle cx={x(ld.arm)} cy={y(ld.mass)} r="6" fill="var(--panel)" stroke="var(--accent)" stroke-width="2" />
	<text class="lbl" x={x(ld.arm) + 9} y={y(ld.mass) + 16}>Landing</text>
	<text x={(L + W - R) / 2} y={H - 5} text-anchor="middle">CG arm, {aircraft.units.arm}. Mass, {aircraft.units.mass}.</text>
</svg>
