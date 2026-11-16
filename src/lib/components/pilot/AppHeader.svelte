<script lang="ts">
	import { DropdownMenu, Tabs } from 'bits-ui';
	import { resolve } from '$app/paths';
	import BrandMark from '../ui/BrandMark.svelte';
	import Icon from '../ui/Icon.svelte';
	import OperatorLogo from '../ui/OperatorLogo.svelte';
	import { buttonClass } from '../ui/Button.svelte';
	import type { Calculation } from '#lib/app/calculation.ts';
	import type { OperatorLogo as Logo } from '#lib/data/logo.ts';

	let {
		tabs, labels, current, inCalculation, canNextFlight, reportCount, reportsOpen, checking, isDemo, version, dataLine, operator, logo,
		onclosetab, onnextflight, onnew, onreports, oncheck, onsavedvalues
	}: {
		tabs: Calculation[]; labels: string[]; current: number;
		/** False while the aircraft list or Reports are shown, so no tab looks chosen. */
		inCalculation: boolean;
		canNextFlight: boolean; reportCount: number; reportsOpen: boolean; checking: boolean; isDemo: boolean;
		version: string; dataLine: string;
		/** From the installed data: the Operator's name and, if it has one, its logo. */
		operator: string; logo: Logo | undefined;
		onclosetab: (i: number) => void; onnextflight: () => void; onnew: () => void; onreports: () => void; oncheck: () => void; onsavedvalues: () => void;
	} = $props();

	const item = 'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-ink no-underline outline-none select-none data-highlighted:bg-subtle data-disabled:cursor-not-allowed data-disabled:text-muted';
	const menu = 'z-50 min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-menu';
</script>

<!--
	The AoP mark always comes first and stays small. The Operator's logo, when the data has one, follows it.
	A phone puts the marks and the buttons on the first line and the tabs on the second.
-->
<header class="border-b border-line bg-header pt-[env(safe-area-inset-top,0px)]">
	<div aria-hidden="true" class="h-[3px] bg-header-line"></div>
	<div class="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:px-5 phone:gap-x-2.5 phone:px-3">
		<div class="flex flex-none items-center gap-3 phone:gap-2.5">
			<BrandMark class="size-[30px] phone:size-[26px]" />
			{#if logo}
				<span aria-hidden="true" class="h-7 w-px bg-divider phone:h-[22px]"></span>
				<OperatorLogo {logo} {operator} class="h-10 max-w-[200px] phone:h-[30px] phone:max-w-[130px]" />
			{/if}
			<span aria-hidden="true" class="h-7 w-px bg-divider phone:hidden"></span>
		</div>
		<!-- A phone with no tabs open leaves out the + button: the aircraft list is already the screen, and Reports has Back. -->
		<div class={['flex min-w-0 flex-[1_1_300px] flex-wrap items-center gap-1.5 phone:order-last phone:basis-full', !tabs.length && 'phone:hidden']}>
			{#if tabs.length}
				<Tabs.List aria-label="Calculations" class="flex min-w-0 flex-wrap gap-1.5">
					{#each tabs as tab, i (tab.id)}
						{@const active = inCalculation && i === current}
						{@const rest = labels[i].slice(tab.aircraft.length).replace(/^,?\s*/, '')}
						<div class={['flex min-h-11 items-center rounded-lg', active ? 'bg-ink text-surface shadow-tab' : 'text-ink hover:bg-subtle']}>
							<Tabs.Trigger value={tab.id} class="flex min-h-11 max-w-[280px] items-center gap-2 truncate rounded-lg border-0 bg-transparent py-0 pr-2 pl-3.5 font-semibold text-inherit">
								{tab.aircraft} <span class={['truncate font-normal', active ? 'text-faint' : 'text-muted']}>{rest}</span>
							</Tabs.Trigger>
							{#if active}
								<button type="button" aria-label={`Close ${labels[i]}`} onclick={() => onclosetab(i)} class="mr-1 flex size-9 min-h-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-faint hover:text-surface"><Icon name="close" size={18} /></button>
							{/if}
						</div>
					{/each}
				</Tabs.List>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger aria-label="New calculation" class={[buttonClass('default'), 'w-11 border-dashed px-0 text-accent!']}>
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
		<div class="ml-auto flex items-center gap-1.5">
			<button
				type="button"
				aria-label={`Reports, ${reportCount}`}
				aria-pressed={reportsOpen}
				onclick={onreports}
				class={['flex min-h-11 items-center gap-2 rounded-lg border-0 px-3 font-semibold', reportsOpen ? 'bg-ink text-surface shadow-tab' : 'bg-transparent text-ink hover:bg-subtle']}
			>
				Reports <span class={['num rounded-full px-[7px] py-0.5 text-xs', reportsOpen ? 'bg-ink-2' : 'bg-accent-soft text-accent-strong']}>{reportCount}</span>
			</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger aria-label="More" class={[buttonClass('ghost'), 'w-11 px-0']}>
					<Icon name="more" size={20} />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content align="end" sideOffset={6} class={menu}>
						<DropdownMenu.Item onSelect={onsavedvalues} class={item}>My details</DropdownMenu.Item>
						<DropdownMenu.Item disabled={checking} onSelect={oncheck} class={item}>{checking ? 'Checking' : 'Check for new data'}</DropdownMenu.Item>
						<DropdownMenu.Item class={item}>
							{#snippet child({ props })}<a {...props} href={resolve('/device-test')}>Device test</a>{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Item class={item}>
							{#snippet child({ props })}<a {...props} href={resolve('/admin')}>Admin</a>{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Separator class="my-1.5 h-px bg-divider" />
						<!-- About: who made the app, and whose data it runs. -->
						<div class="flex max-w-72 flex-col gap-2 px-3 pt-1.5 pb-2">
							<div class="flex items-center gap-2">
								<BrandMark class="size-[22px]" />
								<p class="leading-tight"><span class="block text-[13px] font-semibold">Aero Open Performance</span><span class="text-xs text-muted">App version {version}</span></p>
							</div>
							<div class="flex items-center gap-2">
								{#if logo}<OperatorLogo {logo} {operator} class="h-[22px] max-w-[76px]" />{/if}
								<p class="text-xs leading-tight text-muted">{dataLine}</p>
							</div>
						</div>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	</div>
	{#if isDemo}
		<div class="border-t border-amber-edge bg-amber-bg text-[13px] text-amber-ink">
			<div class="mx-auto flex max-w-[1240px] flex-wrap gap-x-4 gap-y-1 px-4 py-1.5 sm:px-5"><strong>Fictional demo aircraft with invented data.</strong></div>
		</div>
	{/if}
</header>
