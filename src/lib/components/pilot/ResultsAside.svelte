<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import type { Limit } from '#lib/engine/mass-balance.ts';
	import { limitText } from '#lib/engine/mass-balance.ts';
	import type { Calculation, ToDo } from '#lib/app/calculation.ts';
	import { isVariableWind } from '#lib/app/calculation.ts';
	import { altitudeText, armText, limitBadge, statusWord, windChoiceText, windText } from '#lib/app/presentation.ts';
	import type { PerformanceResult } from '#lib/engine/performance.ts';
	import CgChart from '../CgChart.svelte';
	import Badge from '../ui/Badge.svelte';
	import Icon from '../ui/Icon.svelte';
	import Working from './Working.svelte';

	let { aircraft, results, calc, todo, exceeded, dataLine, onproblem }: {
		aircraft: Aircraft; results: Results; calc: Calculation; todo: ToDo[]; exceeded: Limit[];
		dataLine: string;
		/** Goes to the first exceeded limit, or else the first item to do. */
		onproblem: () => void;
	} = $props();

	// Load and fuel set the masses, so those steps lead with them. Conditions and Send lead with distances.
	let massFirst = $derived(calc.step < 2);
	let limits = $derived(results.massBalance.limits);
	let altitude = $derived(altitudeText(results));
	let wind = $derived(windText(results.wind, isVariableWind(calc)));
	let runway = $derived(calc.airfield?.runway);
	const thousands = (x: number) => x.toLocaleString('en');
	const mass = (x: number) => thousands(Number(x.toFixed(aircraft.display.massDecimals)));
	const tone = (s: Limit['status']) => ({ ok: 'ok', warnb: 'todo', fail: 'over' } as const)[limitBadge(s).tone];
	const massOver = (phase: 'takeoff' | 'landing') => results.exceeded.includes(`${phase}Mass`) || results.exceeded.includes(`${phase}Cg`);
	const maxOf = (id: string) => limits.find((l) => l.id === id)?.limit;
	const row = 'flex min-h-12 w-full items-center gap-3 rounded-lg border-0 bg-transparent px-3.5 py-1.5 font-normal text-ink hover:bg-subtle';
</script>

