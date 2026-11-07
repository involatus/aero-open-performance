<script lang="ts">
	import { defaultSource, makeId, move } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: any; touch: () => void } = $props();

	function addStation() {
		const label = `Station ${a.stations.length + 1}`;
		a.stations.push({ id: makeId(label, a.stations.map((s: any) => s.id)), label, arm: 0, source: defaultSource(a) });
		touch();
	}
	function removeStation(i: number) {
		const id = a.stations[i].id;
		a.stations.splice(i, 1);
		for (const l of a.combinedLimits) l.stations = l.stations.filter((s: string) => s !== id);
		touch();
	}
	function setPositions(s: any, on: boolean) {
		if (on) {
			s.positions = [{ id: 'forward', label: 'Forward', arm: s.arm ?? 0 }, { id: 'aft', label: 'Aft', arm: s.arm ?? 0 }];
			s.defaultPosition = 'forward';
			delete s.arm;
		} else {
			s.arm = s.positions?.[0]?.arm ?? 0;
			delete s.positions; delete s.defaultPosition;
		}
		touch();
	}
	function addPosition(s: any) {
		const label = `Position ${s.positions.length + 1}`;
		s.positions.push({ id: makeId(label, s.positions.map((p: any) => p.id)), label, arm: 0 });
		touch();
	}
	function addCombined() {
		const label = 'Baggage together';
		a.combinedLimits.push({ id: makeId(label, a.combinedLimits.map((l: any) => l.id)), label, stations: [], maxMass: 0, source: defaultSource(a) });
		touch();
	}
	function toggleMember(l: any, id: string, on: boolean) {
		l.stations = on ? [...l.stations, id] : l.stations.filter((s: string) => s !== id);
		touch();
	}
</script>

<p class="adm-hint">One card for each place a pilot can put load: a seat, a passenger or a baggage area. Pilots see the name. Leave the maximum empty if the manual gives none.</p>

{#each a.stations as s, i (s.id)}
	<div class="adm-card">
		<div class="adm-card-head">
			<h3>{s.label || 'Unnamed station'}</h3>
			<div class="adm-tools">
				<button type="button" disabled={i === 0} onclick={() => { move(a.stations, i, -1); touch(); }} aria-label={`Move ${s.label} up`}>Up</button>
				<button type="button" disabled={i === a.stations.length - 1} onclick={() => { move(a.stations, i, 1); touch(); }} aria-label={`Move ${s.label} down`}>Down</button>
				<button type="button" onclick={() => removeStation(i)} aria-label={`Delete ${s.label}`}>Delete</button>
			</div>
		</div>
		<div class="adm-row">
			<label class="adm-field">Name pilots see *<input class="adm" placeholder="e.g. Pilot" value={s.label} oninput={(e) => { s.label = e.currentTarget.value; touch(); }} /></label>
			{#if !s.positions}<Num label="Arm" aircraft={a} kind="arm" value={s.arm} onchange={(v) => { s.arm = v ?? 0; touch(); }} />{/if}
			<Num label="Maximum load" optional aircraft={a} kind="mass" value={s.maxMass} onchange={(v) => { if (v === undefined) delete s.maxMass; else s.maxMass = v; touch(); }} />
			<SourcePick aircraft={a} value={s.source} onchange={(id) => { s.source = id; touch(); }} />
		</div>
		<label class="adm-check"><input type="checkbox" checked={!!s.positions} onchange={(e) => setPositions(s, e.currentTarget.checked)} /> This seat can be moved to positions with different arms</label>
		{#if s.positions}
			<div class="adm-card sub">
				{#each s.positions as p, j (p.id)}
					<div class="adm-row items-end">
						<label class="adm-field">Position name *<input class="adm" value={p.label} oninput={(e) => { p.label = e.currentTarget.value; touch(); }} /></label>
						<Num label="Arm" aircraft={a} kind="arm" value={p.arm} onchange={(v) => { p.arm = v ?? 0; touch(); }} />
						<label class="adm-check"><input type="radio" name={`default-${s.id}`} checked={s.defaultPosition === p.id} onchange={() => { s.defaultPosition = p.id; touch(); }} /> Preselected</label>
						<div class="adm-tools"><button type="button" disabled={s.positions.length < 2} onclick={() => { s.positions.splice(j, 1); if (s.defaultPosition === p.id) s.defaultPosition = s.positions[0].id; touch(); }}>Delete position</button></div>
					</div>
				{/each}
				<div><button type="button" class="small" onclick={() => addPosition(s)}>Add position</button></div>
			</div>
		{/if}
	</div>
{/each}
<div><button type="button" onclick={addStation}>Add station</button></div>

<h2 class="mt-4">Combined limits</h2>
<p class="adm-hint">A combined limit caps several stations added together. Example: forward baggage, rear passenger and aft baggage may hold at most 250 lb together, even if each alone allows more.</p>
{#each a.combinedLimits as l, i (l.id)}
	<div class="adm-card">
		<div class="adm-card-head">
			<h3>{l.label || 'Unnamed limit'}</h3>
			<div class="adm-tools"><button type="button" onclick={() => { a.combinedLimits.splice(i, 1); touch(); }} aria-label={`Delete ${l.label}`}>Delete</button></div>
		</div>
		<div class="adm-row">
			<label class="adm-field">Name pilots see *<input class="adm" value={l.label} oninput={(e) => { l.label = e.currentTarget.value; touch(); }} /></label>
			<Num label="Maximum together" aircraft={a} kind="mass" value={l.maxMass} onchange={(v) => { l.maxMass = v ?? 0; touch(); }} />
			<SourcePick aircraft={a} value={l.source} onchange={(id) => { l.source = id; touch(); }} />
		</div>
		<fieldset class="m-0 border-0 p-0">
			<legend class="adm-field">Stations counted together (at least two)</legend>
			<div class="flex flex-wrap gap-x-4">
				{#each a.stations as s (s.id)}<label class="adm-check"><input type="checkbox" checked={l.stations.includes(s.id)} onchange={(e) => toggleMember(l, s.id, e.currentTarget.checked)} /> {s.label}</label>{/each}
			</div>
		</fieldset>
	</div>
{/each}
<div><button type="button" onclick={addCombined}>Add combined limit</button></div>
