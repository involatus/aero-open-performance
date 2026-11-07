<script lang="ts">
	import { defaultSource, makeId } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: any; touch: () => void } = $props();

	const armOf = (w: any) => (w.mass > 0 ? w.moment / w.mass : undefined);
	function setMass(w: any, mass: number | undefined) {
		const arm = armOf(w);
		w.mass = mass ?? 0;
		if (arm !== undefined) w.moment = w.mass * arm;
		touch();
	}
	function setArm(w: any, arm: number | undefined) { w.moment = w.mass * (arm ?? 0); touch(); }
	function add() {
		const label = a.configurations.length ? `Configuration ${a.configurations.length + 1}` : 'Standard';
		a.configurations.push({ id: makeId(label, a.configurations.map((c: any) => c.id)), label, weighing: { mass: 0, moment: 0, date: '', source: defaultSource(a) } });
		touch();
	}
</script>

<p class="adm-hint">A Configuration is a way the aircraft is equipped with its own weighing, such as tricycle or tailwheel, or wheels or skis. Most aircraft have just one. Pilots choose it when there is more than one.</p>
{#each a.configurations as c, i (c.id)}
	<div class="adm-card">
		<div class="adm-card-head">
			<h3>{c.label || 'Unnamed configuration'}</h3>
			<div class="adm-tools"><button type="button" disabled={a.configurations.length < 2} onclick={() => { a.configurations.splice(i, 1); touch(); }} aria-label={`Delete ${c.label}`}>Delete</button></div>
		</div>
		<div class="adm-row">
			<label class="adm-field">Name pilots see *<input class="adm" placeholder="e.g. Tricycle gear" value={c.label} oninput={(e) => { c.label = e.currentTarget.value; touch(); }} /></label>
		</div>
		<fieldset class="adm-card sub m-0">
			<legend class="font-bold">Empty mass from the latest weighing</legend>
			<div class="adm-row">
				<Num label="Empty mass" aircraft={a} kind="mass" value={c.weighing.mass || undefined} onchange={(v) => setMass(c.weighing, v)} />
				<Num label="Empty CG arm" aircraft={a} kind="arm" round={4} value={armOf(c.weighing)} onchange={(v) => setArm(c.weighing, v)} />
				<Num label="or its moment" aircraft={a} kind="moment" round={2} value={c.weighing.mass > 0 ? c.weighing.moment : undefined} hint="Type whichever the record gives." onchange={(v) => { c.weighing.moment = v ?? 0; touch(); }} />
				<label class="adm-field">Date of weighing *<input class="adm" type="date" value={c.weighing.date} onchange={(e) => { c.weighing.date = e.currentTarget.value; touch(); }} /></label>
				<SourcePick aircraft={a} label="Weighing record" value={c.weighing.source} onchange={(id) => { c.weighing.source = id; touch(); }} />
			</div>
		</fieldset>
		<label class="adm-check"><input type="checkbox" checked={c.performance === 'none'} onchange={(e) => { if (e.currentTarget.checked) c.performance = 'none'; else delete c.performance; touch(); }} /> The manual has no takeoff or landing data for this configuration</label>
		{#if c.massLimits || c.envelope || (c.performance && c.performance !== 'none')}<p class="adm-hint">This configuration has its own limits or performance, set in the JSON tab.</p>{/if}
	</div>
{/each}
<div><button type="button" onclick={add}>Add configuration</button></div>
