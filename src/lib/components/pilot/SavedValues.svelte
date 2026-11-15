<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { removeMass, type SavedMass } from '#lib/app/my-values.ts';
	import Button from '../ui/Button.svelte';

	/**
	 * Managing the pilot's saved values: rarely needed, so it lives behind the menu and the "Edit" link
	 * next to the one-tap buttons, not on the Load step itself.
	 */
	let { open = $bindable(false), saved, onsaved, name, onname }: { open?: boolean; saved: SavedMass[]; onsaved: (list: SavedMass[]) => void; name: string; onname: (n: string) => void } = $props();
	const kg = (s: SavedMass) => `${Number(s.kg.toFixed(1))} kg`;
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-ink/40" />
		<Dialog.Content class="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-menu">
			<div>
				<Dialog.Title class="text-[17px] font-bold">My details</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted">Kept on this device only.</Dialog.Description>
			</div>
			<label class="flex flex-col gap-1.5 text-sm font-semibold">Pilot name, filled into new calculations
				<input class="min-h-11 rounded-lg border border-line-strong bg-surface px-3 font-normal" autocomplete="name" value={name} onchange={(e) => onname(e.currentTarget.value)} placeholder="First and last name" />
			</label>
			<p class="mt-1 text-sm font-semibold">Saved weights <span class="font-normal text-muted">· people on seats, things in baggage areas. Add one with "Remember" under a field.</span></p>
			{#if saved.length}
				<ul class="m-0 flex list-none flex-col p-0">
					{#each saved as s (s.id)}
						<li class="flex min-h-11 items-center justify-between gap-3 border-b border-divider last:border-b-0">
							<span><strong>{s.label}</strong> <span class="num text-ink-2">{kg(s)}</span> <span class="text-[13px] text-muted">{(s.kind ?? 'person') === 'item' ? 'baggage' : 'person'}</span></span>
							<Button size="sm" variant="danger-quiet" onclick={() => onsaved(removeMass(saved, s.id))}>Delete</Button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-ink-2">None saved yet.</p>
			{/if}
			<div class="flex justify-end"><Dialog.Close class="min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold">Done</Dialog.Close></div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
