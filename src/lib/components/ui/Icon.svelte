<script lang="ts" module>
	/*
	 * Every icon in the app comes from Lucide (https://lucide.dev), through this one component,
	 * so they share one stroke style. Add a name here rather than drawing an icon or using a text glyph.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import CloudSun from '@lucide/svelte/icons/cloud-sun';
	import Delete from '@lucide/svelte/icons/delete';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Fuel from '@lucide/svelte/icons/fuel';
	import Info from '@lucide/svelte/icons/info';
	import List from '@lucide/svelte/icons/list';
	import Plus from '@lucide/svelte/icons/plus';
	import Scale from '@lucide/svelte/icons/scale';
	import Send from '@lucide/svelte/icons/send';
	import Share from '@lucide/svelte/icons/share';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import X from '@lucide/svelte/icons/x';

	const ICONS = {
		plus: Plus,
		'chevron-right': ChevronRight,
		'chevron-left': ChevronLeft,
		check: Check,
		close: X,
		list: List,
		info: Info,
		more: Ellipsis,
		backspace: Delete,
		load: Scale,
		fuel: Fuel,
		conditions: CloudSun,
		send: Send,
		share: Share,
		'add-to-home': SquarePlus
	} as const;
	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	let { name, size = 16, stroke = 2, class: className = '' }: { name: IconName; size?: number; stroke?: number; class?: string } = $props();
	const Glyph = $derived(ICONS[name]);
</script>

<!-- Decorative only: the control around it carries the name. -->
<Glyph {size} strokeWidth={stroke} aria-hidden="true" class={['flex-none', className]} />
