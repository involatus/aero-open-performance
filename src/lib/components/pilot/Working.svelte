<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { massBalanceRows, sourceText, workingRows } from '#lib/app/presentation.ts';
	import { lookupView } from '#lib/app/lookup-grid.ts';
	import LookupTable from './LookupTable.svelte';

	let { aircraft, results }: { aircraft: Aircraft; results: Results } = $props();
	let mb = $derived(massBalanceRows(aircraft, results));
	const th = 'label-caps border-b border-line px-2 py-1.5 text-left text-[11px]';
	const td = 'border-b border-divider px-2 py-1.5 align-top';
</script>

<div class="flex flex-col gap-4 text-[13px]">
	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<caption class="pb-1 text-left font-semibold">Mass and balance</caption>
			<thead><tr><th class={th}>Item</th><th class={[th, 'text-right']}>{aircraft.units.mass}</th><th class={[th, 'text-right']}>{aircraft.units.arm}</th><th class={[th, 'text-right']}>Moment</th></tr></thead>
			<tbody class="num">
				{#each mb.rows as row (row.id)}<tr><td class={[td, 'font-sans']}>{row.label}</td><td class={[td, 'text-right']}>{row.mass}</td><td class={[td, 'text-right']}>{row.arm}</td><td class={[td, 'text-right']}>{row.moment}</td></tr>{/each}
				{#each [['Takeoff', mb.takeoff], ['Landing', mb.landing]] as const as [label, r] (label)}
					<tr class="font-semibold"><th class={[td, 'text-left font-sans']}>{label}</th><td class={[td, 'text-right']}>{r.mass}</td><td class={[td, 'text-right']}>{r.arm}</td><td class={[td, 'text-right']}>{r.moment}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#each [['Takeoff', results.takeoff], ['Landing', results.landing]] as const as [title, result] (title)}
		{@const rows = workingRows(aircraft, result)}
		{#if rows.length}
			<div class="overflow-x-auto">
				<table class="w-full border-collapse">
					<caption class="pb-1 text-left font-semibold">{title}, {result.conditionLabel}</caption>
					<thead><tr><th class={th}>Step</th><th class={[th, 'text-right']}>Total</th><th class={[th, 'text-right']}>Ground roll</th></tr></thead>
					<tbody>{#each rows as row, k (k)}<tr><td class={td}>{row.step}{#if row.source}<br /><span class="text-muted">{row.source}</span>{/if}</td><td class={[td, 'num text-right']}>{row.total}</td><td class={[td, 'num text-right']}>{row.groundRoll}</td></tr>{/each}</tbody>
				</table>
			</div>
			{#each result.steps as step, k (k)}
				{@const view = step.lookup && lookupView(aircraft, step.lookup)}
				{#if view}<LookupTable {view} unit={result.unit} source={sourceText(aircraft, step.source)} />{/if}
			{/each}
		{/if}
	{/each}
</div>
