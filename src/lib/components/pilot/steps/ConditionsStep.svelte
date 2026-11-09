<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { ToggleGroup } from 'bits-ui';
	import type { Performance } from '#lib/aircraft/schema.ts';
	import { findAirfields, loadAirfields, type Airfield, type RunwayEnd } from '#lib/airfield/airfields.ts';
	import { lookUpWeather } from '#lib/weather/lookup.ts';
	import type { WeatherQuery } from '#lib/weather/provider.ts';
	import {
		OLD_CALCULATION_DAYS, OLD_REPORT_MINUTES, WEATHER_KEYS, applyAirfield, applyRunway, applyWeather, conditionCorrections, confirmWeather,
		isOldCalculation, reportAgeMinutes, type Calculation, type Field
	} from '#lib/app/calculation.ts';
	import Button from '../../ui/Button.svelte';
	import Card from '../../ui/Card.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import StepHeading from './StepHeading.svelte';

	let { calc, perf, fields, numberField, closePad }: {
		calc: Calculation; perf: Performance | null; fields: Field[]; numberField: Snippet<[Field]>;
		closePad: () => void;
	} = $props();

	let now = $state(Date.now());
	// Starts from the saved airfield; the page remounts this step for each calculation.
	let airfieldQuery = $state(untrack(() => calc.airfield?.ident ?? ''));
	let airfieldMatches = $state<Airfield[]>([]);
	let airfieldMessage = $state('');
	let airfieldDate = $state(untrack(() => calc.airfield?.date ?? ''));
	let airfieldFound = $state<Airfield | null>(null);
	let weatherBusy = $state(false);
	let weatherMessage = $state('');

	let placeFields = $derived(fields.filter((f) => f.key === 'elev' || f.key === 'rwy'));
	let weatherFields = $derived(fields.filter((f) => WEATHER_KEYS.includes(f.key)));
	let metarAge = $derived(reportAgeMinutes(calc.weather, now));
	let weatherToConfirm = $derived(WEATHER_KEYS.filter((k) => calc.status[k] === 'pre').length);
	let showRunways = $derived(airfieldFound !== null && calc.airfield?.ident === airfieldFound.ident);

	// The runway list isn't saved with the calculation, so it is looked up again on return to this step.
	onMount(() => {
		const ident = calc.airfield?.ident;
		if (!ident) return;
		loadAirfields().then((data) => { airfieldFound = data.airfields.find((a) => a.ident === ident) ?? null; }).catch(() => {});
	});

	async function findAirfield() {
		airfieldMessage = ''; airfieldMatches = [];
		try {
			const data = await loadAirfields();
			airfieldDate = data.date;
			const found = findAirfields(data, airfieldQuery);
			if (found.length === 1) chooseAirfield(found[0]);
			else if (found.length) airfieldMatches = found;
			else airfieldMessage = 'Not in the airfield list. Enter the elevation and runway by hand.';
		} catch (e) { airfieldMessage = `${(e as Error).message} Enter the elevation and runway by hand.`; }
	}
	function chooseAirfield(a: Airfield) {
		airfieldFound = a; airfieldMatches = []; airfieldQuery = a.ident;
		applyAirfield(calc, a, airfieldDate);
	}
	function chooseRunway(designator: string) {
		const end = airfieldFound?.runways.find((r) => r.designator === designator);
		if (end) applyRunway(calc, end);
	}

	async function loadWeather(query: WeatherQuery) {
		if (weatherBusy) return;
		const target = calc;
		weatherBusy = true; weatherMessage = '';
		closePad();
		const result = await lookUpWeather(query);
		if (result.ok) { now = Date.now(); applyWeather(target, result.report, now); } else weatherMessage = result.message;
		weatherBusy = false;
	}
	const getStationWeather = () => loadWeather({ station: calc.values.station ?? '' });
	/** From the chosen airfield when there is one, so a field without a METAR gets its nearest station. */
	function getNearestWeather() {
		weatherMessage = '';
		if (airfieldFound && calc.airfield?.ident === airfieldFound.ident) { loadWeather({ lat: airfieldFound.lat, lon: airfieldFound.lon }); return; }
		if (!navigator.geolocation) { weatherMessage = 'This device can\'t share its location. Enter a station code instead.'; return; }
		weatherBusy = true;
		navigator.geolocation.getCurrentPosition(
			(p) => { weatherBusy = false; loadWeather({ lat: p.coords.latitude, lon: p.coords.longitude }); },
			() => { weatherBusy = false; weatherMessage = 'Location isn\'t available. Enter a station code instead.'; },
			{ timeout: 10000, maximumAge: 300000 }
		);
	}

	const surfaceText = (end: RunwayEnd) => {
		const text = end.surfaceKind === 'unknown' ? end.surface || 'Surface unknown' : end.surfaceKind;
		return text.charAt(0).toUpperCase() + text.slice(1);
	};
	const heading = (end: RunwayEnd) => `${String(end.number * 10).padStart(3, '0')}°`;
	const textInput = 'min-h-[52px] w-full rounded-lg border border-line-strong bg-surface px-3.5 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-ring';
	const enter = (action: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); action(); } };
</script>

<StepHeading title="Conditions" subtitle="Departure airfield, weather and runway surface." />

