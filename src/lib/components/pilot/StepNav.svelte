<script lang="ts">
	import { STEP_NAMES } from '#lib/app/calculation.ts';
	import { progressStatus } from '#lib/app/presentation.ts';
	import Icon, { type IconName } from '../ui/Icon.svelte';

	let { step, left, over, ongo }: {
		step: number;
		/** To-do items per step. */
		left: number[];
		/** Exceeded limits per step. */
		over: number[];
		ongo: (step: number) => void;
	} = $props();

	const ICONS: IconName[] = ['load', 'fuel', 'conditions', 'send'];
	const BADGE = { over: 'bg-bad text-surface', todo: 'bg-amber-line text-ink', done: 'bg-good text-surface' };
	const TEXT = { over: 'font-semibold text-bad', todo: 'text-amber', done: 'text-good' };
</script>

<!--
	Wider than a phone: "3 · Conditions" with the status in words under it.
	Phone: an icon with the status as a badge on it, and the name under it, so four steps fit across.
-->
<nav aria-label="Steps">
	<ol class="m-0 grid list-none grid-cols-4 gap-1 rounded-[10px] bg-track p-1">
		{#each STEP_NAMES as name, i (name)}
			{@const p = progressStatus(left[i], over[i])}
			<li class="min-w-0">
				<button
					type="button"
					aria-current={i === step ? 'step' : undefined}
					onclick={() => ongo(i)}
					class="group flex min-h-[52px] w-full min-w-0 flex-col items-start justify-center gap-0.5 rounded-[7px] border-0 bg-transparent px-3 py-1.5 text-left font-semibold text-ink aria-[current=step]:bg-surface aria-[current=step]:font-bold aria-[current=step]:shadow-current phone:items-center phone:px-1 phone:text-center"
				>
					<span class="relative hidden phone:block">
						<span class="block group-aria-[current=step]:text-accent"><Icon name={ICONS[i]} size={20} /></span>
						<span
							aria-hidden="true"
							class={[
								'absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold ring-2 ring-track',
								i === step && 'ring-surface',
								BADGE[p.tone]
							]}
						>
							{#if p.tone === 'over'}{over[i]}{:else if p.tone === 'todo'}{left[i]}{:else}<Icon name="check" size={10} stroke={3.5} />{/if}
						</span>
					</span>
					<span class="max-w-full truncate text-[15px] phone:text-[13px] max-[359px]:text-xs"><span class="phone:hidden group-aria-[current=step]:text-accent">{i + 1} ·</span> {name}</span>
					<span class={['phone:sr-only truncate text-xs font-normal', TEXT[p.tone]]}>
						{p.short}
					</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>
