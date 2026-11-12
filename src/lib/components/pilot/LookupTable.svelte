<script lang="ts">
	import type { LookupView } from '#lib/app/lookup-grid.ts';

	let { view, unit, source }: { view: LookupView; unit: string | null; source: string } = $props();
	const cell = 'border border-divider px-1.5 py-1 text-right';
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="text-muted">{view.output}{unit ? `, ${unit}` : ''}, as printed{source ? ` in ${source}` : ''}. <span class="rounded bg-amber-bg px-1 font-semibold text-amber-ink">Amber</span>: printed values used. <span class="rounded bg-accent-soft px-1 font-semibold text-accent-strong">Blue</span>: your conditions, before corrections.</figcaption>
	{#each view.grids as g, gi (gi)}
		{@const notes = [...g.colHeads, ...g.rows.map((r) => r.head)].filter((h) => h.note).map((h) => h.note)}
		<div class="overflow-x-auto">
			<table class="num border-collapse">
				{#if g.title}<caption class="pb-1 text-left font-sans font-semibold">{g.title}</caption>{/if}
				<thead>
					<tr>
						<th class={[cell, 'text-left font-sans text-[11px] font-normal text-muted']} scope="col">{g.rowAxis ? `${g.rowAxis} ↓  ${g.colAxis} →` : `${g.colAxis} →`}</th>
						{#each g.colHeads as h, i (i)}<th class={[cell, h.marker ? 'bg-accent-soft text-accent-strong' : 'bg-subtle']} scope="col">{h.text}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each g.rows as row, ri (ri)}
						<tr>
							<th class={[cell, 'text-left', row.head.marker ? 'bg-accent-soft text-accent-strong' : 'bg-subtle']} scope="row">{row.head.text}</th>
							{#each row.cells as c, ci (ci)}
								<td class={[cell, c.result ? 'bg-accent font-semibold text-on-accent' : c.hit ? 'bg-amber-bg font-semibold text-amber-ink' : c.marker ? 'bg-accent-soft' : '']}>{c.text}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#each notes as note (note)}<p class="text-muted">{note}</p>{/each}
	{/each}
	{#if view.between}<p class="font-semibold">{view.between}</p>{/if}
</figure>
