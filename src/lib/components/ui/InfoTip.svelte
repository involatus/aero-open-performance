<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Popover } from 'bits-ui';
	import Icon from './Icon.svelte';

	/** A small info icon that shows its text on hover, or on tap where there is no hover. `label` names the button for screen readers. */
	let { label, children }: { label: string; children: Snippet } = $props();
</script>

<Popover.Root>
	<Popover.Trigger openOnHover openDelay={150} aria-label={label} class="-my-1 inline-flex size-6 flex-none cursor-help items-center justify-center rounded-full border-0 bg-transparent p-0 align-middle text-muted hover:text-ink focus-visible:text-ink focus-visible:outline-2 focus-visible:outline-accent">
		<Icon name="info" size={14} />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content side="top" sideOffset={4} collisionPadding={12} class="z-50 max-w-72 rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-snug text-ink-2 shadow-menu">
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
