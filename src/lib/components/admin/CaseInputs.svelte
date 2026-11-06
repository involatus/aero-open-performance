<script lang="ts">
	import type { Aircraft, CalculationInput } from '#lib/aircraft/schema.ts';
	import { performanceOf } from '#lib/app/calculation.ts';

	let { aircraft, input, onchange }: { aircraft: Aircraft; input: CalculationInput; onchange: () => void } = $props();
	let perf = $derived(performanceOf(aircraft, input.configuration));
	const num = (text: string) => { const n = Number(text.replace(',', '.')); return text.trim() === '' || !Number.isFinite(n) ? null : n; };
	function setLoad(id: string, text: string) {
		input.loads[id] = { ...input.loads[id], mass: Math.max(0, num(text) ?? 0) };
		onchange();
	}
	function setPosition(id: string, position: string) {
		input.loads[id] = { mass: input.loads[id]?.mass ?? 0, position };
		onchange();
	}
	function setNullable(key: 'qnh' | 'oat' | 'windDirection' | 'windSpeed' | 'runwayHeading', text: string) {
		(input[key] as number | null) = num(text);
		onchange();
	}
	function setElevation(value: string, unit: 'm' | 'ft') {
		const n = num(value);
		input.elevation = n === null ? null : { value: n, unit };
		onchange();
	}
</script>

<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
	<label class="adm-field">Configuration<select class="adm" bind:value={input.configuration} onchange={onchange}>{#each aircraft.configurations as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select></label>
	{#each aircraft.stations as s (s.id)}
		<label class="adm-field">{s.label}, {aircraft.units.mass}<input class="adm" inputmode="decimal" value={input.loads[s.id]?.mass ?? ''} onchange={(e) => setLoad(s.id, e.currentTarget.value)} /></label>
		{#if s.positions}<label class="adm-field">{s.label} position<select class="adm" value={input.loads[s.id]?.position ?? s.defaultPosition} onchange={(e) => setPosition(s.id, e.currentTarget.value)}>{#each s.positions as p (p.id)}<option value={p.id}>{p.label}</option>{/each}</select></label>{/if}
	{/each}
	{#each aircraft.tanks as t (t.id)}
		<label class="adm-field">{t.label}, {aircraft.units.volume}<input class="adm" inputmode="decimal" value={input.fuel[t.id] ?? ''} onchange={(e) => { input.fuel[t.id] = Math.max(0, num(e.currentTarget.value) ?? 0); onchange(); }} /></label>
	{/each}
	<label class="adm-field">Burn plan<select class="adm" bind:value={input.burnPlan} onchange={onchange}>{#each aircraft.burnPlans as p (p.id)}<option value={p.id}>{p.label}</option>{/each}</select></label>
	<label class="adm-field">Flight time, h<input class="adm" inputmode="decimal" value={input.flightTimeHours} onchange={(e) => { input.flightTimeHours = Math.max(0, num(e.currentTarget.value) ?? 0); onchange(); }} /></label>
	<label class="adm-field">Fuel flow, {aircraft.units.volume}/h<input class="adm" inputmode="decimal" value={input.fuelFlow} onchange={(e) => { input.fuelFlow = Math.max(0, num(e.currentTarget.value) ?? 0); onchange(); }} /></label>
	<label class="adm-field">Elevation<input class="adm" inputmode="decimal" value={input.elevation?.value ?? ''} onchange={(e) => setElevation(e.currentTarget.value, input.elevation?.unit ?? 'm')} /></label>
	<label class="adm-field">Elevation unit<select class="adm" value={input.elevation?.unit ?? 'm'} onchange={(e) => setElevation(String(input.elevation?.value ?? ''), e.currentTarget.value as 'm' | 'ft')}><option value="m">m</option><option value="ft">ft</option></select></label>
	<label class="adm-field">QNH, hPa<input class="adm" inputmode="decimal" value={input.qnh ?? ''} onchange={(e) => setNullable('qnh', e.currentTarget.value)} /></label>
	<label class="adm-field">OAT, °C<input class="adm" inputmode="decimal" value={input.oat ?? ''} onchange={(e) => setNullable('oat', e.currentTarget.value)} /></label>
	<label class="adm-field">Wind from, °<input class="adm" inputmode="decimal" value={input.windDirection ?? ''} onchange={(e) => setNullable('windDirection', e.currentTarget.value)} /></label>
	<label class="adm-field">Wind speed, kt<input class="adm" inputmode="decimal" value={input.windSpeed ?? ''} onchange={(e) => setNullable('windSpeed', e.currentTarget.value)} /></label>
	<label class="adm-field">Runway heading, °<input class="adm" inputmode="decimal" value={input.runwayHeading ?? ''} onchange={(e) => setNullable('runwayHeading', e.currentTarget.value)} /></label>
	{#if perf}
		<label class="adm-field">Takeoff condition<select class="adm" bind:value={input.takeoffCondition} onchange={onchange}>{#each perf.takeoff as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select></label>
		<label class="adm-field">Landing condition<select class="adm" bind:value={input.landingCondition} onchange={onchange}>{#each perf.landing as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select></label>
	{/if}
</div>
