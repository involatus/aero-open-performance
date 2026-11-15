<script lang="ts">
	import { untrack } from 'svelte';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { defaultSource, makeId, move } from '#lib/admin/editing.ts';
	import SourcePick from './SourcePick.svelte';
	import AdmItem from './AdmItem.svelte';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();
	type Note = Aircraft['notes'][number];
	type Group = 'configurations' | 'takeoffConditions' | 'landingConditions';

	// Cards present when the editor opened start closed; ones added since start open.
	const known = untrack(() => new Set(a.notes.map((n) => n.id)));

	/** Every choice a pilot can make, from the aircraft and its configurations, once each. */
	let groups = $derived.by(() => {
		const performances = [a.performance, ...a.configurations.map((c) => c.performance)].filter((p) => p && p !== 'none') as Array<Aircraft['performance']>;
		const unique = (list: Array<{ id: string; label: string }>) => [...new Map(list.map((x) => [x.id, x])).values()];
		const out: Array<[Group, string, Array<{ id: string; label: string }>]> = [
			['configurations', 'Configuration', a.configurations.map((c) => ({ id: c.id, label: c.label }))],
			['takeoffConditions', 'Takeoff condition', unique(performances.flatMap((p) => p.takeoff))],
			['landingConditions', 'Landing condition', unique(performances.flatMap((p) => p.landing))]
		];
		// One choice is no choice: a note can't depend on it.
		return out.filter(([, , list]) => list.length > 1);
	});

	function add() {
		a.notes.push({ id: makeId('note', a.notes.map((n) => n.id)), text: '', source: defaultSource(a) });
		touch();
	}
	/** No box ticked means the note always shows. */
	function toggle(n: Note, group: Group, all: string[], id: string, on: boolean) {
		const current = n.appliesTo?.[group] ?? [];
		const next = on ? [...current, id] : current.filter((x) => x !== id);
		const appliesTo = { ...n.appliesTo };
		if (!next.length) delete appliesTo[group]; else appliesTo[group] = all.filter((x) => next.includes(x));
		if (Object.keys(appliesTo).length) n.appliesTo = appliesTo; else delete n.appliesTo;
		touch();
	}
	function summary(n: Note) {
		const parts = groups.flatMap(([g, , list]) => (n.appliesTo?.[g] ? [n.appliesTo[g]!.map((id) => list.find((x) => x.id === id)?.label ?? id).join(' or ')] : []));
		return parts.length ? `Only with ${parts.join(', and ')}` : 'Always shown';
	}
	const title = (n: Note) => (n.text.length > 70 ? `${n.text.slice(0, 70)}…` : n.text) || 'New note';
</script>

<p class="adm-hint">Rules from the manual the pilot must confirm before a Report, such as "Rear seat passenger max 132 lb". A note for some choices only, such as skis, is shown only when the pilot picks them.</p>
{#each a.notes as n, i (n.id)}
	<AdmItem title={title(n)} summary={summary(n)} open={!known.has(n.id)}>
		{#snippet tools()}
			<button type="button" disabled={i === 0} onclick={() => { move(a.notes, i, -1); touch(); }}>Up</button>
			<button type="button" disabled={i === a.notes.length - 1} onclick={() => { move(a.notes, i, 1); touch(); }}>Down</button>
			<button type="button" onclick={() => { a.notes.splice(i, 1); touch(); }}>Delete</button>
		{/snippet}
		<label class="adm-field">Text pilots confirm *<textarea class="adm" rows="2" value={n.text} oninput={(e) => { n.text = e.currentTarget.value; touch(); }}></textarea></label>
		<SourcePick aircraft={a} value={n.source} onchange={(id) => { n.source = id; touch(); }} />
		{#each groups as [group, name, list] (group)}
			<fieldset class="m-0 border-0 p-0">
				<legend class="adm-field">Show only with this {name.toLowerCase()} <span class="font-normal text-muted">(none ticked: always)</span></legend>
				<div class="flex flex-wrap gap-x-4">
					{#each list as c (c.id)}<label class="adm-check"><input type="checkbox" checked={!!n.appliesTo?.[group]?.includes(c.id)} onchange={(e) => toggle(n, group, list.map((x) => x.id), c.id, e.currentTarget.checked)} /> {c.label}</label>{/each}
				</div>
			</fieldset>
		{/each}
	</AdmItem>
{/each}
<div><button type="button" onclick={add}>Add note</button></div>
