<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { Collapsible, ToggleGroup } from 'bits-ui';
	import type { WindForDistances } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { WIND_CHOICES, landingConditions, windText } from '#lib/app/presentation.ts';
	import { ignoresEnteredTailwind } from '#lib/engine/wind.ts';
	import { findAirfields, loadAirfields, magneticHeading, type Airfield, type RunwayEnd } from '#lib/airfield/airfields.ts';
	import { lookUpWeather } from '#lib/weather/lookup.ts';
	import { distancesUseText, nearestFrom, stationLine, variationFor, weatherConfirmed, weatherOnReturn, weatherRows, type WeatherRow } from '#lib/app/place-weather.ts';
	import type { WeatherQuery } from '#lib/weather/provider.ts';
	import {
		OLD_REPORT_MINUTES, WEATHER_KEYS, airfieldAt, applyAirfield, applyRunway, applyWeather, confirmWeather, isVariableWind, keyAt, unconfirmWeather, weatherItemKey,
		chosenRunway, degrees, isFromMetar, parse, runwayAt, setWindChoice, reportAgeMinutes, runwayWindText, runwayWinds, weatherAt, windChoiceAt, type Calculation, type Field, type Place
	} from '#lib/app/calculation.ts';
	import Button from '../../ui/Button.svelte';
	import Card from '../../ui/Card.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import Icon from '../../ui/Icon.svelte';
	import InfoTip from '../../ui/InfoTip.svelte';

	/** One airfield's runway and weather: the departure, or the landing when it is elsewhere. */
	let { place, named, calc, results, fields, numberField, closePad }: {
		place: Place;
		/** Says "Departure" or "Landing" in the titles, when there are two airfields. */
		named: boolean;
		calc: Calculation; results: Results; fields: Field[]; numberField: Snippet<[Field]>;
		closePad: () => void;
	} = $props();

	const k = (key: string) => keyAt(place, key);
	/** Element ids: the departure keeps the plain ones. */
	const idOf = (name: string) => (place === 'landing' ? `land-${name}` : name);
	let word = $derived(place === 'landing' ? 'Landing' : 'Departure');

	let now = $state(Date.now());
	// Starts from the saved airfield; the page remounts this step for each calculation.
	let airfieldQuery = $state(untrack(() => airfieldAt(calc, place)?.ident ?? ''));
	let airfieldMatches = $state<Airfield[]>([]);
	let airfieldMessage = $state('');
	let airfieldDate = $state(untrack(() => airfieldAt(calc, place)?.date ?? ''));
	let airfieldFound = $state<Airfield | null>(null);
	let weatherBusy = $state(false);
	let weatherMessage = $state('');
	/** Says when the app fetched or refreshed the weather by itself, so nothing changes unseen. */
	let weatherNote = $state('');

	let chosen = $derived(airfieldAt(calc, place));
	let weather = $derived(weatherAt(calc, place));
	let at = $derived(place === 'landing' ? landingConditions(results) : results);
	let placeFields = $derived(fields.filter((f) => f.key === k('elev') || f.key === k('rwy')));
	let weatherFields = $derived(fields.filter((f) => WEATHER_KEYS.some((w) => f.key === k(w))));
	let metarAge = $derived(reportAgeMinutes(weather, now));
	let weatherToConfirm = $derived(WEATHER_KEYS.filter((w) => calc.status[k(w)] === 'pre').length);
	let windChoice = $derived<WindForDistances>(windChoiceAt(calc, place));
	// Each choice shows only what it gives; the line under them says what the distances use.
	let windOptions = $derived.by(() => {
		const entered = windText(at.wind, isVariableWind(calc, place));
		return [
			{ id: 'entered', label: WIND_CHOICES.entered, detail: entered ? entered.headline : 'Enter the wind' },
			{ id: 'none', label: WIND_CHOICES.none, detail: '0 kt' },
			{ id: 'tail3', label: WIND_CHOICES.tail3, detail: '3 kt tail' }
		];
	});
	let distancesUse = $derived(distancesUseText(at.distanceWind, runwayAt(calc, place)?.number ?? null));

	/** The elevation and runway fields stay folded away once a runway from the list set them, until the pilot asks to change them. */
	let changingPlace = $state(false);
	let placeSet = $derived(!!chosen?.runway && placeFields.every((f) => parse(calc.values[f.key]) !== null && calc.status[f.key] !== 'pre'));

	/** The weather as a short list; a row opens its field when changed, or when the METAR didn't give its value. */
	let rows = $derived(weatherRows(calc, place));
	/** Change opens a row, Done closes it. Untouched, a row is a summary only while all its values are the METAR's. */
	let opened = $state<Record<string, boolean>>({});
	const rowOpen = (row: WeatherRow) => row.value === null || (opened[row.id] ?? !row.fromMetar);
	const toggleRow = (row: WeatherRow) => { opened = { ...opened, [row.id]: !rowOpen(row) }; };
	let windHint = $derived(weatherFields.find((f) => f.key === k('wdir'))?.hint);
	/** Confirmed: every value from the METAR is checked and at least one came from it. */
	let confirmed = $derived(weatherConfirmed(calc, place));
	let showRunways = $derived(airfieldFound !== null && chosen?.ident === airfieldFound.ident);
	let showPlaceFields = $derived(changingPlace || !showRunways || !placeSet);
	/** The airfield's variation: the METAR's true wind and the runways' measured true headings both become magnetic. */
	let fieldVariation = $derived(airfieldFound ? variationFor(airfieldFound, now) : null);
	let runwayWind = $derived(airfieldFound ? runwayWinds(airfieldFound.runways.map((r) => ({ ...r, heading: magneticHeading(r, fieldVariation) })), calc.values[k('wdir')], calc.values[k('wspd')]) : null);

	// The runway list isn't saved with the calculation, so it is looked up again on return to this step.
	onMount(() => {
		const ident = chosen?.ident;
		if (!ident) return;
		loadAirfields().then((data) => {
			airfieldFound = data.airfields.find((a) => a.ident === ident) ?? null;
			if (!airfieldFound) return;
			const plan = weatherOnReturn(weather, weatherToConfirm, Date.now());
			if (plan.fetch) autoWeather(airfieldFound, plan.note);
		}).catch(() => {});
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
		applyAirfield(calc, a, airfieldDate, place);
		autoWeather(a, '');
	}
	/** The field's own METAR, or the nearest station's when it has none. */
	async function autoWeather(a: Airfield, note: string) {
		weatherNote = '';
		if (await loadWeather({ lat: a.lat, lon: a.lon })) weatherNote = note;
	}
	function chooseRunway(designator: string) {
		const end = airfieldFound?.runways.find((r) => r.designator === designator);
		if (end) applyRunway(calc, end, place, fieldVariation);
	}
	function chooseWind(id: WindForDistances) {
		setWindChoice(calc, place, id);
	}

	async function loadWeather(query: WeatherQuery): Promise<boolean> {
		if (weatherBusy) return false;
		const target = calc;
		weatherBusy = true; weatherMessage = '';
		closePad();
		const result = await lookUpWeather(query);
		// The chosen airfield's variation turns the METAR's true wind magnetic, like its runways and ATIS.
		const field = airfieldFound && chosen?.ident === airfieldFound.ident ? airfieldFound : null;
		if (result.ok) { now = Date.now(); applyWeather(target, result.report, now, place, field ? fieldVariation : null); } else weatherMessage = result.message;
		weatherBusy = false;
		return result.ok;
	}
	const getStationWeather = () => loadWeather({ station: calc.values[k('station')] ?? '' });
	/** From the chosen airfield when there is one, so a field without a METAR gets its nearest station. */
	function getNearestWeather() {
		weatherMessage = '';
		const from = nearestFrom(place, airfieldFound && chosen?.ident === airfieldFound.ident ? airfieldFound : null, !!navigator.geolocation);
		if (from.from === 'airfield') { loadWeather({ lat: from.lat, lon: from.lon }); return; }
		if (from.from === 'none') { weatherMessage = from.message; return; }
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
	const heading = (end: RunwayEnd) => degrees(magneticHeading(end, fieldVariation));
	const textInput = 'min-h-[52px] w-full rounded-lg border border-line-strong bg-surface px-3.5 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-ring';
	const enter = (action: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); action(); } };
