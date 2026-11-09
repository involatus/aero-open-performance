<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ToggleGroup } from 'bits-ui';
	import { isUnusual, parse, tenths, type Calculation, type Field } from '#lib/app/calculation.ts';
	import { valueSource } from '#lib/app/presentation.ts';
	import Button from './ui/Button.svelte';
	import Gauge from './ui/Gauge.svelte';

	let { field, calc, active, onopen, onquick, onconfirm, onunit, extra }: {
		field: Field; calc: Calculation; active: boolean;
		onopen: () => void; onquick: (op: string) => void; onconfirm: () => void; onunit?: (unit: string) => void;
		/** More facts under the value, such as the fuel mass. */
		extra?: Snippet;
	} = $props();

	let text = $derived(calc.values[field.key] ?? '');
	let status = $derived(calc.status[field.key]);
	let unusual = $derived(isUnusual(field, text));
	let overCapacity = $derived(field.capacity !== undefined && (parse(text) ?? 0) > field.capacity);
	let problem = $derived(unusual || overCapacity);
	const quickLabel = (op: string) => (op.startsWith('=') ? `${op.slice(1)} h` : op === 'VRB' ? 'Variable' : op.replace('-', '−'));
	const isCurrent = (op: string) => (op.startsWith('=') && op.slice(1) === text) || (op === 'VRB' && text === 'VRB');
</script>

<div
	id={`w-${field.key}`}
	data-status={status}
	class={[
		'flex min-w-0 scroll-m-28 flex-col gap-1.5 rounded-[10px] bg-surface',
		active ? 'border-2 border-accent p-[13px]' : 'border p-3.5',
		!active && (problem ? 'border-bad' : status === 'pre' ? 'border-amber-line' : 'border-line'),
		status === 'pre' && 'bg-amber-soft'
	]}
>
	<div class="flex items-baseline justify-between gap-2">
		<label for={`f-${field.key}`} class="font-bold">{field.label}</label>
		{#if field.meta}<span class="text-xs whitespace-nowrap text-muted">{field.meta}</span>{/if}
	</div>
	<div
		class={[
			'flex min-h-[52px] items-center gap-2 rounded-lg border bg-surface pr-1.5 pl-3.5',
			active ? 'border-accent ring-[3px] ring-accent-ring' : problem ? 'border-bad' : status === 'pre' ? 'border-amber-line' : 'border-line-strong'
		]}
	>
		<!-- readonly with inputmode none: iPadOS has no number-only keyboard, so the in-app keypad does the typing. -->
		<input
			id={`f-${field.key}`}
			readonly
			inputmode="none"
			autocomplete="off"
			value={text}
			placeholder={field.required ? '–' : '0'}
			onclick={onopen}
			onfocus={onopen}
			aria-invalid={problem || undefined}
			class="num w-full min-w-0 flex-1 border-0 bg-transparent text-right text-[22px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint"
		/>
		{#if field.units && onunit}
			<ToggleGroup.Root type="single" value={field.unit} onValueChange={(u) => { if (u) onunit(u); }} aria-label={`${field.label} unit`} class="flex gap-0.5 rounded-md bg-canvas p-0.5">
				{#each field.units as u (u)}
					<ToggleGroup.Item value={u} tabindex={-1} class="min-h-9 min-w-10 rounded-[5px] border-0 bg-transparent px-2 text-sm font-semibold text-muted data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-raised">{u}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		{:else if field.unit}<span class="pr-2 text-muted">{field.unit}</span>{/if}
	</div>
	{#if field.capacity !== undefined}<Gauge size="sm" value={parse(text) ?? 0} max={field.capacity} label={`${field.label}, part of capacity`} tone={overCapacity ? 'bad' : 'accent'} />{/if}
	{@render extra?.()}
	{#if field.hint}<span class="text-[13px] text-muted">{field.hint}</span>{/if}
	{#if status === 'pre'}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<span class="text-[13px] font-semibold text-amber">{valueSource(calc, field.key)}</span>
			<Button variant="dark" size="sm" onclick={onconfirm}>Confirm</Button>
		</div>
	{:else if status === 'ok'}
		<span class="text-[13px] text-good">{valueSource(calc, field.key)}</span>
	{/if}
	{#if unusual}<span class="text-[13px] font-semibold text-bad">Unusual value. Expected {field.range[0]} to {field.range[1]} {field.unit}.</span>{/if}
	{#if overCapacity}<span class="text-[13px] font-semibold text-bad">Tank holds {tenths(field.capacity!)} {field.unit}.</span>{/if}
	{#if field.quick.length}
		<div class="grid auto-cols-fr grid-flow-col gap-1.5">
			{#each field.quick as op (op)}
				<button
					type="button"
					tabindex="-1"
					onclick={() => onquick(op)}
					class={['min-h-11 rounded-lg border px-1 font-semibold', isCurrent(op) ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong bg-surface text-ink']}
				>{quickLabel(op)}</button>
			{/each}
		</div>
	{/if}
</div>
