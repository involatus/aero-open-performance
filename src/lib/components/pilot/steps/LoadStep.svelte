<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { changeConfiguration, parse, setByPilot, stationOfField, type Calculation, type Field } from '#lib/app/calculation.ts';
	import { massIn, saveMass, savedFor, stationKind, type SavedMass } from '#lib/app/my-values.ts';
	import Button from '../../ui/Button.svelte';
	import Card from '../../ui/Card.svelte';
	import Gauge from '../../ui/Gauge.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import StepHeading from './StepHeading.svelte';

	let { aircraft, calc, results, fields, numberField, saved, onsaved, onmanage }: {
		aircraft: Aircraft; calc: Calculation; results: Results; fields: Field[]; numberField: Snippet<[Field, Snippet?]>;
		/** The pilot's own values on this device, offered under each seat and baggage field. */
		saved: SavedMass[]; onsaved: (list: SavedMass[]) => void; onmanage: () => void;
	} = $props();

	const unit = $derived(aircraft.units.mass), decimals = $derived(aircraft.display.massDecimals);
	/** The field whose value is being given a name, and the name typed so far. */
	let naming = $state<string | null>(null);
	let name = $state('');
	/** People for seats, things for baggage areas, from the station the field belongs to. */
	const kindOf = (field: Field) => { const s = stationOfField(aircraft, field.key); return s ? stationKind(s) : 'person'; };
	function remember(field: Field) {
		const value = parse(calc.values[field.key]);
		if (value !== null) onsaved(saveMass(saved, name, value, unit, Date.now(), kindOf(field)));
		naming = null; name = '';
	}

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
		{#each fields as field (field.key)}
			{#snippet mine()}
				{@const value = parse(calc.values[field.key])}
				{@const offered = savedFor(saved, kindOf(field))}
				{#if offered.length}
					<div class="flex flex-wrap gap-1.5" role="group" aria-label={`Saved values for ${field.label}`}>
						{#each offered as s (s.id)}
							{@const v = massIn(s, unit, decimals)}
							<button type="button" tabindex="-1" onclick={() => setByPilot(calc, field.key, v)} class={['min-h-9 rounded-full border px-3 text-sm', calc.values[field.key] === v ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line-strong bg-surface text-ink']}>{s.label} <span class="num text-muted">{v}</span></button>
						{/each}
						<button type="button" tabindex="-1" class="min-h-9 border-0 bg-transparent px-1 text-[13px] font-semibold text-accent" onclick={onmanage}>Edit</button>
					</div>
				{/if}
				{#if naming === field.key}
					<form class="flex flex-wrap items-center gap-1.5" onsubmit={(e) => { e.preventDefault(); remember(field); }}>
						<!-- svelte-ignore a11y_autofocus -->
						<input class="min-h-9 min-w-0 flex-[1_1_120px] rounded-lg border border-line-strong bg-surface px-2.5 text-sm" placeholder={kindOf(field) === 'item' ? 'Name, e.g. Flight bag' : 'Name, e.g. Me'} maxlength="30" autofocus bind:value={name} aria-label={`Name for ${value} ${unit}`} />
						<Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>Save {value} {unit}</Button>
						<Button size="sm" onclick={() => { naming = null; name = ''; }}>Cancel</Button>
					</form>
				{:else if value !== null && value > 0 && !offered.some((s) => massIn(s, unit, decimals) === calc.values[field.key])}
					<button type="button" tabindex="-1" class="min-h-8 justify-self-start border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-accent" onclick={() => { naming = field.key; name = ''; }}>Remember {value} {unit} on this device</button>
				{/if}
			{/snippet}
			{@render numberField(field, mine)}
		{/each}
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

