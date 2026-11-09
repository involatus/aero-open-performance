<script lang="ts">
	let { title, subtitle }: { title: string; subtitle: string } = $props();
</script>

<div>
	<h1 class="text-[26px] leading-tight font-bold tracking-[-0.01em]">{title}</h1>
	<p class="mt-0.5 text-muted">{subtitle}</p>
</div>
