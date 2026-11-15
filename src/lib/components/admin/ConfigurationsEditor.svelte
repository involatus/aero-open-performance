<script lang="ts">
	import { untrack } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { defaultSource, entryUnits, makeId, shown, unitLabel, type Kind } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';
	import AdmItem from './AdmItem.svelte';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();
	// Cards present when the editor opened start closed; ones added since start open.
	const known = untrack(() => new Set(a.configurations.map((x) => x.id)));
	const val = (kind: Kind, v: number) => `${Number(shown(a, kind, v).toPrecision(6))} ${unitLabel(entryUnits(a), kind)}`;
	const configSummary = (c: Aircraft['configurations'][number]) => [c.weighing.mass > 0 ? `Empty ${val('mass', c.weighing.mass)}, arm ${val('arm', c.weighing.moment / c.weighing.mass)}` : 'No weighing yet', c.weighing.date && `weighed ${c.weighing.date}`, c.performance === 'none' && 'no performance data'].filter(Boolean).join(' · ');

	type Weighing = Aircraft['configurations'][number]['weighing'];
	const armOf = (w: Weighing) => (w.mass > 0 ? w.moment / w.mass : undefined);
	function setMass(w: Weighing, mass: number | undefined) {
		const arm = armOf(w);
		w.mass = mass ?? 0;
		if (arm !== undefined) w.moment = w.mass * arm;
		touch();
	}
	function setArm(w: Weighing, arm: number | undefined) { w.moment = w.mass * (arm ?? 0); touch(); }
	function add() {
		const label = a.configurations.length ? `Configuration ${a.configurations.length + 1}` : 'Standard';
		a.configurations.push({ id: makeId(label, a.configurations.map((c) => c.id)), label, weighing: { mass: 0, moment: 0, date: '', source: defaultSource(a) } });
		touch();
	}
</script>

<p class="adm-hint">A Configuration is a way the aircraft is equipped with its own weighing, such as tricycle or tailwheel, or wheels or skis. Most aircraft have just one. Pilots choose it when there is more than one.</p>
{#each a.configurations as c, i (c.id)}
	<AdmItem title={c.label || 'Unnamed configuration'} summary={configSummary(c)} open={!known.has(c.id)}>
		{#snippet tools()}
			<button type="button" disabled={a.configurations.length < 2} onclick={() => { a.configurations.splice(i, 1); touch(); }} aria-label={`Delete ${c.label}`}>Delete</button>
		{/snippet}
		<div class="adm-row">
			<label class="adm-field">Name *<input class="adm" placeholder="e.g. Tricycle gear" value={c.label} oninput={(e) => { c.label = e.currentTarget.value; touch(); }} /></label>
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
	</AdmItem>
{/each}
<div><button type="button" onclick={add}>Add configuration</button></div>