{#snippet distances(title: string, r: PerformanceResult, totalLabel: string, first: boolean)}
	<div class={['flex flex-col gap-2 px-5 py-4', !first && 'border-t border-divider']}>
		<span class="label-caps">{title}{r.conditionLabel ? ` · ${r.conditionLabel}` : ''}</span>
		{#if r.status === 'ok'}
			<div class="grid grid-cols-2 gap-3">
				{#each [['Ground roll', r.groundRoll], [totalLabel, r.total]] as const as [label, value], k (label)}
					<div class={['flex min-w-0 flex-col', k === 1 && 'border-l border-divider pl-3']}>
						<span class="text-[13px] text-ink-2">{label}</span>
						<span>{#if value !== null}<span class="num text-[32px] leading-[1.15] font-semibold tracking-[-0.02em]">{thousands(value)}</span> <span class="text-muted">{r.unit}</span>{:else}<span class="text-muted">Not in the manual</span>{/if}</span>
					</div>
				{/each}
			</div>
			{#each r.warnings as warning (warning)}<span class="text-[13px] font-semibold text-amber">{warning}</span>{/each}
		{:else}
			<span class="text-[17px] font-semibold text-amber">{r.reason ?? statusWord(r.status)}</span>
		{/if}
		{#if first && runway?.lengthM}
			<span class="text-[13px] text-ink-2">Runway {runway.designator} · <span class="num">{thousands(runway.lengthM)} m ({thousands(Math.round(runway.lengthM / 0.3048))} ft)</span> available</span>
		{/if}
	</div>
{/snippet}

{#snippet statusRow(icon: 'ok' | 'todo' | 'over' | 'list', title: string, detail: string)}
	<span class={['flex size-[26px] flex-none items-center justify-center rounded-full text-[13px] font-semibold', { ok: 'bg-good-bg text-good', todo: 'num bg-amber-bg text-amber', over: 'num bg-bad-bg text-bad', list: 'bg-canvas text-ink-2' }[icon]]}>
		{#if icon === 'ok'}<Icon name="check" size={14} stroke={3} />{:else if icon === 'list'}<Icon name="list" size={14} />{:else}{icon === 'todo' ? todo.length : exceeded.length}{/if}
	</span>
	<span class="flex-1 text-left"><strong>{title}</strong><br /><span class="text-[13px] font-normal text-muted">{detail}</span></span>
	<Icon name="chevron-right" class="text-muted" />
{/snippet}

<aside aria-label="Results" class="flex min-w-0 flex-col gap-3">
	{#if massFirst}
		<section class="overflow-hidden rounded-xl border border-line bg-surface">
			<dl class="m-0 grid grid-cols-2">
				{#each [['Takeoff mass', results.massBalance.takeoff, 'takeoff'], ['Landing mass', results.massBalance.landing, 'landing']] as const as [label, point, phase], k (label)}
					<div class={['px-5 py-4', k === 0 && 'border-r border-divider']}>
						<dt class="label-caps">{label}</dt>
						<dd class="m-0">
							<span class={['num text-[28px] font-semibold', massOver(phase) && 'text-bad']}>{mass(point.mass)}</span> <span class="text-muted">{aircraft.units.mass}</span><br />
							<span class="text-[13px] text-ink-2">CG {armText(aircraft, point.arm)}{maxOf(`${phase}Mass`) !== undefined ? ` · max ${thousands(maxOf(`${phase}Mass`)!)}` : ''}</span>
						</dd>
					</div>
				{/each}
			</dl>
			<figure class="m-0 border-t border-divider px-4 pt-1 pb-3">
				<div class="mx-auto max-w-[420px]"><CgChart {aircraft} {results} configuration={calc.configuration} /></div>
			</figure>
		</section>
	{:else}
		<section class="overflow-hidden rounded-xl border border-line bg-surface">
			{@render distances('Takeoff', results.takeoff, 'Over 50 ft obstacle', true)}
			{@render distances('Landing', results.landing, 'From 50 ft obstacle', false)}
			<dl class="m-0 grid grid-cols-2 border-t border-divider bg-subtle-2">
				<div class="border-r border-divider px-5 py-3"><dt class="label-caps text-[11px]">Takeoff mass</dt><dd class="m-0"><span class={['num font-semibold', massOver('takeoff') && 'text-bad']}>{mass(results.massBalance.takeoff.mass)} {aircraft.units.mass}</span><br /><span class="text-xs text-muted">CG {armText(aircraft, results.massBalance.takeoff.arm)}</span></dd></div>
				<div class="px-5 py-3"><dt class="label-caps text-[11px]">Landing mass</dt><dd class="m-0"><span class={['num font-semibold', massOver('landing') && 'text-bad']}>{mass(results.massBalance.landing.mass)} {aircraft.units.mass}</span><br /><span class="text-xs text-muted">CG {armText(aircraft, results.massBalance.landing.arm)}</span></dd></div>
				<div class="border-t border-r border-divider px-5 py-3"><dt class="label-caps text-[11px]">Density alt.</dt><dd class="m-0">{#if altitude}<span class="num font-semibold">{altitude.density}</span><br /><span class="text-xs text-muted">PA {altitude.pressure}</span>{:else}<span class="text-[13px] font-semibold text-amber">Enter elevation and QNH</span>{/if}</dd></div>
				<div class="border-t border-divider px-5 py-3"><dt class="label-caps text-[11px]">Wind</dt><dd class="m-0">{#if wind}<span class="num font-semibold">{wind.headline}</span><br /><span class="text-xs text-muted">{wind.detail}</span>{#if (calc.windForDistances ?? 'entered') !== 'entered'}<br /><span class="text-xs font-semibold text-ink-2">Distances: {windChoiceText(results, calc.windForDistances)}</span>{/if}{:else}<span class="text-[13px] font-semibold text-amber">Enter wind and runway</span>{/if}</dd></div>
			</dl>
		</section>
	{/if}

	{#if calc.step === 0}
		<section class="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-5 py-3.5">
			<h2 class="mb-1.5 text-[15px] font-semibold">Limits</h2>
			{#each limits as limit (limit.id)}
				<div class="flex min-h-9 items-center gap-2.5 text-sm">
					<Badge tone={tone(limit.status)} text={limitBadge(limit.status).text} />
					<span><strong>{limit.label}</strong> <span class="text-ink-2">{limitText(aircraft, limit)}</span></span>
				</div>
			{/each}
			<Collapsible.Root>
				<Collapsible.Trigger class="mt-1.5 min-h-11 border-0 bg-transparent p-0 font-semibold text-accent">Show the working</Collapsible.Trigger>
				<Collapsible.Content class="pt-2"><Working {aircraft} {results} /></Collapsible.Content>
			</Collapsible.Root>
		</section>
	{:else}
		<section class="flex flex-col rounded-xl border border-line bg-surface p-1.5">
			{#if exceeded.length}
				<button type="button" class={row} onclick={onproblem}>{@render statusRow('over', `${exceeded.length} limit${exceeded.length > 1 ? 's' : ''} exceeded`, exceeded.map((l) => l.label).join(', '))}</button>
			{:else}
				<div class={[row, 'hover:bg-transparent']}>
					<span class="flex size-[26px] flex-none items-center justify-center rounded-full bg-good-bg text-good"><Icon name="check" size={14} stroke={3} /></span>
					<span class="flex-1"><strong>All {limits.length} limits within</strong><br /><span class="text-[13px] text-muted">Mass, CG, stations and tanks</span></span>
				</div>
			{/if}
			{#if todo.length}
				<button type="button" class={[row, 'border-t border-divider']} onclick={onproblem}>{@render statusRow('todo', `${todo.length} to do before a Report`, `Next: ${todo[0].label.charAt(0).toLowerCase()}${todo[0].label.slice(1)}`)}</button>
			{/if}
			<Collapsible.Root>
				<Collapsible.Trigger class={[row, 'rounded-lg border-t border-divider']}>{@render statusRow('list', 'Working and CG chart', 'Every step with its manual page')}</Collapsible.Trigger>
				<Collapsible.Content class="flex flex-col gap-3 px-3.5 pt-2 pb-3">
					{#if !massFirst}<div class="mx-auto w-full max-w-[420px]"><CgChart {aircraft} {results} configuration={calc.configuration} /></div>{/if}
					<Working {aircraft} {results} />
				</Collapsible.Content>
			</Collapsible.Root>
		</section>
	{/if}

	<p class="mx-1 text-xs text-muted">{dataLine}</p>
</aside>
