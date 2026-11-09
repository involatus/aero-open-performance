<script lang="ts">
	import { deliveryLabel, RETENTION_DAYS, type StoredReport } from '#lib/report/report.ts';
	import Button from '../ui/Button.svelte';
	import Card from '../ui/Card.svelte';

	let { reports, error, onshare, onopen, ondelete, onback }: {
		reports: StoredReport[]; error: string;
		onshare: (id: string) => void; onopen: (id: string) => void; ondelete: (id: string) => void; onback: () => void;
	} = $props();

	// Deleting asks for a second tap on the same report.
	let confirming = $state<string | null>(null);
	function remove(id: string) {
		if (confirming !== id) { confirming = id; return; }
		confirming = null;
		ondelete(id);
	}
	const tone = { notSent: 'text-bad', shared: 'text-amber', sent: 'text-good' } as Record<string, string>;
</script>

<div class="mx-auto flex w-full max-w-[760px] flex-col gap-4">
	<div>
		<h1 class="text-[26px] font-bold tracking-[-0.01em]">Reports</h1>
		<p class="mt-0.5 text-muted">Reports stay only on this device, for {RETENTION_DAYS} days. Reports not yet sent stay until you send or delete them. Clearing browser data or losing this device loses them.</p>
	</div>
	{#if error}<div class="banner notsent" role="alert">{error}</div>{/if}
	<Card flush>
		{#if !reports.length}<p class="p-5">No reports yet. Reports appear here once you create them on the Send step.</p>{/if}
		<ul class="m-0 list-none p-0" aria-label="Reports">
			{#each reports as report (report.id)}
				<li class="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-5 py-3.5 first:border-t-0">
					<div class="min-w-0">
						<strong>{report.label}</strong><br />
						<span class="num text-[13px] text-muted">{report.id}</span><br />
						<span class={['text-sm font-bold', tone[report.delivery]]}>{deliveryLabel(report.delivery)}</span>
					</div>
					<div class="flex flex-wrap gap-1.5">
						<Button variant="primary" onclick={() => onshare(report.id)}>Share PDF</Button>
						<Button onclick={() => onopen(report.id)}>Open PDF</Button>
						<Button variant={confirming === report.id ? 'danger' : 'danger-quiet'} onclick={() => remove(report.id)}>{confirming === report.id ? 'Tap again to delete' : 'Delete'}</Button>
					</div>
				</li>
			{/each}
		</ul>
	</Card>
	<div><Button size="lg" onclick={onback}>Back</Button></div>
</div>
