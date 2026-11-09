<script lang="ts">
	import { STEP_NAMES } from '#lib/app/calculation.ts';

	let { step, left, over, ongo }: {
		step: number;
		/** To-do items per step. */
		left: number[];
		/** Exceeded limits per step. */
		over: number[];
		ongo: (step: number) => void;
	} = $props();
</script>

<nav aria-label="Steps">
	<ol class="m-0 grid list-none grid-cols-4 gap-1 rounded-[10px] bg-track p-1">
		{#each STEP_NAMES as name, i (name)}
			<li class="min-w-0">
				<button
					type="button"
					aria-current={i === step ? 'step' : undefined}
					onclick={() => ongo(i)}
					class="flex min-h-[52px] w-full min-w-0 flex-col items-start justify-center rounded-[7px] border-0 bg-transparent px-3 py-1.5 text-left font-semibold text-ink aria-[current=step]:bg-surface aria-[current=step]:font-bold aria-[current=step]:shadow-raised"
				>
					<span class="truncate">{i + 1} · {name}</span>
					<span class={['truncate text-xs font-normal', over[i] ? 'font-semibold text-bad' : left[i] ? 'text-amber' : 'text-good']}>
						{over[i] ? `${over[i]} over` : left[i] ? `${left[i]} to do` : 'Done'}
					</span>
				</button>
			</li>
		{/each}
	</ol>
</nav>
