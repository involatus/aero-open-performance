<script lang="ts">
	import { ToggleGroup } from 'bits-ui';

	type Option = { id: string; label: string; detail?: string };
	let {
		label, options, value, onchange, inline = false, minWidth = 104
	}: {
		label: string; options: Option[]; value: string; onchange: (id: string) => void;
		/** The label sits beside the choices instead of above them. */
		inline?: boolean;
		/** Each choice is at least this wide, so labels never wrap. */
		minWidth?: number;
	} = $props();
	const id = $props.id();
</script>

<div class={['flex min-w-0 gap-x-3 gap-y-1.5', inline ? 'flex-wrap items-center' : 'flex-col']}>
	<span id={id} class={['label-caps', inline && 'flex-[0_0_80px]']}>{label}</span>
	<!-- One option is always chosen, so tapping the current one leaves it selected. -->
	<ToggleGroup.Root
		type="single"
		{value}
		onValueChange={(next) => { if (next) onchange(next); }}
		aria-labelledby={id}
		style={`grid-template-columns: repeat(auto-fit, minmax(${minWidth}px, 1fr))`}
		class="grid min-w-0 flex-[1_1_440px] gap-1 rounded-[10px] bg-canvas p-1"
	>
		{#each options as option (option.id)}
			<ToggleGroup.Item
				value={option.id}
				class="flex min-h-11 flex-col items-center justify-center rounded-[7px] border-0 bg-transparent px-2 leading-tight font-normal whitespace-nowrap text-ink-2 data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-ink data-[state=on]:shadow-raised"
			>
				{option.label}
				{#if option.detail}<small class="num text-xs font-normal text-muted">{option.detail}</small>{/if}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</div>
