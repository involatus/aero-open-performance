<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { choosePowerSetting, chosenPowerSetting, parse, type Calculation, type Field } from '#lib/app/calculation.ts';
	import { powerSettingDetail } from '#lib/app/presentation.ts';
	import Card from '../../ui/Card.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import StepHeading from './StepHeading.svelte';
	import FuelBar from '../FuelBar.svelte';

	let { aircraft, calc, results, fields, numberField }: {
		aircraft: Aircraft; calc: Calculation; results: Results; fields: Field[]; numberField: Snippet<[Field, Snippet?]>;
	} = $props();

	let tankFields = $derived(fields.filter((f) => f.key.startsWith('fuel:')));
	let flightFields = $derived(fields.filter((f) => !f.key.startsWith('fuel:')));
	let { volume, mass: massUnit } = $derived(aircraft.units);
	const tankOf = (key: string) => aircraft.tanks.find((t) => `fuel:${t.id}` === key)!;
	const m = (x: number) => x.toFixed(aircraft.display.massDecimals);
	const v = (x: number) => x.toFixed(1);

	let atLanding = $derived(aircraft.tanks.reduce((sum, t) => sum + (results.massBalance.fuelAtLanding[t.id] ?? 0), 0));
	let atLandingMass = $derived(aircraft.tanks.reduce((sum, t) => sum + (results.massBalance.fuelAtLanding[t.id] ?? 0) * t.density, 0));
	let atTakeoffMass = $derived(aircraft.tanks.reduce((sum, t) => sum + (parse(calc.values[`fuel:${t.id}`]) ?? 0) * t.density, 0));
	// A power setting from the manual sets the fuel flow. "Other" keeps the flow for the pilot to type.
	let powerOptions = $derived([
		...(aircraft.powerSettings ?? []).map((p) => ({ id: p.id, label: p.label, detail: [powerSettingDetail(p), `${Number(p.fuelFlow.toFixed(1))} ${volume}/h`].filter(Boolean).join(' · ') })),
		{ id: 'other', label: 'Other', detail: 'Type the fuel flow' }
	]);
	function pickPower(id: string) {
		choosePowerSetting(aircraft, calc, id === 'other' ? null : id);
	}
	let onBoard = $derived(aircraft.tanks.reduce((sum, t) => sum + (parse(calc.values[`fuel:${t.id}`]) ?? 0), 0));
	let burnedFrom = $derived(aircraft.tanks.filter((t) => (parse(calc.values[`fuel:${t.id}`]) ?? 0) > (results.massBalance.fuelAtLanding[t.id] ?? 0) + 1e-9).map((t) => t.label));
</script>

{#snippet tankMass(key: string)}
	{@const tank = tankOf(key)}
	<span class="text-xs text-muted"><span class="num">{m((parse(calc.values[key]) ?? 0) * tank.density)} {massUnit}</span> at {Number(tank.density.toPrecision(3))} {massUnit}/{volume}</span>
{/snippet}

<StepHeading title="Fuel and flight" subtitle="Usable fuel per tank at takeoff, and how long you fly. This sets the landing mass and CG." />

<Card title="Tanks">
	<div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
		{#each tankFields as field (field.key)}
			{#snippet extra()}{@render tankMass(field.key)}{/snippet}
			{@render numberField(field, extra)}
		{/each}
	</div>
	{#if aircraft.burnPlans.length > 1}
		<Segmented label="Burn plan" options={aircraft.burnPlans.map((p) => ({ id: p.id, label: p.label }))} value={calc.burnPlan} onchange={(id) => (calc.burnPlan = id)} />
	{/if}
</Card>

<Card title="Flight">
	{#if aircraft.powerSettings?.length}
		<Segmented label="Power setting" options={powerOptions} value={chosenPowerSetting(aircraft, calc)?.id ?? 'other'} onchange={pickPower} minWidth={200} />
	{/if}
	<div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
		{#each flightFields as field (field.key)}{@render numberField(field)}{/each}
	</div>
	<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
		<div class="rounded-[10px] bg-subtle px-3.5 py-3">
			<span class="label-caps">Burned</span><br />
			<span class={['num text-xl font-semibold', results.massBalance.burnExceedsFuel && 'text-bad']}>{v(results.massBalance.burned)}</span> <span class="text-muted">{volume}</span><br />
			<span class="text-[13px] text-muted">{m(atTakeoffMass - atLandingMass)} {massUnit}{burnedFrom.length ? `, from ${burnedFrom.join(' and ').toLowerCase()}` : ''}</span>
		</div>
		<div class="rounded-[10px] bg-accent-soft px-3.5 py-3">
			<span class="label-caps text-accent-strong">At landing</span><br />
			<span class="num text-xl font-semibold">{v(atLanding)}</span> <span class="text-muted">{volume}</span><br />
			<span class="text-[13px] text-ink-2">{m(atLandingMass)} {massUnit}</span>
		</div>
	</div>
	{#if onBoard > 0}
		<FuelBar {onBoard} burned={results.massBalance.burned} reserve={results.massBalance.finalReserve.volume} minutes={results.massBalance.finalReserve.minutes} club={results.massBalance.finalReserve.club} unit={volume} />
	{/if}
	{#if results.massBalance.burnExceedsFuel}<p class="text-[13px] font-semibold text-bad">The flight burns more fuel than the tanks hold.</p>
	{:else if results.exceeded.includes('finalReserve')}<p class="text-[13px] font-semibold text-bad">Lands with less than the final reserve. Take more fuel or plan a shorter flight.</p>{/if}
	<p class="text-[13px] text-muted">Taxi, contingency and alternate fuel aren't included: plan those yourself.</p>
</Card>
