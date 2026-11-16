<script lang="ts">
	import { ILLUSTRATIONS, type IllustrationName } from '#lib/brand.ts';

	/** One of the module illustrations from docs/brand/icons, for large places such as empty states. Lucide stays for small icons. */
	let { name, class: className = 'size-14' }: { name: IllustrationName; class?: string } = $props();
</script>

<img src={ILLUSTRATIONS[name]} alt="" aria-hidden="true" class={['block flex-none rounded-[22%]', className]} />
