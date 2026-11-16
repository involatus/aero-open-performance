<script lang="ts">
	/**
	 * All fuel on board as one bar, as on a fuel planning form: the final reserve at the left end, then the
	 * fuel the flight burns, then what is left over. When burn and reserve don't fit, the missing part
	 * shows past the end of the fuel, in red.
	 */
	let { onBoard, burned, reserve, minutes, club, unit }: {
		onBoard: number; burned: number; reserve: number;
		/** The reserve in minutes, and whether it is a club's longer rule. */
		minutes: number; club: boolean; unit: string;
	} = $props();

	const v = (x: number) => x.toFixed(1);
	let needed = $derived(reserve + burned);
	let scale = $derived(Math.max(onBoard, needed) || 1);
	let short = $derived(needed - onBoard > 1e-9 ? needed - onBoard : 0);
	let extra = $derived(Math.max(0, onBoard - needed));
	const pct = (x: number) => `${(Math.max(0, x) / scale) * 100}%`;
	let summary = $derived(short
		? `Not enough fuel: ${v(onBoard)} ${unit} on board, the flight and final reserve need ${v(needed)}. Short by ${v(short)}.`
		: `${v(onBoard)} ${unit} on board: final reserve ${v(reserve)}, flight ${v(burned)}, extra ${v(extra)}.`);
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3">
		<span class="label-caps">Fuel on board</span>
		<span class={['text-[13px] font-semibold', short ? 'text-bad' : 'text-good']}>{short ? `Short by ${v(short)} ${unit}` : `${v(extra)} ${unit} extra`}</span>
	</div>
	<div role="img" aria-label={summary} class="relative flex h-5 overflow-hidden rounded-md bg-track">
		<span class="reserve h-full flex-none" style:width={pct(Math.min(reserve, scale))}></span>
		<span class="h-full flex-none bg-accent" style:width={pct(burned)}></span>
		<span class="h-full flex-none bg-good-bg" style:width={pct(extra)}></span>
		{#if short}<span class="absolute top-0 bottom-0 border-l-2 border-bad" style:left={pct(onBoard)} style:right="0" style:background="repeating-linear-gradient(135deg, var(--bad-bg) 0 4px, transparent 4px 8px)"></span>{/if}
	</div>
	<ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-ink-2" aria-hidden="true">
		<li class="flex items-center gap-1.5"><span class="reserve size-3 rounded-sm"></span><span>Final reserve <span class="num">{v(reserve)} {unit}</span>, {minutes} min{club ? ', club rule' : ''}</span></li>
		<li class="flex items-center gap-1.5"><span class="size-3 rounded-sm bg-accent"></span><span>Flight <span class="num">{v(burned)} {unit}</span></span></li>
		<li class="flex items-center gap-1.5"><span class="size-3 rounded-sm border border-line-strong bg-good-bg"></span><span>Extra <span class="num">{v(extra)} {unit}</span></span></li>
	</ul>
</div>

<style>
	/* The reserve is hatched, so it reads as fuel set aside, not fuel to use. */
	.reserve { background: repeating-linear-gradient(135deg, var(--amber-line) 0 3px, var(--amber-bg) 3px 7px); }
</style>
