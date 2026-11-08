<script lang="ts">
	import type { Aircraft } from '#lib/aircraft/schema.ts';
	import { documents, makeId, usedSources } from '#lib/admin/editing.ts';

	let { a, touch }: { a: Aircraft; touch: () => void } = $props();

	let docs = $derived(documents(a.sources));
	let used = $derived(usedSources(a));

	/** Changes a document everywhere it is used, including every page entry. */
	type Doc = ReturnType<typeof documents>[number];
	function edit(doc: Doc, key: 'document' | 'revision' | 'date', value: string) {
		for (const s of Object.values(a.sources)) {
			if (s.document === doc.source.document && (s.revision ?? '') === (doc.source.revision ?? '') && (s.date ?? '') === (doc.source.date ?? '')) {
				if (value.trim() || key === 'document') s[key] = value; else delete s[key];
			}
		}
		touch();
	}
	function add() {
		const name = 'Pilot\'s Operating Handbook';
		a.sources[makeId(name, Object.keys(a.sources), 'source')] = { document: docs.some((d) => d.source.document === name) ? `${name} (2)` : name };
		touch();
	}
	const inUse = (doc: Doc) => Object.entries(a.sources).some(([id, s]) => used.has(id) && s.document === doc.source.document && (s.revision ?? '') === (doc.source.revision ?? ''));
	function remove(doc: Doc) {
		for (const [id, s] of Object.entries(a.sources)) if (s.document === doc.source.document && (s.revision ?? '') === (doc.source.revision ?? '')) delete a.sources[id];
		touch();
	}
</script>

<p class="adm-hint">The documents your values come from, such as the flight manual and the weighing report. Each value then names its document and page, and Reports show them.</p>
{#each docs as d (d.id)}
	<div class="adm-card">
		<div class="adm-row">
			<label class="adm-field">Document *<input class="adm" value={d.source.document} onchange={(e) => edit(d, 'document', e.currentTarget.value)} /></label>
			<label class="adm-field">Revision<input class="adm" value={d.source.revision ?? ''} onchange={(e) => edit(d, 'revision', e.currentTarget.value)} /></label>
			<label class="adm-field">Date<input class="adm" value={d.source.date ?? ''} onchange={(e) => edit(d, 'date', e.currentTarget.value)} /></label>
		</div>
		<div class="adm-tools"><button type="button" disabled={inUse(d)} title={inUse(d) ? 'Values still refer to this document.' : ''} onclick={() => remove(d)}>{inUse(d) ? 'In use' : 'Delete'}</button></div>
	</div>
{/each}
<div><button type="button" onclick={add}>Add document</button></div>
