<script lang="ts" module>
	const PATHS = {
		plus: 'M12 5v14M5 12h14',
		'chevron-right': 'M9 6l6 6-6 6',
		'chevron-left': 'M15 6l-6 6 6 6',
		check: 'M5 12l5 5 9-10',
		close: 'M6 6l12 12M18 6L6 18',
		list: 'M4 6h16M4 12h16M4 18h10',
		slope: 'M4 18L20 6',
		info: 'M12 8v5M12 16h.01'
	} as const;
	export type IconName = keyof typeof PATHS | 'more' | 'info';
</script>

<script lang="ts">
	let { name, size = 16, stroke = 2, class: className = '' }: { name: IconName; size?: number; stroke?: number; class?: string } = $props();
</script>

<!-- Decorative only: the control around it carries the name. -->
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={['flex-none', className]}>
	{#if name === 'more'}
		<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="9" /><path d={PATHS.info} />
	{:else}
		<path d={PATHS[name]} />
	{/if}
</svg>
