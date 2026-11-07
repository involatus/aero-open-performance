<script lang="ts">
	import { documents, pruneSources, sourceFor, type Sources } from '#lib/admin/editing.ts';

	// Where a value comes from: a document and a page. The short name behind it is made automatically.
	let { aircraft, value, onchange, label = 'Source' }: { aircraft: { sources: Sources }; value: string | undefined; onchange: (id: string) => void; label?: string } = $props();

	let docs = $derived(documents(aircraft.sources));
	let current = $derived(value ? aircraft.sources[value] : undefined);
	let docIndex = $derived(current ? docs.findIndex((d) => d.source.document === current.document && (d.source.revision ?? '') === (current.revision ?? '') && (d.source.date ?? '') === (current.date ?? '')) : -1);

	function pick(index: number, page: string) {
		const doc = docs[index];
		if (!doc) return;
		onchange(sourceFor(aircraft.sources, doc.source, page));
		pruneSources(aircraft as any);
	}
</script>

<div class="adm-field adm-source">
	<span>{label}</span>
	<div class="flex gap-2">
		<select class="adm" aria-label={`${label} document`} value={docIndex === -1 ? '' : String(docIndex)} onchange={(e) => pick(Number(e.currentTarget.value), current?.page ?? '')}>
			{#if docIndex === -1}<option value="">Choose a document</option>{/if}
			{#each docs as d, i (d.id)}<option value={String(i)}>{d.source.document}{d.source.revision ? `, rev. ${d.source.revision}` : ''}</option>{/each}
		</select>
		<input class="adm" style="max-width: 7rem" aria-label={`${label} page`} placeholder="Page" value={current?.page ?? ''} onchange={(e) => pick(docIndex === -1 ? 0 : docIndex, e.currentTarget.value)} />
	</div>
</div>
