<script lang="ts">
	import type { OperatorLogo } from '#lib/data/logo.ts';

	/**
	 * The Operator's logo from the installed data, scaled to fit its box and never cropped.
	 * In dark mode it uses the dark version, or puts the light one on a white plate.
	 */
	let { logo, operator, class: className = '' }: { logo: OperatorLogo; operator: string; class?: string } = $props();
</script>

<picture class="contents">
	{#if logo.dark}<source srcset={logo.dark} media="(prefers-color-scheme: dark)" />{/if}
	<img src={logo.light} alt={operator} class={['block flex-none object-contain', !logo.dark && 'dark:rounded dark:bg-white dark:p-0.5', className]} />
</picture>
