<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		title?: string;
		description?: string;
		/** Beside the title, such as buttons or a short source note. */
		actions?: Snippet;
		children: Snippet;
		flush?: boolean;
		class?: string;
	} & HTMLAttributes<HTMLElement>;
	let { title, description, actions, children, flush = false, class: className = '', ...rest }: Props = $props();
</script>

<section {...rest} class={['flex min-w-0 flex-col rounded-xl border border-line bg-surface', flush ? 'overflow-hidden' : 'gap-3 p-5', className]}>
	{#if title || actions}
		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
			<div class="min-w-0">
				{#if title}<h2 class="text-[17px] font-semibold">{title}</h2>{/if}
				{#if description}<p class="mt-0.5 text-[13px] text-muted">{description}</p>{/if}
			</div>
			{@render actions?.()}
		</div>
	{/if}
	{@render children()}
</section>
