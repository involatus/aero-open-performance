<script lang="ts">
	import { untrack } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { defaultSource, entryUnits, makeId, move, shown, unitLabel, type Kind } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';
	import AdmItem from './AdmItem.svelte';
	import { guessKind } from '#lib/app/my-values.ts';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();
	// Cards present when the editor opened start closed; ones added since start open.
	const known = untrack(() => new Set([...a.stations, ...a.combinedLimits].map((x) => x.id)));
	const val = (kind: Kind, v: number) => `${Number(shown(a, kind, v).toPrecision(6))} ${unitLabel(entryUnits(a), kind)}`;
	const stationSummary = (s: Aircraft['stations'][number]) => [s.carries === 'baggage' ? 'Baggage' : s.carries === 'people' ? 'Seat' : '', s.positions ? `${s.positions.length} positions` : s.arm !== undefined && `Arm ${val('arm', s.arm)}`, s.maxMass !== undefined && `max ${val('mass', s.maxMass)}`].filter(Boolean).join(' · ');
	const limitSummary = (l: Aircraft['combinedLimits'][number]) => `Max ${val('mass', l.maxMass)} for ${l.stations.map((id) => a.stations.find((s) => s.id === id)?.label ?? id).join(', ') || 'no stations yet'}`;

	function addStation() {
		const label = `Station ${a.stations.length + 1}`;
		a.stations.push({ id: makeId(label, a.stations.map((s) => s.id)), label, arm: 0, source: defaultSource(a) });
		touch();
	}
	function removeStation(i: number) {
		const id = a.stations[i].id;
		a.stations.splice(i, 1);
		for (const l of a.combinedLimits) l.stations = l.stations.filter((s: string) => s !== id);
		touch();
	}
	type Station = Aircraft['stations'][number];
	function useOneArm(s: Station) {
		s.arm = s.positions?.[0]?.arm ?? 0;
		delete s.positions; delete s.defaultPosition;
		touch();
	}
	function addPosition(s: Station) {
		if (!s.positions) return;
		const label = `Position ${s.positions.length + 1}`;
		s.positions.push({ id: makeId(label, s.positions.map((p) => p.id)), label, arm: 0 });
		touch();
	}
	function addCombined() {
		const label = 'Baggage together';
		a.combinedLimits.push({ id: makeId(label, a.combinedLimits.map((l) => l.id)), label, stations: [], maxMass: 0, source: defaultSource(a) });
		touch();
	}
	function toggleMember(l: Aircraft['combinedLimits'][number], id: string, on: boolean) {
		l.stations = on ? [...l.stations, id] : l.stations.filter((s: string) => s !== id);
		touch();
	}
</script>

<p class="adm-hint">One card for each seat and each baggage area, named as pilots should see it. Give every seat its own card, also when seats share an arm, so pilots never have to add people together. Leave the maximum empty if the manual gives none.</p>

{#each a.stations as s, i (s.id)}
	<AdmItem title={s.label || 'Unnamed station'} summary={stationSummary(s)} open={!known.has(s.id)}>
		{#snippet tools()}
			<button type="button" disabled={i === 0} onclick={() => { move(a.stations, i, -1); touch(); }} aria-label={`Move ${s.label} up`}>Up</button>
			<button type="button" disabled={i === a.stations.length - 1} onclick={() => { move(a.stations, i, 1); touch(); }} aria-label={`Move ${s.label} down`}>Down</button>
			<button type="button" onclick={() => removeStation(i)} aria-label={`Delete ${s.label}`}>Delete</button>
		{/snippet}
		<div class="adm-row">
			<label class="adm-field">Name *<input class="adm" placeholder="e.g. Pilot" value={s.label} oninput={(e) => { s.label = e.currentTarget.value; touch(); }} /></label>
			{#if !s.positions}<Num label="Arm" aircraft={a} kind="arm" value={s.arm} onchange={(v) => { s.arm = v ?? 0; touch(); }} />{/if}
			<label class="adm-field">Carries<select class="adm" value={s.carries ?? guessKind(s).replace('person', 'people').replace('item', 'baggage')} onchange={(e) => { s.carries = e.currentTarget.value as 'people' | 'baggage'; touch(); }}><option value="people">People, a seat</option><option value="baggage">Baggage or cargo</option></select>{#if !s.carries}<span class="adm-hint">Guessed from the name. Choose to confirm.</span>{/if}</label>
			<Num label="Maximum load" optional aircraft={a} kind="mass" value={s.maxMass} onchange={(v) => { if (v === undefined) delete s.maxMass; else s.maxMass = v; touch(); }} />
			<SourcePick aircraft={a} value={s.source} onchange={(id) => { s.source = id; touch(); }} />
		</div>
		{#if s.positions}
			<p class="adm-hint">This station came from a file with several positions. <button type="button" class="small" onclick={() => useOneArm(s)}>Use one arm instead</button></p>
			<div class="adm-card sub">
				{#each s.positions as p, j (p.id)}
					<div class="adm-row items-end">
						<label class="adm-field">Position name *<input class="adm" value={p.label} oninput={(e) => { p.label = e.currentTarget.value; touch(); }} /></label>
						<Num label="Arm" aircraft={a} kind="arm" value={p.arm} onchange={(v) => { p.arm = v ?? 0; touch(); }} />
						<label class="adm-check"><input type="radio" name={`default-${s.id}`} checked={s.defaultPosition === p.id} onchange={() => { s.defaultPosition = p.id; touch(); }} /> Preselected</label>
						<div class="adm-tools"><button type="button" disabled={s.positions!.length < 2} onclick={() => { s.positions!.splice(j, 1); if (s.defaultPosition === p.id) s.defaultPosition = s.positions![0].id; touch(); }}>Delete position</button></div>
					</div>
				{/each}
				<div><button type="button" class="small" onclick={() => addPosition(s)}>Add position</button></div>
			</div>
		{/if}
	</AdmItem>
{/each}
<div><button type="button" onclick={addStation}>Add station</button></div>

<h2 class="mt-4">Combined limits</h2>
<p class="adm-hint">A combined limit caps several stations added together. Example: forward baggage, rear passenger and aft baggage may hold at most 250 lb together, even if each alone allows more.</p>
{#each a.combinedLimits as l, i (l.id)}
	<AdmItem title={l.label || 'Unnamed limit'} summary={limitSummary(l)} open={!known.has(l.id)}>
		{#snippet tools()}
			<button type="button" onclick={() => { a.combinedLimits.splice(i, 1); touch(); }} aria-label={`Delete ${l.label}`}>Delete</button>
		{/snippet}
		<div class="adm-row">
			<label class="adm-field">Name *<input class="adm" value={l.label} oninput={(e) => { l.label = e.currentTarget.value; touch(); }} /></label>
			<Num label="Maximum together" aircraft={a} kind="mass" value={l.maxMass} onchange={(v) => { l.maxMass = v ?? 0; touch(); }} />
			<SourcePick aircraft={a} value={l.source} onchange={(id) => { l.source = id; touch(); }} />
		</div>
		<fieldset class="m-0 border-0 p-0">
			<legend class="adm-field">Stations counted together (at least two)</legend>
			<div class="flex flex-wrap gap-x-4">
				{#each a.stations as s (s.id)}<label class="adm-check"><input type="checkbox" checked={l.stations.includes(s.id)} onchange={(e) => toggleMember(l, s.id, e.currentTarget.checked)} /> {s.label}</label>{/each}
			</div>
		</fieldset>
	</AdmItem>
{/each}
<div><button type="button" onclick={addCombined}>Add combined limit</button></div>
