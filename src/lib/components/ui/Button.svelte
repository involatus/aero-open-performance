<script lang="ts" module>
	export type Variant = 'default' | 'primary' | 'dark' | 'ghost' | 'danger' | 'danger-quiet';
	export type Size = 'sm' | 'md' | 'lg';
	const VARIANTS: Record<Variant, string> = {
		default: 'border-line-strong bg-surface text-ink hover:bg-subtle',
		primary: 'border-accent bg-accent text-on-accent hover:bg-accent-strong hover:border-accent-strong',
		dark: 'border-ink bg-ink text-surface hover:opacity-90',
		ghost: 'border-transparent bg-transparent text-ink hover:bg-subtle',
		danger: 'border-bad bg-bad-bg text-bad',
		'danger-quiet': 'border-line-strong bg-surface text-bad hover:bg-bad-bg'
	};
	const SIZES: Record<Size, string> = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-11 px-4', lg: 'min-h-[52px] px-5' };
	/** The same classes for any element that should look like a button, such as a Bits UI trigger. */
	export const buttonClass = (variant: Variant = 'default', size: Size = 'md') =>
		`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:border-track disabled:bg-track disabled:text-muted disabled:opacity-100 ${VARIANTS[variant]} ${SIZES[size]}`;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = { variant?: Variant; size?: Size; children: Snippet; class?: string } & (
		| ({ href: string } & HTMLAnchorAttributes)
		| ({ href?: undefined } & HTMLButtonAttributes)
	);
	let { variant = 'default', size = 'md', children, class: className = '', ...rest }: Props = $props();
</script>

{#if rest.href !== undefined}
	<a {...rest as HTMLAnchorAttributes} class={[buttonClass(variant, size), className]}>{@render children()}</a>
{:else}
	<button type="button" {...rest as HTMLButtonAttributes} class={[buttonClass(variant, size), className]}>{@render children()}</button>
{/if}
