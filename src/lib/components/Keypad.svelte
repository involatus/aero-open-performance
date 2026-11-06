<script lang="ts">
	import type { Field } from '#lib/app/calculation.ts';

	let { field, value, last, onkey }: { field: Field; value: string; last: boolean; onkey: (key: string) => void } = $props();
</script>

<div class="pad" role="group" aria-label={`Keypad for ${field.label}`}>
	<div class="padhead">
		<span>{field.label}: {value || '–'} {field.unit}</span>
		<small>{field.range[0]} to {field.range[1]} {field.unit}</small>
	</div>
	<div class="keys">
		{#each ['7', '8', '9'] as k (k)}<button type="button" onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class="act" aria-label="Delete last digit" onclick={() => onkey('back')}>⌫</button>
		{#each ['4', '5', '6'] as k (k)}<button type="button" onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class="act" onclick={() => onkey('clear')}>Clear</button>
		{#each ['1', '2', '3'] as k (k)}<button type="button" onclick={() => onkey(k)}>{k}</button>{/each}
		<button type="button" class="act primary tall" onclick={() => onkey('next')}>{last ? 'Done' : 'Next field'}</button>
		<button type="button" aria-label="Plus or minus" disabled={!field.negative} onclick={() => onkey('neg')}>{field.negative ? '±' : ''}</button>
		<button type="button" onclick={() => onkey('0')}>0</button>
		<button type="button" disabled={!field.decimals} onclick={() => onkey('.')}>{field.decimals ? '.' : ''}</button>
	</div>
</div>
