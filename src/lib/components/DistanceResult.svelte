<script lang="ts">
	import type { DistanceText } from '#lib/app/presentation.ts';

	let { text }: { text: DistanceText } = $props();
</script>

<div class="num">
	<h2>{text.title}</h2>
	<b class:none={text.status !== 'ok'}>{text.headline}</b>
	<small>{text.detail}</small>
	{#each text.warnings as warning (warning)}<small class="warn">{warning}</small>{/each}
</div>
