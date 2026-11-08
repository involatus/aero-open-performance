<script lang="ts">
	import type { Aircraft, Table } from '#lib/aircraft/schema.ts';
	import { getCell } from '#lib/admin/table-grid.ts';
	import { tableCheckState, tableFingerprint } from '#lib/data/table-check.ts';

	// The table drawn the way manuals print it, so a person can compare it with the page row by row.
	let { a, id, table, by, touch }: { a: Aircraft; id: string; table: Table; by: string; touch: () => void } = $props();

	const OUTPUT_LABELS: Record<string, string> = { groundRoll: 'Ground roll', total: 'Total distance' };
	let outputs = $derived(Object.keys(table.outputs) as ('total' | 'groundRoll')[]);
	let axes = $derived(table.axes as { name: string; unit: string; values: number[] }[]);
	// The last axis becomes column groups, the one before it rows, and any others separate blocks.
	let colAxis = $derived(axes[axes.length - 1]);
	let rowAxis = $derived(axes.length >= 2 ? axes[axes.length - 2] : null);
	let outer = $derived(axes.slice(0, Math.max(0, axes.length - 2)));
	let blocks = $derived.by(() => {
		let list: number[][] = [[]];
		for (const axis of outer) list = list.flatMap((p) => axis.values.map((_, i) => [...p, i]));
		return list;
	});
	let source = $derived(a.sources?.[table.source]);
	let check = $derived(tableCheckState(table));
	let blanks = $derived(blocks.some((b) => outputs.some((o) => (rowAxis ? rowAxis.values.map((_, r) => r) : [0]).some((r) => colAxis.values.some((_, c) => getCell(table.outputs[o], [...b, ...(rowAxis ? [r] : []), c]) === null)))));

	const cell = (o: 'total' | 'groundRoll', b: number[], r: number, c: number) => getCell(table.outputs[o], [...b, ...(rowAxis ? [r] : []), c]);
	function record() {
		table.checked = { by, date: new Date().toISOString().slice(0, 10), fingerprint: tableFingerprint($state.snapshot(table)) };
		touch();
	}
	function again() { delete table.checked; touch(); }
</script>

<div class="grid gap-3">
	<p class="m-0">Open {source ? `${source.document}${source.revision ? `, rev. ${source.revision}` : ''}${source.page ? `, page ${source.page}` : ''}` : 'the manual'} beside this. Compare every number with the printed table.</p>
	{#if check.status === 'checked'}<div class="banner sent" role="status">Compared with the manual by {check.by} on {check.date}. <button type="button" class="small" onclick={again}>Compare again</button></div>
	{:else if check.status === 'changed'}<div class="banner notsent" role="alert">Changed after {check.by} compared it on {check.date}. Compare it again.</div>{/if}

	{#each blocks as b (b.join('.'))}
		{#if outer.length}<h3 class="m-0 text-lg font-bold">{outer.map((axis, i) => `${axis.name} ${axis.values[b[i]]} ${axis.unit}`).join(', ')}</h3>{/if}
		<div class="overflow-x-auto">
			<table class="adm-verify" aria-label={`Table ${id}${outer.length ? `, ${outer.map((axis, i) => `${axis.name} ${axis.values[b[i]]}`).join(', ')}` : ''}`}>
				<thead>
					<tr>
						<th rowspan="2">{rowAxis ? `${rowAxis.name}, ${rowAxis.unit}` : ''}</th>
						{#each colAxis.values as v, c (c)}<th colspan={outputs.length} class="grp">{colAxis.name} {v} {colAxis.unit}</th>{/each}
					</tr>
					<tr>{#each colAxis.values as _, c (c)}{#each outputs as o (o)}<th class="sub">{OUTPUT_LABELS[o] ?? o}</th>{/each}{/each}</tr>
				</thead>
				<tbody>
					{#each rowAxis ? rowAxis.values : [null] as rv, r (r)}
						<tr>
							<th>{rv ?? ''}</th>
							{#each colAxis.values as _, c (c)}{#each outputs as o (o)}{@const v = cell(o, b, r, c)}<td class:grp={o === outputs[0]} class:missing={v === null}>{v ?? '–'}</td>{/each}{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}

	{#if check.status !== 'checked'}
		{#if blanks}<p class="adm-error">Some cells are still empty. Fill them under Tables first.</p>
		{:else}
			<button type="button" class="primary justify-self-start" onclick={record}>Every value matches the manual, checked by {by}</button>
		{/if}
	{/if}
</div>
