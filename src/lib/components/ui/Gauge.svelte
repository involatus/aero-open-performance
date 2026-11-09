<script lang="ts">
	import { Meter } from 'bits-ui';

	let { value, max, label, size = 'md', tone = 'accent' }: { value: number; max: number; label: string; size?: 'sm' | 'md'; tone?: 'accent' | 'bad' } = $props();
	let percent = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
</script>

<Meter.Root {value} min={0} {max} aria-label={label} class={['w-full overflow-hidden rounded-full', size === 'sm' ? 'h-1.5 bg-canvas' : 'h-2 bg-track']}>
	<div class={['h-full', tone === 'bad' ? 'bg-bad' : 'bg-accent']} style={`width: ${percent}%`}></div>
</Meter.Root>
