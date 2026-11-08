<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { defaultSource, editablePoints, move } from '#lib/admin/editing.ts';
	import EnvelopePreview from './EnvelopePreview.svelte';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();

	let points = $derived(editablePoints(a.envelope));
	let usesMac = $derived(points.some((p) => typeof p.percentMac === 'number'));
	let box = $state<{ fwd?: number; aft?: number; low?: number; high?: number }>({});

	function setMacMode(on: boolean) {
		a.envelope.points = points.map((p) => (on ? { mass: p.mass, percentMac: 0 } : { mass: p.mass, arm: 0 }));
		if (on && !a.mac) a.mac = { leadingEdgeArm: 0, length: 0, source: defaultSource(a) };
		touch();
	}
	function addPoint() {
		const last = a.envelope.points.at(-1);
		a.envelope.points.push(usesMac ? { mass: last?.mass ?? 0, percentMac: 0 } : { mass: last?.mass ?? 0, arm: 0 });
		touch();
	}
	/** Most simple aircraft have a fixed forward and aft limit: four corners, in order around the shape. */
	function fillBox() {
		const { fwd, aft, low, high } = box;
		if ([fwd, aft, low, high].some((v) => v === undefined)) return;
		// The fields above already hold stored values, converted from the manual's units.
		const corner = (mass: number, at: number) => (usesMac ? { mass, percentMac: at } : { mass, arm: at });
		a.envelope.points = [corner(low!, fwd!), corner(high!, fwd!), corner(high!, aft!), corner(low!, aft!)];
		touch();
	}
</script>

<div class="adm-card">
	<div class="adm-card-head"><h3>Maximum mass</h3></div>
	<div class="adm-row">
		<Num label="Maximum takeoff mass" aircraft={a} kind="mass" value={a.massLimits.maxTakeoff.value || undefined} onchange={(v) => { a.massLimits.maxTakeoff.value = v ?? 0; touch(); }} />
		<SourcePick aircraft={a} value={a.massLimits.maxTakeoff.source} onchange={(id) => { a.massLimits.maxTakeoff.source = id; touch(); }} />
	</div>
	<div class="adm-row">
		<Num label="Maximum landing mass" aircraft={a} kind="mass" value={a.massLimits.maxLanding.value || undefined} onchange={(v) => { a.massLimits.maxLanding.value = v ?? 0; touch(); }} />
		<SourcePick aircraft={a} value={a.massLimits.maxLanding.source} onchange={(id) => { a.massLimits.maxLanding.source = id; touch(); }} />
	</div>
	{#if a.massLimits.maxTakeoff.value > 0 && a.massLimits.maxLanding.value !== a.massLimits.maxTakeoff.value}
		<button type="button" class="small justify-self-start" onclick={() => { a.massLimits.maxLanding = { ...a.massLimits.maxTakeoff }; touch(); }}>Landing is the same as takeoff</button>
	{/if}
</div>

<div class="adm-card">
	<div class="adm-card-head"><h3>CG Envelope</h3></div>
	<p class="adm-hint">The corners of the allowed area, in order around the shape. The drawing updates as you type, so compare it with the manual's graph.</p>
	<label class="adm-check"><input type="checkbox" checked={usesMac} onchange={(e) => setMacMode(e.currentTarget.checked)} /> The manual gives the limits in % MAC</label>
	{#if usesMac && a.mac}
		<div class="adm-row">
			<Num label="Leading edge of MAC, arm" aircraft={a} kind="arm" value={a.mac.leadingEdgeArm} onchange={(v) => { a.mac!.leadingEdgeArm = v ?? 0; touch(); }} />
			<Num label="MAC length" aircraft={a} kind="arm" value={a.mac.length} onchange={(v) => { a.mac!.length = v ?? 0; touch(); }} />
			<SourcePick aircraft={a} value={a.mac.source} onchange={(id) => { a.mac!.source = id; touch(); }} />
		</div>
	{/if}
	<div class="grid gap-3 lg:grid-cols-2">
		<div class="grid content-start gap-2">
			<details class="adm-card sub">
				<summary class="font-semibold">Fill in a box-shaped envelope</summary>
				<p class="adm-hint">For a fixed forward and aft limit from the lowest to the highest mass. This replaces the points below.</p>
				<div class="adm-row">
					<Num label={usesMac ? 'Forward limit, % MAC' : 'Forward limit'} aircraft={usesMac ? undefined : a} kind={usesMac ? undefined : 'arm'} value={box.fwd} onchange={(v) => (box.fwd = v)} />
					<Num label={usesMac ? 'Aft limit, % MAC' : 'Aft limit'} aircraft={usesMac ? undefined : a} kind={usesMac ? undefined : 'arm'} value={box.aft} onchange={(v) => (box.aft = v)} />
					<Num label="Lowest mass on the graph" aircraft={a} kind="mass" value={box.low} onchange={(v) => (box.low = v)} />
					<Num label="Highest mass" aircraft={a} kind="mass" value={box.high} onchange={(v) => (box.high = v)} />
				</div>
				<button type="button" class="small justify-self-start" disabled={[box.fwd, box.aft, box.low, box.high].some((v) => v === undefined)} onclick={fillBox}>Make these four corners</button>
			</details>
			{#each points as p, i (i)}
				<div class="adm-card sub">
					<div class="adm-card-head"><strong>Point {i + 1}</strong>
						<div class="adm-tools">
							<button type="button" disabled={i === 0} onclick={() => { move(a.envelope.points, i, -1); touch(); }}>Up</button>
							<button type="button" disabled={i === a.envelope.points.length - 1} onclick={() => { move(a.envelope.points, i, 1); touch(); }}>Down</button>
							<button type="button" onclick={() => { a.envelope.points.splice(i, 1); touch(); }}>Delete</button>
						</div>
					</div>
					<div class="adm-row">
						<Num label="Mass" aircraft={a} kind="mass" value={p.mass || undefined} onchange={(v) => { p.mass = v ?? 0; touch(); }} />
						{#if usesMac}<Num label="CG" unit="% MAC" value={p.percentMac} onchange={(v) => { p.percentMac = v ?? 0; touch(); }} />
						{:else}<Num label="CG arm" aircraft={a} kind="arm" value={p.arm} onchange={(v) => { p.arm = v ?? 0; touch(); }} />{/if}
					</div>
				</div>
			{/each}
			<div class="flex flex-wrap gap-2"><button type="button" onclick={addPoint}>Add point</button></div>
			<SourcePick aircraft={a} value={a.envelope.source} onchange={(id) => { a.envelope.source = id; touch(); }} />
		</div>
		<EnvelopePreview {a} envelope={a.envelope} />
	</div>
</div>

<div class="adm-card">
	<div class="adm-card-head"><h3>Demonstrated crosswind</h3></div>
	<p class="adm-hint">Optional. Shown to pilots as a reminder; it doesn't block anything.</p>
	<div class="adm-row">
		<Num label="Crosswind" optional unit="kt" value={a.crosswind?.value} onchange={(v) => { if (v === undefined) delete a.crosswind; else a.crosswind = { value: v, source: a.crosswind?.source ?? defaultSource(a) }; touch(); }} />
		{#if a.crosswind}<SourcePick aircraft={a} value={a.crosswind.source} onchange={(id) => { a.crosswind!.source = id; touch(); }} />{/if}
	</div>
</div>
