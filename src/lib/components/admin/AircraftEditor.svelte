<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { convertAircraft, type Units } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();

	const MASS = [['kg', 'kg'], ['lb', 'lb']], ARM = [['m', 'm'], ['cm', 'cm'], ['in', 'in']], VOLUME = [['L', 'litres'], ['USgal', 'US gallons']];
	const PRESETS: Record<string, Units> = { 'Metric (kg, m, L)': { mass: 'kg', arm: 'm', volume: 'L' }, 'Metric (kg, cm, L)': { mass: 'kg', arm: 'cm', volume: 'L' }, 'US (lb, in, US gal)': { mass: 'lb', arm: 'in', volume: 'USgal' } };
	let manual = $derived<Units>(a.manualUnits ?? a.units);

	function setManual(key: keyof Units, v: string) {
		const next = { ...manual, [key]: v };
		if (next.mass === a.units.mass && next.arm === a.units.arm && next.volume === a.units.volume) delete a.manualUnits; else a.manualUnits = next;
		touch();
	}
	function setPilot(key: keyof Units, v: string) {
		const keepManual = { ...manual };
		convertAircraft(a, { ...a.units, [key]: v });
		if (keepManual.mass === a.units.mass && keepManual.arm === a.units.arm && keepManual.volume === a.units.volume) delete a.manualUnits; else a.manualUnits = keepManual;
		touch();
	}
	function preset(name: string, which: 'manual' | 'pilot') {
		const u = PRESETS[name];
		if (!u) return;
		for (const k of ['mass', 'arm', 'volume'] as const) (which === 'manual' ? setManual : setPilot)(k, u[k]);
	}
</script>

<div class="adm-card">
	<div class="adm-row">
		<label class="adm-field">Registration *<input class="adm" value={a.registration} oninput={(e) => { a.registration = e.currentTarget.value; touch(); }} /></label>
		<label class="adm-field">Aircraft type *<input class="adm" placeholder="e.g. GlaStar GS-1" value={a.type} oninput={(e) => { a.type = e.currentTarget.value; touch(); }} /></label>
		<Num label="Data revision" value={a.revision} hint="Raise it when the data changes." onchange={(v) => { if (v !== undefined) { a.revision = Math.max(1, Math.round(v)); touch(); } }} />
	</div>
	<label class="adm-check"><input type="checkbox" checked={a.fictional === true} onchange={(e) => { if (e.currentTarget.checked) a.fictional = true; else delete a.fictional; touch(); }} /> Fictional aircraft, for testing only</label>
</div>

<div class="adm-card">
	<div class="adm-card-head"><h3>Units</h3></div>
	<p class="adm-hint">Type every value as printed in the manual. The tool converts it exactly for pilots, so a US manual can be entered in pounds while pilots load in kilograms.</p>
	<div class="grid gap-3 md:grid-cols-2">
		<fieldset class="adm-card sub m-0">
			<legend class="font-bold">Units in the manual</legend>
			<label class="adm-field">Quick choice<select class="adm" value="" onchange={(e) => { preset(e.currentTarget.value, 'manual'); e.currentTarget.value = ''; }}><option value="">Choose</option>{#each Object.keys(PRESETS) as p (p)}<option>{p}</option>{/each}</select></label>
			<div class="adm-row">
				<label class="adm-field">Mass<select class="adm" value={manual.mass} onchange={(e) => setManual('mass', e.currentTarget.value)}>{#each MASS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
				<label class="adm-field">Arm<select class="adm" value={manual.arm} onchange={(e) => setManual('arm', e.currentTarget.value)}>{#each ARM as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
				<label class="adm-field">Fuel<select class="adm" value={manual.volume} onchange={(e) => setManual('volume', e.currentTarget.value)}>{#each VOLUME as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
			</div>
		</fieldset>
		<fieldset class="adm-card sub m-0">
			<legend class="font-bold">Units pilots see</legend>
			<label class="adm-field">Quick choice<select class="adm" value="" onchange={(e) => { preset(e.currentTarget.value, 'pilot'); e.currentTarget.value = ''; }}><option value="">Choose</option>{#each Object.keys(PRESETS) as p (p)}<option>{p}</option>{/each}</select></label>
			<div class="adm-row">
				<label class="adm-field">Mass<select class="adm" value={a.units.mass} onchange={(e) => setPilot('mass', e.currentTarget.value)}>{#each MASS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
				<label class="adm-field">Arm<select class="adm" value={a.units.arm} onchange={(e) => setPilot('arm', e.currentTarget.value)}>{#each ARM as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
				<label class="adm-field">Fuel<select class="adm" value={a.units.volume} onchange={(e) => setPilot('volume', e.currentTarget.value)}>{#each VOLUME as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
			</div>
		</fieldset>
	</div>
	<div class="adm-row">
		<Num label="Mass decimals shown to pilots" value={a.display.massDecimals} onchange={(v) => { if (v !== undefined) { a.display.massDecimals = Math.max(0, Math.round(v)); touch(); } }} />
		<Num label="Arm decimals shown to pilots" value={a.display.armDecimals} onchange={(v) => { if (v !== undefined) { a.display.armDecimals = Math.max(0, Math.round(v)); touch(); } }} />
	</div>
</div>
