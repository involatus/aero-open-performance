<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Performance } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { OLD_CALCULATION_DAYS, conditionCorrections, isOldCalculation, keyAt, type Calculation, type Field } from '#lib/app/calculation.ts';
	import Card from '../../ui/Card.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import PlaceConditions from './PlaceConditions.svelte';
	import StepHeading from './StepHeading.svelte';

	let { calc, results, perf, fields, numberField, closePad }: {
		calc: Calculation; results: Results; perf: Performance | null; fields: Field[]; numberField: Snippet<[Field]>;
		closePad: () => void;
	} = $props();

	const now = Date.now();
	const fieldsAt = (place: 'departure' | 'landing') => fields.filter((f) => (place === 'landing') === f.key.startsWith(keyAt('landing', '')));
	/** What the airfield list says about each chosen runway, to help choose the matching condition. */
	let surfaceNote = $derived.by(() => {
		const line = (r: NonNullable<Calculation['airfield']>['runway'] | undefined, name: string) => (r ? `${name} ${r.designator} is ${r.surface || 'of unknown surface'} in the airfield list.` : '');
		if (!calc.landingElsewhere) return line(calc.airfield?.runway, 'Runway');
		return [line(calc.airfield?.runway, 'Departure runway'), line(calc.landingAirfield?.runway, 'Landing runway')].filter(Boolean).join(' ');
	});
</script>

<StepHeading title="Conditions" subtitle={calc.landingElsewhere ? 'Departure and landing airfields, weather and runway surface.' : 'Departure airfield, weather and runway surface.'} />

{#if isOldCalculation(calc, now)}<div class="banner unk" role="status">This calculation is more than {OLD_CALCULATION_DAYS} days old. Get fresh weather.</div>{/if}

<PlaceConditions place="departure" named={!!calc.landingElsewhere} {calc} {results} fields={fieldsAt('departure')} {numberField} {closePad} />

<Card title="Landing">
	<Segmented
		inline label="Landing at"
		options={[{ id: 'same', label: 'Departure airfield' }, { id: 'elsewhere', label: 'Another airfield' }]}
		value={calc.landingElsewhere ? 'elsewhere' : 'same'}
		onchange={(id) => { closePad(); calc.landingElsewhere = id === 'elsewhere'; }}
	/>
	<p class="text-[13px] text-muted sm:pl-[92px]">{calc.landingElsewhere ? 'The landing distance uses the landing airfield\'s elevation, runway and weather. The takeoff keeps the departure values.' : 'The landing distance uses the departure airfield\'s elevation, runway and weather.'}</p>
</Card>

{#if calc.landingElsewhere}
	<PlaceConditions place="landing" named {calc} {results} fields={fieldsAt('landing')} {numberField} {closePad} />
{/if}

{#if perf}
	<Card title="Runway surface" description={surfaceNote ? `${surfaceNote} Choose the matching condition.` : 'Choose the condition that matches the runway.'}>
		{#each [['takeoff', 'Takeoff', perf.takeoff, calc.takeoffCondition], ['landing', 'Landing', perf.landing, calc.landingCondition]] as const as [phase, label, list, chosen] (phase)}
			{@const corrections = conditionCorrections(list.find((c) => c.id === chosen))}
			<div class="flex flex-col gap-1">
				<Segmented inline {label} options={list.map((c) => ({ id: c.id, label: c.label }))} value={chosen} onchange={(id) => { if (phase === 'takeoff') calc.takeoffCondition = id; else calc.landingCondition = id; }} />
				<p class="text-[13px] text-muted sm:pl-[92px]">{corrections.length ? `Corrections: ${corrections.join('; ')}.` : 'No correction beyond the table and wind.'}</p>
			</div>
		{/each}
	</Card>
{/if}
