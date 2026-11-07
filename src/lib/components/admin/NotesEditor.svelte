<script lang="ts">
	import { defaultSource, makeId, move } from '#lib/admin/editing.ts';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: any; touch: () => void } = $props();

	function add() {
		a.notes.push({ id: makeId('note', a.notes.map((n: any) => n.id)), text: '', source: defaultSource(a) });
		touch();
	}
</script>

<p class="adm-hint">Rules from the manual the pilot must confirm before a Report, such as "Rear seat passenger max 132 lb".</p>
{#each a.notes as n, i (n.id)}
	<div class="adm-card">
		<label class="adm-field">Text pilots confirm *<textarea class="adm" rows="2" value={n.text} oninput={(e) => { n.text = e.currentTarget.value; touch(); }}></textarea></label>
		<div class="adm-row items-end">
			<SourcePick aircraft={a} value={n.source} onchange={(id) => { n.source = id; touch(); }} />
			<div class="adm-tools">
				<button type="button" disabled={i === 0} onclick={() => { move(a.notes, i, -1); touch(); }}>Up</button>
				<button type="button" disabled={i === a.notes.length - 1} onclick={() => { move(a.notes, i, 1); touch(); }}>Down</button>
				<button type="button" onclick={() => { a.notes.splice(i, 1); touch(); }}>Delete</button>
			</div>
		</div>
	</div>
{/each}
<div><button type="button" onclick={add}>Add note</button></div>
