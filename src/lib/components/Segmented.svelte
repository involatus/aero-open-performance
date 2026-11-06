<script lang="ts">
	import { ToggleGroup } from 'bits-ui';

	type Option = { id: string; label: string };
	let { label, options, value, onchange }: { label: string; options: Option[]; value: string; onchange: (id: string) => void } = $props();
</script>

<div class="grid min-w-0 gap-1">
	<span class="text-[15px] font-semibold">{label}</span>
	<!-- One option is always chosen, so tapping the current one leaves it selected. -->
	<ToggleGroup.Root type="single" {value} onValueChange={(next) => { if (next) onchange(next); }} aria-label={label} class="grid auto-cols-fr grid-flow-col">
		{#each options as option (option.id)}
			<ToggleGroup.Item value={option.id} class="-ml-px min-h-[52px] truncate border border-line bg-panel px-1 font-semibold text-ink first:ml-0 first:rounded-l-[5px] last:rounded-r-[5px] data-[state=on]:relative data-[state=on]:border-accent data-[state=on]:bg-accent data-[state=on]:text-accent-ink">{option.label}</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</div>