</script>

<Card title={named ? `${word} airfield and runway` : 'Airfield and runway'}>
	{#snippet actions()}<span class="text-[13px] text-muted">From OurAirports. Check against the AIP.</span>{/snippet}
	<div class="flex flex-wrap items-end gap-3">
		<label class="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
			<span class="label-caps">{word} airfield</span>
			<input
				id={idOf('f-airfield')} type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off"
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
		<p id={idOf('airfield-found')} class="text-[13px] text-ink-2"><strong>{airfieldFound.ident} {airfieldFound.name}</strong>{#if calc.values[k('elev')]}<span aria-hidden="true">&#32;·&#32;</span><span class="num">{calc.values[k('elev')]} {calc.elevationUnit}</span>{/if} · list of {airfieldDate}{#if placeSet}<span aria-hidden="true">&#32;·&#32;</span><button type="button" class="min-h-0 border-0 bg-transparent p-0 text-[13px] font-semibold text-accent" onclick={() => (changingPlace = !changingPlace)}>{changingPlace ? 'Done' : 'Change'}</button>{/if}</p>
	{/if}

	<!-- The weather comes with the airfield, so the runway can be chosen with the wind in view. -->
	<div class="flex flex-col gap-2" aria-live="polite">
		{#if weatherBusy}
			<p class="rounded-lg bg-subtle px-3.5 py-3 text-sm text-ink-2">Getting the weather{showRunways && airfieldFound ? ` for ${airfieldFound.ident}` : ''}…</p>
		{:else if weather}
			<div class="metar flex flex-col gap-1 rounded-lg bg-subtle px-3.5 py-3">
				<span class="label-caps text-[11px]">Weather{place === 'landing' ? ' now, not at your arrival' : ''}</span>
				<code class="raw num text-sm break-words">{weather.raw}</code>
				<span class="text-[13px] text-muted">{stationLine(weather, chosen?.ident ?? null)}{metarAge !== null ? ` · ${metarAge} minutes old` : ''}</span>
				{#if weatherNote}<p class="text-[13px] font-semibold text-ink-2">{weatherNote}</p>{/if}
				{#if metarAge !== null && metarAge > OLD_REPORT_MINUTES}<div class="banner notsent mt-1" role="alert">This report is {metarAge} minutes old. Check it is still valid, or enter current values.</div>{/if}
				{#each weather.flags as flag (flag)}<p class="flag text-sm font-semibold text-amber">{flag}</p>{/each}
			</div>
		{/if}
		{#if weatherMessage}<div class="banner unk" role="status">{weatherMessage}</div>{/if}
		<Collapsible.Root open={!showRunways && !weather}>
			<div class="flex flex-wrap gap-x-4">
				{#if showRunways && airfieldFound}<button type="button" class="min-h-9 border-0 bg-transparent p-0 text-sm font-semibold text-accent" disabled={weatherBusy} onclick={() => autoWeather(airfieldFound!, '')}>Refresh the weather</button>{/if}
				<Collapsible.Trigger class="min-h-9 border-0 bg-transparent p-0 text-sm font-semibold text-accent">{showRunways ? 'Use another station' : 'Get a METAR'}</Collapsible.Trigger>
			</div>
			<Collapsible.Content class="flex flex-wrap items-end gap-2 pt-2">
				<label class="flex min-w-0 flex-[1_1_160px] flex-col gap-1.5">
					<span class="label-caps">Weather station</span>
					<input
						id={idOf('f-station')} type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" maxlength="4"
						placeholder="e.g. LSZH" bind:value={calc.values[k('station')]} onfocus={closePad} onkeydown={enter(getStationWeather)}
						class={[textInput, 'num text-lg font-semibold tracking-[0.06em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case']}
					/>
				</label>
				<Button size="lg" disabled={weatherBusy} onclick={getStationWeather}>{weatherBusy ? 'Loading' : 'Get METAR'}</Button>
				<Button size="lg" disabled={weatherBusy} onclick={getNearestWeather}>Nearest</Button>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>

	{#if showRunways && airfieldFound}
		<div class="flex flex-col gap-1.5">
			<span class="label-caps" id={idOf('runway-label')}>Runway</span>
			<ToggleGroup.Root type="single" value={chosenRunway(calc, place)?.designator ?? ''} onValueChange={(d) => { if (d) chooseRunway(d); }} aria-labelledby={idOf('runway-label')} class="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
				{#each airfieldFound.runways as end (end.designator)}
					{@const w = runwayWind?.winds.get(end.designator)}
					{@const into = runwayWind?.intoWind === end.designator}
					<ToggleGroup.Item
						value={end.designator}
						class="group flex min-h-14 flex-col justify-center gap-px rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-left font-normal text-ink data-[state=on]:border-2 data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:px-[11px] data-[state=on]:text-accent-strong"
					>
						<span class="flex items-baseline gap-1.5"><span class="num text-xl font-semibold">{end.designator}</span> <span class="num text-[13px] text-muted group-data-[state=on]:text-inherit">{heading(end)}</span>{#if into}<span class="ml-auto rounded-full bg-good-bg px-2 py-px text-[11px] font-semibold text-good">Headwind</span>{/if}</span>
						<span class="text-[13px] text-ink-2 group-data-[state=on]:text-inherit">{surfaceText(end)}{end.lengthM ? ` · ${end.lengthM} m` : ''}</span>
						{#if w}<span class={['num text-[13px] group-data-[state=on]:text-inherit', w.headwind < -0.5 ? 'font-semibold text-amber' : 'text-ink-2']}>{runwayWindText(w)}</span>{/if}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
			{#if runwayWind?.winds.size}<p class="text-[13px] text-muted">Wind from {weather && isFromMetar(calc, k('wdir')) ? `the ${weather.station} METAR` : 'your entry below'}. Use the runway in use: ATIS or the tower may differ.</p>{/if}
		</div>
	{/if}
	{#if showPlaceFields}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
			{#each placeFields as field (field.key)}{@render numberField(field)}{/each}
		</div>
	{/if}
</Card>

<div id={`w-${weatherItemKey(place)}`} class={['scroll-m-4 rounded-xl', weatherToConfirm && 'ring-2 ring-amber']}>
<Card title={named ? `${word} weather to check` : 'Weather to check'} description={place === 'landing' ? 'A METAR is the weather now, not at your arrival. Check it again before landing.' : undefined}>
	{#snippet actions()}{#if weather}<span class="text-[13px] text-muted">METAR {weather.station}{metarAge !== null ? `, ${metarAge} min old` : ''}</span>{/if}{/snippet}
	<dl class="m-0 flex flex-col">
		{#each rows as row (row.id)}
			{@const open = rowOpen(row)}
			<div class="flex flex-col gap-2 border-b border-divider py-2 last:border-b-0">
				<div class="grid min-h-10 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
					<dt class="text-sm text-ink-2">{row.label}</dt>
					<dd class="m-0 flex min-w-0 flex-col">
						{#if row.value !== null}<span class="num text-[17px] font-semibold">{row.value}</span>{:else}<span class="text-sm text-muted">{weather ? 'Not in the METAR: enter it' : 'Enter it'}</span>{/if}
						{#if row.id === 'wind' && windHint && !open}<span class="text-xs text-muted">{windHint}</span>{/if}
					</dd>
					{#if row.value !== null}<button type="button" class="min-h-10 border-0 bg-transparent px-1 text-sm font-semibold text-accent" onclick={() => toggleRow(row)}>{open ? 'Done' : 'Change'}</button>{/if}
				</div>
				{#if open}
					<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
						{#each weatherFields.filter((f) => row.keys.some((b) => f.key === k(b))) as field (field.key)}{@render numberField(field)}{/each}
					</div>
				{/if}
			</div>
		{/each}
	</dl>
	{#if weatherToConfirm}
		<div class="flex justify-end">
			<Button variant="dark" onclick={() => { confirmWeather(calc, place); opened = {}; }}>Confirm weather</Button>
		</div>
	{:else if confirmed}
		<div class="flex items-center gap-2.5 rounded-lg bg-good-bg px-3.5 py-2.5 text-sm text-good">
			<Icon name="check" size={16} stroke={3} />
			<span class="flex-1"><strong>Weather confirmed.</strong> The Report says so.</span>
			<button type="button" class="min-h-0 border-0 bg-transparent p-0 text-sm font-semibold text-accent" onclick={() => unconfirmWeather(calc, place)}>Undo</button>
		</div>
	{/if}
	<div class="flex flex-col gap-1.5">
		<Segmented label={named ? `Wind for the ${word.toLowerCase()} calculation` : 'Wind for the calculation'} options={windOptions} value={windChoice} minWidth={130} onchange={(id) => chooseWind(id as WindForDistances)} />
		{#if distancesUse}
			<p class="text-[13px] text-ink-2">Distances use <strong>{distancesUse}</strong>.{#if ignoresEnteredTailwind(at.wind, windChoice)} <span class="font-semibold text-amber">Ignores the entered {Math.round(-at.wind!.headwind)} kt tailwind; the Report says so.</span>{/if} <InfoTip label="About the wind choices">No wind and Tailwind 3 kt leave out any headwind. Your choice is used as chosen, also when the entered wind has a stronger tailwind, for example a METAR from another field. The crosswind check always uses the entered wind. The Report shows which you chose.</InfoTip></p>
		{/if}
	</div>
</Card>
</div>
