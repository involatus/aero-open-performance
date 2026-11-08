<script lang="ts">
	import { isUnusual, parse, type Calculation, type Field } from '#lib/app/calculation.ts';

	let { field, calc, active, onopen, onquick, onconfirm, onunit }: {
		field: Field; calc: Calculation; active: boolean;
		onopen: () => void; onquick: (op: string) => void; onconfirm: () => void; onunit?: (unit: string) => void;
	} = $props();

	let text = $derived(calc.values[field.key] ?? '');
	let status = $derived(calc.status[field.key]);
	let unusual = $derived(isUnusual(field, text));
	let overCapacity = $derived(field.capacity !== undefined && (parse(text) ?? 0) > field.capacity);
	const quickLabel = (op: string) => (op.startsWith('=') ? `${op.slice(1)} h` : op === 'VRB' ? 'Variable' : op);
</script>

<div class="fld" class:pre={status === 'pre'} class:badval={unusual || overCapacity} id={`w-${field.key}`}>
	<label for={`f-${field.key}`}>{field.label}</label>
	<div class="inp" class:active>
		<!-- readonly with inputmode none: iPadOS has no number-only keyboard, so the in-app keypad does the typing. -->
		<input id={`f-${field.key}`} readonly inputmode="none" autocomplete="off" value={text} onclick={onopen} onfocus={onopen} />
		{#if field.units && onunit}
			<span class="unit-switch" role="group" aria-label={`${field.label} unit`}>
				{#each field.units as u (u)}<button type="button" tabindex="-1" aria-pressed={u === field.unit} class:on={u === field.unit} onclick={() => onunit(u)}>{u}</button>{/each}
			</span>
		{:else}<span>{field.unit}</span>{/if}
	</div>
	{#if field.hint}<div class="hint">{field.hint}</div>{/if}
	<div class="chip">
		{#if status === 'pre'}
			<span class="amb">From {calc.sources[field.key]}{calc.changed[field.key] ? `, was ${calc.changed[field.key]}` : ''}</span>
			<button type="button" class="confirm" onclick={onconfirm}>Confirm</button>
		{:else if status === 'ok'}
			<span class="ok">Confirmed, from {calc.sources[field.key]}</span>
		{/if}
		{#if unusual}<span class="bad">Unusual value. Expected {field.range[0]} to {field.range[1]} {field.unit}.</span>{/if}
		{#if overCapacity}<span class="bad">Tank holds {field.capacity} {field.unit}.</span>{/if}
	</div>
	{#if field.quick.length}
		<div class="quick">
			{#each field.quick as op (op)}
				<button type="button" tabindex="-1" onclick={() => onquick(op)}>{quickLabel(op)}</button>
			{/each}
		</div>
	{/if}
</div>
