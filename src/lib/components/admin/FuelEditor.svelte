<script lang="ts">
	import { defaultSource, entryUnits, factor, makeId, move } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: any; touch: () => void } = $props();

	// Typical fuel densities, so nobody has to work them out. The manual's own figure still wins.
	const AVGAS_KG_PER_L = 0.72, AVGAS_LB_PER_USGAL = 6;
	let avgas = $derived.by(() => {
		const e = entryUnits(a), lbGal = e.mass === 'lb' && e.volume === 'USgal';
		const value = lbGal ? AVGAS_LB_PER_USGAL : AVGAS_KG_PER_L * factor('density', { mass: 'kg', arm: 'm', volume: 'L' }, e);
		return { text: lbGal ? '6 lb/US gal' : `${Number(value.toPrecision(4))} ${e.mass}/${e.volume}`, typed: value };
	});

	function addTank() {
		const label = a.tanks.length ? `Tank ${a.tanks.length + 1}` : 'Main tanks';
		const density = a.tanks[0]?.density ?? Number((avgas.typed * factor('density', entryUnits(a), a.units)).toPrecision(12));
		a.tanks.push({ id: makeId(label, a.tanks.map((t: any) => t.id)), label, arm: 0, capacity: 0, density, source: defaultSource(a) });
		syncPlans();
		touch();
	}
	function removeTank(i: number) {
		const id = a.tanks[i].id;
		a.tanks.splice(i, 1);
		for (const p of a.burnPlans) if (p.type === 'sequence') p.tanks = p.tanks.filter((t: string) => t !== id);
		syncPlans();
		touch();
	}
	/** One tank needs no choice. Several tanks get an "evenly" plan to start with. */
	function syncPlans() {
		if (!a.burnPlans.length || a.tanks.length <= 1) a.burnPlans = [{ id: 'even', label: 'Evenly', type: 'even' }];
		for (const p of a.burnPlans) if (p.type === 'sequence') p.tanks = p.tanks.filter((t: string) => a.tanks.some((x: any) => x.id === t));
		if (!a.burnPlans.some((p: any) => p.id === a.defaultBurnPlan)) a.defaultBurnPlan = a.burnPlans[0].id;
	}
	function addPlan() {
		const label = 'One tank after another';
		const id = makeId(label, a.burnPlans.map((p: any) => p.id));
		a.burnPlans.push({ id, label, type: 'sequence', tanks: a.tanks.map((t: any) => t.id) });
		touch();
	}
	function setType(p: any, type: string) {
		p.type = type;
		if (type === 'sequence') p.tanks = a.tanks.map((t: any) => t.id); else delete p.tanks;
		touch();
	}
	// With one arm for all tanks, the order fuel is used can't move the CG, so there is nothing to choose.
	let orderMatters = $derived(a.tanks.length > 1 && new Set(a.tanks.map((t: any) => t.arm)).size > 1);
	const tankLabel = (id: string) => a.tanks.find((t: any) => t.id === id)?.label ?? id;
</script>