{#if isOldCalculation(calc, now)}<div class="banner unk" role="status">This calculation is more than {OLD_CALCULATION_DAYS} days old. Get fresh weather.</div>{/if}

<Card title="Airfield and runway">
	{#snippet actions()}<span class="text-[13px] text-muted">From OurAirports. Check against the AIP.</span>{/snippet}
	<div class="flex flex-wrap items-end gap-3">
		<label class="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
			<span class="label-caps">Departure airfield</span>
			<input
				id="f-airfield" type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off"
				placeholder="ICAO code or name" bind:value={airfieldQuery} onfocus={closePad} onkeydown={enter(findAirfield)}
				class={[textInput, 'num text-xl font-semibold tracking-[0.06em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case']}
			/>
		</label>
		<Button size="lg" disabled={airfieldQuery.trim().length < 2} onclick={findAirfield}>Find</Button>
	</div>
	{#if airfieldMessage}<div class="banner unk" role="status">{airfieldMessage}</div>{/if}
	{#if airfieldMatches.length}
		<div class="flex flex-wrap gap-2">
			{#each airfieldMatches as a (a.ident)}<Button onclick={() => chooseAirfield(a)}><span class="num">{a.ident}</span> {a.name}</Button>{/each}
		</div>
	{/if}
	{#if showRunways && airfieldFound}
		<div class="flex flex-col gap-1.5">
			<p id="airfield-found" class="text-[13px] text-ink-2"><strong>{airfieldFound.ident} {airfieldFound.name}</strong>{#if airfieldFound.elevationFt !== null}{' · '}<span class="num">{airfieldFound.elevationFt} ft</span>{/if} · list of {airfieldDate}</p>
			<span class="label-caps" id="runway-label">Runway</span>
			<ToggleGroup.Root type="single" value={calc.airfield?.runway?.designator ?? ''} onValueChange={(d) => { if (d) chooseRunway(d); }} aria-labelledby="runway-label" class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
				{#each airfieldFound.runways as end (end.designator)}
					<ToggleGroup.Item
						value={end.designator}
						class="group flex min-h-14 flex-col justify-center gap-px rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-left font-normal text-ink data-[state=on]:border-2 data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:px-[11px] data-[state=on]:text-accent-strong"
					>
						<span><span class="num text-xl font-semibold">{end.designator}</span> <span class="num text-[13px] text-muted group-data-[state=on]:text-inherit">{heading(end)}</span></span>
						<span class="text-[13px] text-ink-2 group-data-[state=on]:text-inherit">{surfaceText(end)}{end.lengthM ? ` · ${end.lengthM} m` : ''}</span>
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</div>
	{/if}
	<div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
		{#each placeFields as field (field.key)}{@render numberField(field)}{/each}
	</div>
</Card>

<Card title="Weather">
	<div class="flex flex-wrap items-end gap-2">
		<label class="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5">
			<span class="label-caps">Weather station</span>
			<input
				id="f-station" type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" maxlength="4"
				placeholder="e.g. LSZH" bind:value={calc.values.station} onfocus={closePad} onkeydown={enter(getStationWeather)}
				class={[textInput, 'num text-lg font-semibold tracking-[0.06em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case']}
			/>
		</label>
		<Button size="lg" disabled={weatherBusy} onclick={getStationWeather}>{weatherBusy ? 'Loading' : 'Get METAR'}</Button>
		<Button size="lg" disabled={weatherBusy} onclick={getNearestWeather}>Nearest</Button>
	</div>
	{#if weatherMessage}<div class="banner unk" role="status">{weatherMessage}</div>{/if}
	{#if calc.weather}
		<div class="metar flex flex-col gap-1 rounded-lg bg-subtle px-3.5 py-3">
			<code class="raw num text-sm break-words">{calc.weather.raw}</code>
			<span class="text-[13px] text-muted">{calc.weather.stationName ?? calc.weather.station}{calc.weather.distanceKm !== null ? `, ${calc.weather.distanceKm.toFixed(1)} km away` : ', on the field'}{metarAge !== null ? ` · ${metarAge} minutes old` : ''}</span>
			{#if metarAge !== null && metarAge > OLD_REPORT_MINUTES}<div class="banner notsent mt-1" role="alert">This report is {metarAge} minutes old. Check it is still valid, or enter current values.</div>{/if}
			{#each calc.weather.flags as flag (flag)}<p class="flag text-sm font-semibold text-amber">{flag}</p>{/each}
		</div>
	{/if}
	<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
		{#each weatherFields as field (field.key)}{@render numberField(field)}{/each}
	</div>
	{#if weatherToConfirm}
		<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-bg py-2.5 pr-2.5 pl-3.5">
			<span class="text-amber-ink"><strong>{weatherToConfirm} value{weatherToConfirm > 1 ? 's' : ''} from the METAR</strong> still need{weatherToConfirm > 1 ? '' : 's'} your check.</span>
			<Button variant="dark" onclick={() => confirmWeather(calc)}>I checked them, confirm</Button>
		</div>
	{/if}
</Card>

{#if perf}
	<Card title="Runway surface" description={calc.airfield?.runway ? `Runway ${calc.airfield.runway.designator} is ${calc.airfield.runway.surface || 'of unknown surface'} in the airfield list. Choose the matching condition.` : 'Choose the condition that matches the runway.'}>
		{#each [['takeoff', 'Takeoff', perf.takeoff, calc.takeoffCondition], ['landing', 'Landing', perf.landing, calc.landingCondition]] as const as [phase, label, list, chosen] (phase)}
			{@const corrections = conditionCorrections(list.find((c) => c.id === chosen))}
			<div class="flex flex-col gap-1">
				<Segmented inline {label} options={list.map((c) => ({ id: c.id, label: c.label }))} value={chosen} onchange={(id) => { if (phase === 'takeoff') calc.takeoffCondition = id; else calc.landingCondition = id; }} />
				<p class="text-[13px] text-muted sm:pl-[92px]">{corrections.length ? `Corrections: ${corrections.join('; ')}.` : 'No correction beyond the table and wind.'}</p>
			</div>
		{/each}
	</Card>
{/if}
