<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { changeConfiguration, type Calculation, type Field } from '#lib/app/calculation.ts';
	import Card from '../../ui/Card.svelte';
	import Gauge from '../../ui/Gauge.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import StepHeading from './StepHeading.svelte';

	let { aircraft, calc, results, fields, numberField }: {
		aircraft: Aircraft; calc: Calculation; results: Results; fields: Field[]; numberField: Snippet<[Field]>;
	} = $props();

	let combined = $derived(results.massBalance.limits.filter((l) => l.id.startsWith('combined:')));
	let seatStops = $derived(aircraft.stations.filter((s) => s.positions));
</script>

<StepHeading title="Who and what is on board" subtitle={`One field per seat and baggage area, in ${aircraft.units.mass}.`} />

{#if aircraft.configurations.length > 1}
	<Card>
		<Segmented label="Configuration" options={aircraft.configurations.map((c) => ({ id: c.id, label: c.label }))} value={calc.configuration} onchange={(id) => changeConfiguration(aircraft, calc, id)} />
	</Card>
{/if}

<Card title="Seats and baggage">
	<div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
		{#each fields as field (field.key)}{@render numberField(field)}{/each}
	</div>
	{#each combined as limit (limit.id)}
		<div class="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3.5 py-2.5">
			<span class="flex-[1_1_200px] text-sm"><strong>{limit.label}</strong> <span class="text-muted">combined limit</span></span>
			<div class="flex-[1_1_160px]"><Gauge value={limit.value} max={limit.limit ?? 0} label={`${limit.label}, part of the combined limit`} tone={limit.status === 'exceeded' ? 'bad' : 'accent'} /></div>
			<span class={['num text-sm font-semibold', limit.status === 'exceeded' && 'text-bad']}>{limit.value.toFixed(aircraft.display.massDecimals)} of {limit.limit} {aircraft.units.mass}</span>
		</div>
	{/each}
	{#each seatStops as station (station.id)}
		<Segmented label={`${station.label} seat stop`} options={station.positions!.map((p) => ({ id: p.id, label: p.label }))} value={calc.positions[station.id]} onchange={(id) => (calc.positions[station.id] = id)} />
	{/each}
</Card>
