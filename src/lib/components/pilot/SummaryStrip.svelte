<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { massText, statusWord } from '#lib/app/presentation.ts';

	let { aircraft, results, todoCount, exceededCount, onproblem, ondone }: {
		aircraft: Aircraft; results: Results; todoCount: number; exceededCount: number;
		onproblem: () => void; ondone: () => void;
	} = $props();

	let status = $derived(
		exceededCount ? { text: `${exceededCount} limit${exceededCount > 1 ? 's' : ''} over`, cls: 'border-bad bg-bad-bg text-bad', go: onproblem }
		: todoCount ? { text: `${todoCount} to do`, cls: 'border-amber-line bg-amber-bg text-amber', go: onproblem }
		: { text: 'All checked', cls: 'border-good bg-good-bg text-good', go: ondone }
	);
	const over = (phase: string) => results.exceeded.includes(`${phase}Mass`) || results.exceeded.includes(`${phase}Cg`);
</script>

<!-- Beside the step on wide screens the full results show instead, so this is only for narrower ones. -->
<div role="region" aria-label="Summary" class="sticky top-[env(safe-area-inset-top,0px)] z-10 grid grid-cols-2 items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3.5 py-2 shadow-raised sm:grid-cols-[repeat(2,minmax(0,1.4fr))_repeat(2,minmax(0,1fr))_auto] lg:hidden">
	{#each [['Takeoff', results.takeoff, 'To 50 ft'], ['Landing', results.landing, 'From 50 ft']] as const as [title, r, totalLabel] (title)}
		<div class="min-w-0">
			<small class="block truncate text-xs font-semibold">{title}{r.conditionLabel ? ` · ${r.conditionLabel}` : ''}</small>
			{#if r.status === 'ok'}
				<div class="flex gap-3.5">
					{#if r.groundRoll != null}<span class="grid"><b class="num text-xl leading-tight">{r.groundRoll} {r.unit}</b><small class="text-xs text-muted">Ground roll</small></span>{/if}
					{#if r.total != null}<span class="grid"><b class="num text-xl leading-tight">{r.total} {r.unit}</b><small class="text-xs text-muted">{totalLabel}</small></span>{/if}
				</div>
			{:else}<b class="text-amber">{statusWord(r.status)}</b>{/if}
		</div>
	{/each}
	{#each [['Takeoff', results.massBalance.takeoff, 'takeoff'], ['Landing', results.massBalance.landing, 'landing']] as const as [title, p, phase] (title)}
		<div class="min-w-0"><b class={['num block text-lg leading-tight', over(phase) && 'text-bad']}>{massText(aircraft, p.mass)}</b><small class="text-xs text-muted">{title} mass</small></div>
	{/each}
	<button type="button" class={['col-span-2 min-h-12 rounded-lg border px-3 text-[15px] font-bold sm:col-span-1', status.cls]} onclick={status.go}>{status.text}</button>
</div>
