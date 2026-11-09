<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation } from '#lib/engine/index.ts';
	import { CHART, chartGeometry } from '#lib/report/chart.ts';

	let { aircraft, results, configuration }: { aircraft: Aircraft; results: Calculation; configuration: string } = $props();

	const { W, H, L, R, B } = CHART;
	let g = $derived(chartGeometry(aircraft, results, configuration));
	let to = $derived(g.to);
	let ld = $derived(g.ld);
	let exceeded = $derived(results.exceeded.some((id) => id === 'takeoffCg' || id === 'landingCg' || id === 'takeoffMass' || id === 'landingMass'));
	let label = $derived(
		`CG envelope. Takeoff ${to.mass.toFixed(0)} ${aircraft.units.mass} at ${to.arm.toFixed(aircraft.display.armDecimals)} ${aircraft.units.arm}. ` +
		`Landing ${ld.mass.toFixed(0)} ${aircraft.units.mass} at ${ld.arm.toFixed(aircraft.display.armDecimals)} ${aircraft.units.arm}.`
	);
</script>

<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} class="block h-auto w-full">
	<g class="num" font-size="10">
		{#each g.massTicks as m (m)}
			<line x1={L} x2={W - R} y1={g.y(m)} y2={g.y(m)} class="stroke-divider" />
			<text x={L - 6} y={g.y(m) + 4} text-anchor="end" class="fill-muted">{m}</text>
		{/each}
		{#each g.armTicks as a (a)}
			<text x={g.x(a)} y={H - B + 16} text-anchor="middle" class="fill-muted">{a}</text>
		{/each}
	</g>
	<polygon points={g.polygon} stroke-width="2" stroke-linejoin="round" class="fill-accent-soft stroke-accent" />
	{#if g.maxLanding !== null}
		<line x1={g.x(g.armDomain[0])} x2={g.x(g.armDomain[1])} y1={g.y(g.maxLanding)} y2={g.y(g.maxLanding)} stroke-dasharray="5 4" class="stroke-amber" />
		<text x={W - R - 2} y={g.y(g.maxLanding) - 4} text-anchor="end" font-size="10" class="fill-amber">Max landing {g.maxLanding}</text>
	{/if}
	<g class={exceeded ? 'fill-bad stroke-bad' : 'fill-ink stroke-ink'}>
		<line x1={g.x(to.arm)} y1={g.y(to.mass)} x2={g.x(ld.arm)} y2={g.y(ld.mass)} stroke-width="1" stroke-dasharray="3 2" />
		<circle cx={g.x(to.arm)} cy={g.y(to.mass)} r="5" stroke-width="0" />
		<rect x={g.x(ld.arm) - 4} y={g.y(ld.mass) - 4} width="8" height="8" stroke-width="1.5" class="fill-surface" />
		<g font-size="11" stroke-width="0">
			<text x={g.x(to.arm) + 9} y={g.y(to.mass) - 4}>Takeoff</text>
			<text x={g.x(ld.arm) + 9} y={g.y(ld.mass) + 14}>Landing</text>
		</g>
	</g>
	<text x={(L + W - R) / 2} y={H - 4} text-anchor="middle" font-size="10" class="fill-muted">CG arm, {aircraft.units.arm}. Mass, {aircraft.units.mass}.</text>
</svg>
