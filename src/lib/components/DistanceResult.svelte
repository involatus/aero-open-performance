<script lang="ts">
	import type { PerformanceResult } from '#lib/engine/performance.ts';

	let { title, result, mass }: { title: string; result: PerformanceResult; mass: string } = $props();
	let isTotal = $derived(result.total !== null);
</script>

<div class="num">
	<h2>{title}</h2>
	{#if result.status === 'ok'}
		<b>{isTotal ? result.total : result.groundRoll} {result.unit}</b>
		<small>
			{isTotal ? `${result.groundRoll !== null ? `Ground roll ${result.groundRoll} ${result.unit}. ` : ''}Total distance.` : 'Ground roll only.'}
			{result.conditionLabel}, {mass}
		</small>
		{#each result.warnings as warning (warning)}<small class="warn">{warning}</small>{/each}
	{:else}
		<b class="none">{result.reason}</b>
		<small>{result.conditionLabel}</small>
	{/if}
</div>
