<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import type { Calculation as Results } from '#lib/engine/index.ts';
	import { massText, progressStatus, statusWord } from '#lib/app/presentation.ts';
	import { covers } from '../ui/covers.ts';

	let { aircraft, results, todoCount, exceededCount, compact = false, onproblem, ondone }: {
		aircraft: Aircraft; results: Results; todoCount: number; exceededCount: number;
		/** The keypad is open: on a phone, show one line so the field being typed has room. */
		compact?: boolean;
		onproblem: () => void; ondone: () => void;
	} = $props();

	const STATUS_CLASS = { over: 'border-bad bg-bad-bg text-bad', todo: 'border-amber-line bg-amber-bg text-amber', done: 'border-good bg-good-bg text-good' };
	let status = $derived.by(() => {
		const p = progressStatus(todoCount, exceededCount);
		return { text: p.long, cls: STATUS_CLASS[p.tone], go: p.tone === 'done' ? ondone : onproblem };
	});
	const over = (phase: string) => results.exceeded.includes(`${phase}Mass`) || results.exceeded.includes(`${phase}Cg`);
</script>

<!-- Beside the step on wide screens the full results show instead, so this is only for narrower ones. -->
<div role="region" aria-label="Summary" {@attach covers('top', compact)} class="sticky top-[env(safe-area-inset-top,0px)] z-10 rounded-xl border border-line bg-surface shadow-raised lg:hidden">
	<!-- While typing on a phone: both masses and the status on one line. The masses are what each key changes. -->
	{#if compact}
		<div class="hidden min-h-12 items-center gap-3 py-1 pr-1 pl-3.5 phone:flex">
			{#each [['TO', results.massBalance.takeoff, 'takeoff', 'Takeoff mass'], ['LDG', results.massBalance.landing, 'landing', 'Landing mass']] as const as [short, p, phase, label] (short)}
				<span class="flex min-w-0 items-baseline gap-1.5">
					<small class="text-xs font-semibold text-muted"><span aria-hidden="true">{short}</span><span class="sr-only">{label}</span></small>
					<b class={['num truncate text-base', over(phase) && 'text-bad']}>{massText(aircraft, p.mass)}</b>
				</span>
			{/each}
			<button type="button" class={['ml-auto min-h-10 flex-none rounded-lg border px-2.5 text-sm font-bold', status.cls]} onclick={status.go}>{status.text}</button>
		</div>
	{/if}
	<div class={['grid grid-cols-2 items-center gap-x-4 gap-y-1 px-3.5 py-2 sm:grid-cols-[repeat(2,minmax(0,1.4fr))_repeat(2,minmax(0,1fr))_auto]', compact && 'phone:hidden']}>
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
</div>
