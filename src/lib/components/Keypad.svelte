<script lang="ts">
	import type { Field } from '#lib/app/calculation.ts';

	let { field, value, last, nextLabel, onkey, onclose }: {
		field: Field; value: string; last: boolean;
		/** The field that Next field goes to, said under the keys. */
		nextLabel?: string;
		onkey: (key: string) => void; onclose: () => void;
	} = $props();

	const key = 'num h-[72px] min-h-0 rounded-[10px] border border-line-strong bg-surface p-0 text-[26px] font-semibold text-ink select-none active:bg-subtle short:h-[58px]';
	const action = 'h-[72px] min-h-0 rounded-[10px] border border-line-strong bg-subtle p-0 text-[15px] font-semibold text-ink select-none active:bg-track short:h-[58px]';
</script>

<!-- Sticks to the bottom of the screen inside the step's column, so the results beside it stay in view. -->
<div
	role="group"
	aria-label={`Keypad for ${field.label}`}
	class="sticky bottom-0 z-20 -mx-1 flex flex-col gap-2.5 rounded-xl border border-accent bg-surface p-3.5 pb-[calc(14px+env(safe-area-inset-bottom,0px))] shadow-pad"
>
	<div class="flex items-center gap-3">
		<strong class="flex-1">{field.label}: <span class="num">{value || '–'}</span> {field.unit}</strong>
		<span class="text-[13px] text-muted">{field.range[0]} to {field.range[1]} {field.unit}</span>
		<button type="button" aria-label="Close keypad" onclick={onclose} class="size-11 min-h-0 rounded-lg border-0 bg-transparent p-0 text-[22px] font-normal text-ink-2 hover:bg-subtle">×</button>
	</div>
	<div class="keys grid grid-cols-4 gap-2">
		{#each ['7', '8', '9'] as k (k)}<button type="button" class={key} onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class={action} aria-label="Delete last digit" onclick={() => onkey('back')}>⌫</button>
		{#each ['4', '5', '6'] as k (k)}<button type="button" class={key} onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class={action} onclick={() => onkey('clear')}>Clear</button>
		{#each ['1', '2', '3'] as k (k)}<button type="button" class={key} onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class={[action, 'row-span-2 h-auto! border-accent! bg-accent! text-on-accent!']} onclick={() => onkey('next')}>{last ? 'Done' : 'Next field'}</button>
		<button type="button" class={[key, 'disabled:bg-subtle']} aria-label="Plus or minus" disabled={!field.negative} onclick={() => onkey('neg')}>{field.negative ? '±' : ''}</button>
		<button type="button" class={key} onclick={() => onkey('0')}>0</button>
		<button type="button" class={[key, 'disabled:bg-subtle']} disabled={!field.decimals} onclick={() => onkey('.')}>{field.decimals ? '.' : ''}</button>
	</div>
	{#if !last && nextLabel}<span class="text-xs text-muted">Next field goes to {nextLabel}.</span>{/if}
</div>
