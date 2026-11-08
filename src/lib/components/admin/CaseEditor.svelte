<script lang="ts">
	import type { Aircraft, HandCase } from '#lib/aircraft/schema.ts';
	import type { CaseFailure } from '#lib/engine/index.ts';
	import { entryUnits, shown } from '#lib/admin/editing.ts';
	import { EXPECTED_MASS_AND_CG, RESULT_CHOICES, limitChoices, setExceeded, setExpectedResult, setExpectedValue } from '#lib/admin/hand-cases.ts';
	import CaseInputs from './CaseInputs.svelte';

	// One hand-calculated case: its inputs and the results a person worked out from the manual.
	let { aircraft, c, fails, touch, remove }: { aircraft: Aircraft; c: HandCase; fails: CaseFailure[]; touch: () => void; remove: () => void } = $props();
	let units = $derived(entryUnits(aircraft));
	const PHASES = [['takeoff', 'Takeoff'], ['landing', 'Landing']] as const;
</script>

<details class="rounded-[5px] border border-line p-2">
	<summary class="font-semibold"><span class={fails.length ? 'text-bad' : 'text-good'}>{fails.length ? 'FAILS' : 'PASSES'}</span> {c.label}</summary>
	<div class="grid gap-3 pt-2">
		<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
			<label class="adm-field">Label<input class="adm" bind:value={c.label} oninput={touch} /></label>
			<label class="adm-field">Worked out by<input class="adm" bind:value={c.author} oninput={touch} /></label>
			<label class="adm-field">Date<input class="adm" bind:value={c.date} oninput={touch} /></label>
		</div>
		<h3 class="m-0 font-bold">Inputs</h3>
		<CaseInputs {aircraft} input={c.input} onchange={touch} />
		<h3 class="m-0 font-bold">Expected results, worked out by hand</h3>
		<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
			{#each EXPECTED_MASS_AND_CG as f (f.key)}
				<label class="adm-field">{f.label}, {units[f.kind]}<input class="adm" inputmode="decimal" value={c.expected[f.key] === undefined ? '' : shown(aircraft, f.kind, c.expected[f.key]!)} onchange={(e) => { setExpectedValue(aircraft, c, f.key, e.currentTarget.value); touch(); }} /></label>
			{/each}
			{#each PHASES as [phase, title] (phase)}
				<label class="adm-field">{title} result<select class="adm" value={c.expected[phase]?.status ?? ''} onchange={(e) => { setExpectedResult(c, phase, 'status', e.currentTarget.value); touch(); }}>{#each RESULT_CHOICES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
				<label class="adm-field">{title} total, rounded up<input class="adm" inputmode="numeric" value={c.expected[phase]?.total ?? ''} onchange={(e) => { setExpectedResult(c, phase, 'total', e.currentTarget.value); touch(); }} /></label>
				<label class="adm-field">{title} ground roll, rounded up<input class="adm" inputmode="numeric" value={c.expected[phase]?.groundRoll ?? ''} onchange={(e) => { setExpectedResult(c, phase, 'groundRoll', e.currentTarget.value); touch(); }} /></label>
			{/each}
		</div>
		<fieldset class="m-0 flex flex-wrap gap-3 border-0 p-0"><legend class="font-bold">Limits this case should exceed</legend>
			{#each limitChoices(aircraft) as l (l.id)}<label class="flex items-center gap-1 text-sm"><input type="checkbox" checked={c.expected.exceeded.includes(l.id)} onchange={(e) => { setExceeded(c, l.id, e.currentTarget.checked); touch(); }} /> {l.label}</label>{/each}
		</fieldset>
		{#if fails.length}<ul class="m-0 list-disc pl-5 text-bad">{#each fails as f (f.field)}<li>{f.field}: you expected {String(f.expected)}, the tool got {String(f.actual)}. Check both against the manual.</li>{/each}</ul>{/if}
		<button type="button" onclick={remove}>Delete this case</button>
	</div>
</details>
