<script lang="ts">
	import { DropdownMenu, Tabs } from 'bits-ui';
	import { resolve } from '$app/paths';
	import Icon from '../ui/Icon.svelte';
	import { buttonClass } from '../ui/Button.svelte';
	import type { Calculation } from '#lib/app/calculation.ts';

	let {
		tabs, labels, current, inCalculation, canNextFlight, reportCount, reportsOpen, checking, isDemo, version, dataLine,
		onclosetab, onnextflight, onnew, onreports, oncheck
	}: {
		tabs: Calculation[]; labels: string[]; current: number;
		/** False while the aircraft list or Reports are shown, so no tab looks chosen. */
		inCalculation: boolean;
		canNextFlight: boolean; reportCount: number; reportsOpen: boolean; checking: boolean; isDemo: boolean;
		version: string; dataLine: string;
		onclosetab: (i: number) => void; onnextflight: () => void; onnew: () => void; onreports: () => void; oncheck: () => void;
	} = $props();

	const item = 'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-ink no-underline outline-none select-none data-highlighted:bg-subtle data-disabled:cursor-not-allowed data-disabled:text-muted';
	const menu = 'z-50 min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-menu';
</script>

<header class="border-b border-line bg-surface pt-[env(safe-area-inset-top,0px)]">
	<div class="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
		<div class="flex min-w-0 flex-[1_1_400px] flex-wrap items-center gap-1.5">
			{#if tabs.length}
				<Tabs.List aria-label="Calculations" class="flex min-w-0 flex-wrap gap-1.5">
					{#each tabs as tab, i (tab.id)}
						{@const active = inCalculation && i === current}
						{@const rest = labels[i].slice(tab.aircraft.length).replace(/^,?\s*/, '')}
						<div class={['flex min-h-11 items-center rounded-lg', active ? 'bg-ink text-surface' : 'text-ink hover:bg-subtle']}>
							<Tabs.Trigger value={tab.id} class="flex min-h-11 max-w-[280px] items-center gap-2 truncate rounded-lg border-0 bg-transparent py-0 pr-2 pl-3.5 font-semibold text-inherit">
								{tab.aircraft} <span class={['truncate font-normal', active ? 'text-faint' : 'text-muted']}>{rest}</span>
							</Tabs.Trigger>
							{#if active}
								<button type="button" aria-label={`Close ${labels[i]}`} onclick={() => onclosetab(i)} class="mr-1 size-9 min-h-0 rounded-md border-0 bg-transparent p-0 text-lg font-normal text-faint hover:text-surface">×</button>
							{/if}
						</div>
					{/each}
				</Tabs.List>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger aria-label="New calculation" class={[buttonClass('default'), 'w-11 border-dashed px-0']}>
					<Icon name="plus" size={18} />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="start" sideOffset={6} class={menu}>
						<DropdownMenu.Item disabled={!canNextFlight} onSelect={onnextflight} class={item}>
							<span class="flex flex-col leading-tight"><strong>Next flight</strong><small class="text-[13px] text-muted">Same aircraft and load, landing fuel carried over</small></span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={onnew} class={item}>
							<span class="flex flex-col leading-tight"><strong>New aircraft</strong><small class="text-[13px] text-muted">Start from the aircraft list</small></span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				aria-label={`Reports, ${reportCount}`}
				aria-pressed={reportsOpen}
				onclick={onreports}
				class={['flex min-h-11 items-center gap-2 rounded-lg border-0 px-3 font-semibold', reportsOpen ? 'bg-ink text-surface' : 'bg-transparent text-ink hover:bg-subtle']}
			>
				Reports <span class={['num rounded-full px-[7px] py-0.5 text-xs', reportsOpen ? 'bg-ink-2' : 'bg-canvas']}>{reportCount}</span>
			</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger aria-label="More" class={[buttonClass('ghost'), 'w-11 px-0']}>
					<Icon name="more" size={20} />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="end" sideOffset={6} class={menu}>
						<DropdownMenu.Item disabled={checking} onSelect={oncheck} class={item}>{checking ? 'Checking' : 'Check for new data'}</DropdownMenu.Item>
						<DropdownMenu.Item class={item}>
							{#snippet child({ props })}<a {...props} href={resolve('/device-test')}>Device test</a>{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Item class={item}>
							{#snippet child({ props })}<a {...props} href={resolve('/admin')}>Admin</a>{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Separator class="my-1.5 h-px bg-divider" />
						<p class="px-3 py-1.5 text-xs text-muted">{dataLine}<br />App version {version}</p>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	</div>
	<div class="border-t border-amber-edge bg-amber-bg text-[13px] text-amber-ink">
		<div class="mx-auto flex max-w-[1240px] flex-wrap gap-x-4 gap-y-1 px-4 py-1.5 sm:px-5">
			<strong>Pre-release, not for flight.</strong>
			{#if isDemo}<span>Fictional demo aircraft with invented data.</span>{/if}
		</div>
	</div>
</header>
