<script lang="ts">
	import { Checkbox } from 'bits-ui';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Limit } from '#lib/engine/mass-balance.ts';
	import { STEP_NAMES, stepOfLimit, type Calculation, type ToDo } from '#lib/app/calculation.ts';
	import { deliveryLabel, type StoredReport } from '#lib/report/report.ts';
	import Badge from '../../ui/Badge.svelte';
	import Button from '../../ui/Button.svelte';
	import Card from '../../ui/Card.svelte';
	import Icon from '../../ui/Icon.svelte';
	import StepHeading from './StepHeading.svelte';

	let {
		aircraft, calc, todo, exceeded, ready, creating, reportError, latestReport, reportIsCurrent,
		closePad, ongo, onstep, oncreate, onshare, onopen
	}: {
		aircraft: Aircraft; calc: Calculation; todo: ToDo[]; exceeded: Limit[]; ready: boolean; creating: boolean; reportError: string;
		latestReport: StoredReport | undefined; reportIsCurrent: boolean;
		closePad: () => void; ongo: (item: ToDo) => void; onstep: (step: number) => void;
		oncreate: () => void; onshare: (id: string) => void; onopen: (id: string) => void;
	} = $props();

	const textInput = (missing: boolean) => [
		'min-h-[52px] w-full rounded-lg border bg-surface px-3.5 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-ring',
		missing ? 'border-amber-line' : 'border-line-strong'
	];
	const row = 'flex min-h-12 w-full items-center gap-2.5 rounded-none border-0 border-t border-canvas bg-transparent px-1 text-left font-normal text-ink hover:bg-subtle-2';
</script>

<StepHeading title="Check and confirm" subtitle="Last details, then the report as a PDF." />

<Card>
	<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
		<label class="flex flex-col gap-1.5" id="w-place">
			<span class="font-bold">Departure airfield</span>
			<input id="f-place" type="text" enterkeyhint="done" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="Identifier or name" bind:value={calc.values.place} onfocus={closePad} class={textInput(!calc.values.place?.trim())} />
		</label>
		<label class="flex flex-col gap-1.5" id="w-name">
			<span class="font-bold">Pilot name</span>
			<input id="f-name" type="text" enterkeyhint="done" autocapitalize="words" autocorrect="off" spellcheck="false" autocomplete="name" placeholder="First and last name" bind:value={calc.values.name} onfocus={closePad} class={textInput(!calc.values.name?.trim())} />
		</label>
	</div>
	{#if aircraft.notes.length}
		<div class="flex flex-col gap-1.5">
			<h2 class="text-[15px] font-semibold">Manual notes to confirm</h2>
			{#each aircraft.notes as note (note.id)}
				{@const done = calc.notes[note.id] === true}
				<label id={`w-note:${note.id}`} class={['flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2', done ? 'border-line bg-surface' : 'border-amber-line bg-amber-soft']}>
					<Checkbox.Root checked={done} onCheckedChange={(checked) => (calc.notes[note.id] = checked)} aria-label={note.text} class="flex size-[26px] min-h-0 flex-none items-center justify-center rounded-md border-2 border-line-strong bg-surface p-0 text-on-accent data-[state=checked]:border-accent data-[state=checked]:bg-accent">
						{#snippet children({ checked })}{#if checked}<Icon name="check" size={16} stroke={3} />{/if}{/snippet}
					</Checkbox.Root>
					<span>{note.text}</span>
				</label>
			{/each}
		</div>
	{/if}
</Card>

{#if exceeded.length}
	<section class="flex flex-col rounded-xl border border-bad-line bg-surface px-5 pt-4 pb-2">
		<h2 class="mb-2 text-[15px] font-semibold">Exceeded limits, tap to go there</h2>
		{#each exceeded as limit (limit.id)}
			<button type="button" class={row} onclick={() => onstep(stepOfLimit(limit.id))}>
				<Badge tone="over" text="OVER" /><span class="flex-1">{limit.label}</span><span class="text-[13px] text-muted">{STEP_NAMES[stepOfLimit(limit.id)]}</span><Icon name="chevron-right" class="text-muted" />
			</button>
		{/each}
	</section>
{/if}

{#if todo.length}
	<section class="flex flex-col rounded-xl border border-line bg-surface px-5 pt-4 pb-2">
		<h2 class="mb-2 text-[15px] font-semibold">Still to do, tap to go there</h2>
		{#each todo as item (item.key)}
			<button type="button" class={row} onclick={() => ongo(item)}>
				<Badge tone="todo" text="TO DO" /><span class="flex-1">{item.label}</span><span class="text-[13px] text-muted">{item.step === 3 ? 'Here' : STEP_NAMES[item.step]}</span><Icon name="chevron-right" class="text-muted" />
			</button>
		{/each}
	</section>
{/if}

<Card class="gap-2.5!">
	{#if reportError}<div class="banner notsent" role="alert">{reportError}</div>{/if}
	{#if latestReport && reportIsCurrent}
		<div class="banner {latestReport.delivery === 'shared' ? 'unk' : 'notsent'}" role="status">{deliveryLabel(latestReport.delivery)}. Report <span class="num">{latestReport.id}</span>.</div>
		<div class="grid gap-2 sm:grid-cols-2">
			<Button variant="primary" size="lg" onclick={() => onshare(latestReport!.id)}>Share PDF</Button>
			<Button size="lg" onclick={() => onopen(latestReport!.id)}>Open PDF</Button>
		</div>
	{:else}
		{#if latestReport}<div class="banner unk" role="status">The inputs changed after report {latestReport.id}. That report stays as it was. Create a new one for the current values.</div>{/if}
		{#if !ready}<p class="text-sm text-muted">A report needs every item done and no exceeded limit.</p>{/if}
		<Button variant="primary" size="lg" disabled={!ready || creating} onclick={oncreate}>{creating ? 'Creating report' : 'Create report'}</Button>
	{/if}
	<p class="border-t border-canvas pt-2.5 text-[13px] text-muted">Once created: <strong class="text-ink-2">Share PDF</strong> and <strong class="text-ink-2">Open PDF</strong>. Reports stay on this device under Reports.</p>
</Card>
