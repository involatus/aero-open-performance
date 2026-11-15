<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Collapsible } from 'bits-ui';
	import Icon from '../ui/Icon.svelte';

	/**
	 * One card in an editor list, such as a condition or a station. Closed, it shows its name and
	 * `summary`, so a long list reads at a glance. `tools` (Up, Down, Delete) stay usable while closed.
	 */
	let { title, summary = '', open = $bindable(false), sub = false, tools, children }: {
		title: string; summary?: string; open?: boolean; sub?: boolean; tools?: Snippet; children: Snippet;
	} = $props();
</script>

<Collapsible.Root bind:open class={['adm-card', sub && 'sub']}>
	<div class="adm-card-head">
		<svelte:element this={sub ? 'h4' : 'h3'} class="m-0 min-w-0 flex-1">
			<Collapsible.Trigger class="group flex min-h-10 w-full items-start gap-2 border-0 bg-transparent p-0 text-left text-ink">
				<Icon name="chevron-right" size={16} class="mt-[3px] flex-none text-muted transition-transform group-data-[state=open]:rotate-90" />
				<span class="min-w-0">
					<span class={['block font-bold', sub ? 'text-[15px]' : 'text-[16px]']}>{title}</span>
					{#if summary && !open}<span class="block text-[13px] font-normal text-muted">{summary}</span>{/if}
				</span>
			</Collapsible.Trigger>
		</svelte:element>
		{#if tools}<div class="adm-tools">{@render tools()}</div>{/if}
	</div>
	<Collapsible.Content class="grid min-w-0 gap-3">{@render children()}</Collapsible.Content>
</Collapsible.Root>
