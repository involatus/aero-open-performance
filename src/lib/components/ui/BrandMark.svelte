<script lang="ts">
	import { MARK_SVG } from '#lib/brand.ts';

	/** The AoP logo. Size it with a class, such as size-[30px]. */
	let { class: className = '' }: { class?: string } = $props();
</script>

<!-- The SVG is docs/brand/aop-mark.svg itself. Only its square takes the theme's colour, so it shows on the navy header in dark mode. -->
<span role="img" aria-label="Aero Open Performance" class={['block flex-none overflow-hidden rounded-[22%] [&>svg]:block [&>svg]:size-full [&>svg>rect:first-child]:fill-(--brand-tile)', className]}>
	{@html MARK_SVG}
</span>