<p class="adm-hint">One card per tank or group of tanks the pilot fills separately. Use usable fuel.</p>
{#each a.tanks as t, i (t.id)}
	<div class="adm-card">
		<div class="adm-card-head">
			<h3>{t.label || 'Unnamed tank'}</h3>
			<div class="adm-tools">
				<button type="button" disabled={i === 0} onclick={() => { move(a.tanks, i, -1); touch(); }}>Up</button>
				<button type="button" disabled={i === a.tanks.length - 1} onclick={() => { move(a.tanks, i, 1); touch(); }}>Down</button>
				<button type="button" onclick={() => removeTank(i)} aria-label={`Delete ${t.label}`}>Delete</button>
			</div>
		</div>
		<div class="adm-row">
			<label class="adm-field">Name pilots see *<input class="adm" placeholder="e.g. Main tanks" value={t.label} oninput={(e) => { t.label = e.currentTarget.value; touch(); }} /></label>
			<Num label="Usable fuel" aircraft={a} kind="volume" value={t.capacity} onchange={(v) => { t.capacity = v ?? 0; touch(); }} />
			<Num label="Arm" aircraft={a} kind="arm" value={t.arm} onchange={(v) => { t.arm = v ?? 0; touch(); }} />
			<Num label="Fuel density" aircraft={a} kind="density" value={t.density} hint={`AVGAS is usually ${avgas.text}.`} onchange={(v) => { t.density = v ?? 0; touch(); }} />
			<SourcePick aircraft={a} value={t.source} onchange={(id) => { t.source = id; touch(); }} />
		</div>
	</div>
{/each}
<div><button type="button" onclick={addTank}>Add tank</button></div>

{#if a.tanks.length > 1 && !orderMatters}
	<p class="adm-hint">All tanks have the same arm, so the order fuel is used doesn't change the CG.{a.burnPlans.length > 1 ? '' : ' Pilots aren\'t asked.'}</p>
	{#if a.burnPlans.length > 1}<button type="button" class="small justify-self-start" onclick={() => { a.burnPlans = [{ id: 'even', label: 'Evenly', type: 'even' }]; a.defaultBurnPlan = 'even'; touch(); }}>Remove the burn plan choice for pilots</button>{/if}
{:else if orderMatters}
	<h2 class="mt-4">Burn Plans</h2>
	<p class="adm-hint">How fuel is used during the flight, to work out landing mass and CG. Pilots choose one; the preselected one is ticked.</p>
	{#each a.burnPlans as p, i (p.id)}
		<div class="adm-card">
			<div class="adm-card-head">
				<h3>{p.label || 'Unnamed plan'}</h3>
				<div class="adm-tools"><button type="button" disabled={a.burnPlans.length < 2} onclick={() => { a.burnPlans.splice(i, 1); syncPlans(); touch(); }}>Delete</button></div>
			</div>
			<div class="adm-row">
				<label class="adm-field">Name pilots see *<input class="adm" value={p.label} oninput={(e) => { p.label = e.currentTarget.value; touch(); }} /></label>
				<label class="adm-field">How<select class="adm" value={p.type} onchange={(e) => setType(p, e.currentTarget.value)}><option value="even">From all tanks evenly</option><option value="sequence">One tank after another</option></select></label>
				<label class="adm-check"><input type="radio" name="default-burn" checked={a.defaultBurnPlan === p.id} onchange={() => { a.defaultBurnPlan = p.id; touch(); }} /> Preselected</label>
			</div>
			{#if p.type === 'sequence'}
				<ol class="m-0 grid gap-1 pl-5">
					{#each p.tanks as id, j (id)}
						<li><span class="font-semibold">{tankLabel(id)}</span> <span class="adm-tools inline-flex"><button type="button" disabled={j === 0} onclick={() => { move(p.tanks, j, -1); touch(); }}>Earlier</button><button type="button" disabled={j === p.tanks.length - 1} onclick={() => { move(p.tanks, j, 1); touch(); }}>Later</button></span></li>
					{/each}
				</ol>
			{/if}
		</div>
	{/each}
	<div><button type="button" onclick={addPlan}>Add burn plan</button></div>
{/if}

<h2 class="mt-4">Fuel flow</h2>
<div class="adm-card">
	<p class="adm-hint">Prefilled for pilots, who can change it. Leave empty to make pilots type it every time.</p>
	<div class="adm-row">
		<Num label="Typical fuel flow" optional aircraft={a} kind="volume" unit={`${entryUnits(a).volume}/h`} value={a.fuelFlow?.value} onchange={(v) => { if (v === undefined) delete a.fuelFlow; else a.fuelFlow = { value: v, source: a.fuelFlow?.source ?? defaultSource(a) }; touch(); }} />
		{#if a.fuelFlow}<SourcePick aircraft={a} value={a.fuelFlow.source} onchange={(id) => { a.fuelFlow.source = id; touch(); }} />{/if}
	</div>
</div>
