<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import Button from '../ui/Button.svelte';
	import Card from '../ui/Card.svelte';
	import Icon from '../ui/Icon.svelte';

	let { aircraft, canCancel, dataLine, checking, busy, latest, version, onchoose, oncancel, oncheck }: {
		aircraft: Aircraft[]; canCancel: boolean; dataLine: string; checking: boolean; busy: boolean;
		/** True right after a check found nothing newer. */
		latest: boolean;
		version: string;
		onchoose: (registration: string) => void; oncancel: () => void; oncheck: () => void;
	} = $props();
</script>

<div class="mx-auto flex w-full max-w-[760px] flex-col gap-4">
	<div>
		<h1 class="text-[26px] font-bold tracking-[-0.01em]">Aero Open Performance</h1>
		<p class="mt-0.5 text-muted">Mass and balance, takeoff and landing distances.</p>
	</div>
	<Card title="Choose an aircraft">
		<ul class="-mx-3.5 -mb-3.5 list-none p-0">
			{#each aircraft as a (a.registration)}
				<li>
					<button type="button" onclick={() => onchoose(a.registration)} class="flex min-h-[52px] w-full items-center gap-3 rounded-lg border-0 bg-transparent px-3.5 text-left font-normal text-ink hover:bg-subtle">
						<strong class="num">{a.registration}</strong><span class="flex-1 text-ink-2">{a.type}</span><Icon name="chevron-right" class="text-muted" />
					</button>
				</li>
			{/each}
		</ul>
	</Card>
	{#if canCancel}<div><Button size="lg" onclick={oncancel}>Cancel</Button></div>{/if}
	<Card>
		<p>{dataLine}</p>
		{#if latest}<p class="font-semibold text-good" role="status">This is the latest data.</p>{/if}
		<div><Button disabled={busy} onclick={oncheck}>{checking ? 'Checking' : 'Check for new data'}</Button></div>
	</Card>
	<p class="text-[13px] text-muted">Version {version}. <a href={resolve('/device-test')}>Device test</a>. <a href={resolve('/admin')}>Admin</a></p>
</div>
