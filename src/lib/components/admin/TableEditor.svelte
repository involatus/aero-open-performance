<script lang="ts">
	import { Collapsible, ToggleGroup } from 'bits-ui';
	import { countBlank, emptyCells, getCell, isMultiCell, parseCell, parsePaste, reshape, setCell } from '#lib/admin/table-grid.ts';

	type Axis = { name: string; input: string; unit: string; values: number[]; below: string; above: string };
	type Table = { axes: Axis[]; outputs: Record<string, unknown>; source: string };
	let { id, table, onchange }: { id: string; table: Table; onchange: () => void } = $props();

	const OUTPUT_LABELS: Record<string, string> = { groundRoll: 'Ground roll', total: 'Total' };
	const INPUTS = [['pressureAltitude', 'Pressure altitude'], ['densityAltitude', 'Density altitude'], ['elevation', 'Elevation'], ['temperature', 'Temperature'], ['mass', 'Mass']];
	const RULES = [['none', 'No result'], ['nearest', 'Nearest value'], ['nearestWarn', 'Nearest value, with a warning']];

	let slice = $state<number[]>([]);
	let invalid = $state<Record<string, string>>({});

	// Ground roll first, then the total, side by side under each column value, as most manuals print them.
	let outputs = $derived(['groundRoll', 'total'].filter((o) => o in table.outputs));
	let lengths = $derived(table.axes.map((a) => a.values.length));
	// The last two axes form the grid, and any axes before them are chosen above it.
	let outer = $derived(table.axes.slice(0, Math.max(0, table.axes.length - 2)));
	let rowAxis = $derived(table.axes.length >= 2 ? table.axes[table.axes.length - 2] : null);
	let colAxis = $derived(table.axes[table.axes.length - 1]);
	let prefix = $derived(outer.map((_, i) => Math.min(slice[i] ?? 0, outer[i].values.length - 1)));
	let rows = $derived(rowAxis ? rowAxis.values.map((_, i) => i) : [0]);
	/** Every input column, left to right: each column value with each output. */
	let columns = $derived(colAxis.values.flatMap((_, c) => outputs.map((output) => ({ c, output }))));
	let blanks = $derived(outputs.reduce((sum, o) => sum + countBlank(table.outputs[o]), 0));

	const pathOf = (r: number, c: number) => (rowAxis ? [...prefix, r, c] : [c]);
	const keyOf = (r: number, k: number) => `${columns[k].output}:${pathOf(r, columns[k].c).join(',')}`;
	const cellId = (r: number, k: number) => `cell-${id}-${r}-${k}`;
	const unitText = (a: Axis) => (a.unit === 'C' ? '°C' : a.unit === 'F' ? '°F' : a.unit);

	function shown(r: number, k: number) {
		const key = keyOf(r, k);
		if (key in invalid) return invalid[key];
		const v = getCell(table.outputs[columns[k].output], pathOf(r, columns[k].c));
		return v === null ? '' : String(v);
	}
	function enter(r: number, k: number, text: string) {
		const parsed = parseCell(text), key = keyOf(r, k);
		if (!parsed.valid) { invalid[key] = text; return; }
		delete invalid[key];
		setCell(table.outputs[columns[k].output], pathOf(r, columns[k].c), parsed.value);
		onchange();
	}
	/** A block pasted from a spreadsheet fills cells to the right and down, in the same order as shown. */
	function paste(event: ClipboardEvent, r: number, k: number) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (!isMultiCell(text)) return;
		event.preventDefault();
		parsePaste(text).forEach((line, dr) => line.forEach((value, dk) => {
			if (r + dr < rows.length && k + dk < columns.length) enter(r + dr, k + dk, value);
		}));
	}
	function keydown(event: KeyboardEvent, r: number, k: number) {
		if (event.key === 'Enter') { event.preventDefault(); document.getElementById(cellId(r + 1, k))?.focus(); }
	}
	function reshapeAll() {
		for (const name of Object.keys(table.outputs)) table.outputs[name] = reshape(table.outputs[name], lengths);
		onchange();
	}
	function setAxisValues(axis: Axis, text: string) {
		const values = text.split(/[\s;]+/).map((t) => parseCell(t)).filter((p) => p.valid && p.value !== null).map((p) => p.value as number);
		if (!values.length) return;
		axis.values = values;
		reshapeAll();
	}
	/** Adds the next value at the same step as the last two, such as 6000 after 2000 and 4000. */
	function addValue(axis: Axis) {
		const [prev, last] = axis.values.slice(-2);
		axis.values = [...axis.values, last === undefined ? prev + 1 : last + (last - prev)];
		reshapeAll();
	}
	function toggleOutput(name: string) {
		if (name in table.outputs) { if (Object.keys(table.outputs).length > 1) delete table.outputs[name]; }
		else table.outputs[name] = emptyCells(lengths);
		onchange();
	}
	function addAxis() {
		table.axes.unshift({ name: 'New axis', input: 'mass', unit: 'kg', values: [0], below: 'none', above: 'none' });
		reshapeAll();
	}
	function removeAxis(i: number) {
		if (table.axes.length < 2) return;
		table.axes.splice(i, 1);
		for (const name of Object.keys(table.outputs)) table.outputs[name] = emptyCells(lengths);
		onchange();
	}
	const cellLabel = (r: number, k: number) =>
		`${outputs.length > 1 ? `${OUTPUT_LABELS[columns[k].output]}, ` : ''}${rowAxis ? `${rowAxis.name} ${rowAxis.values[r]}, ` : ''}${colAxis.name} ${colAxis.values[columns[k].c]}`;
	const th = 'border-b border-line px-1.5 py-1.5 text-center text-[11px] font-semibold tracking-[0.04em] text-muted uppercase';
</script>

<div class="flex flex-col gap-3">
	{#each outer as axis, i (i)}
		<div class="flex flex-wrap items-center gap-2">
			<span class="label-caps" id={`outer-${id}-${i}`}>{axis.name}</span>
			<ToggleGroup.Root type="single" value={String(prefix[i])} onValueChange={(v) => { if (v) slice[i] = Number(v); }} aria-labelledby={`outer-${id}-${i}`} class="flex flex-wrap gap-1.5">
				{#each axis.values as v, j (j)}
					<ToggleGroup.Item value={String(j)} class="num min-h-9 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-semibold text-ink-2 data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:text-accent-strong">{v.toLocaleString('en')} {unitText(axis)}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
			<button type="button" class="small" onclick={() => addValue(axis)}>Add {axis.name.toLowerCase()}</button>
		</div>
	{/each}

	<div class="-mx-5 overflow-x-auto border-y border-line px-5">
		<table class="w-auto border-collapse" aria-label={`Table ${id}${outputs.length === 1 ? `, ${OUTPUT_LABELS[outputs[0]]}` : ''}`}>
			<thead>
				<tr>
					<th rowspan={outputs.length > 1 ? 2 : 1} class={[th, 'pr-3 text-left']}>{rowAxis ? `${rowAxis.name}, ${unitText(rowAxis)}` : ''}</th>
					{#each colAxis.values as v, c (c)}
						<th colspan={outputs.length} class={[th, 'num border-l border-divider text-ink-2']}>{v.toLocaleString('en')} {unitText(colAxis)}</th>
					{/each}
				</tr>
				{#if outputs.length > 1}
					<tr>
						{#each columns as col, k (k)}
							<th class={[th, 'normal-case', col.output === outputs[0] && 'border-l border-divider', col.output === 'groundRoll' && 'bg-subtle-2']}>{OUTPUT_LABELS[col.output]}</th>
						{/each}
					</tr>
				{/if}
			</thead>
			<tbody>
				{#each rows as r (r)}
					<tr>
						<th class="num border-b border-divider py-1 pr-3 text-left text-sm font-semibold">{rowAxis ? rowAxis.values[r].toLocaleString('en') : OUTPUT_LABELS[outputs[0]]}</th>
						{#each columns as col, k (k)}
							{@const bad = keyOf(r, k) in invalid}
							<td class={['border-b border-divider p-0.5', col.output === outputs[0] && 'border-l border-divider pl-1', col.output === 'groundRoll' && outputs.length > 1 && 'bg-subtle-2']}>
								<input id={cellId(r, k)} class="adm-cell" class:adm-bad={bad} inputmode="decimal" autocomplete="off" value={shown(r, k)} aria-invalid={bad} aria-label={cellLabel(r, k)} onchange={(e) => enter(r, k, e.currentTarget.value)} onpaste={(e) => paste(e, r, k)} onkeydown={(e) => keydown(e, r, k)} />
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if rowAxis}<button type="button" class="small" onclick={() => addValue(rowAxis!)}>Add {rowAxis.name.toLowerCase()}</button>{/if}
		<button type="button" class="small" onclick={() => addValue(colAxis)}>Add {colAxis.name.toLowerCase()}</button>
		<span class="text-[13px] text-muted">{Object.keys(invalid).length ? 'Red cells aren\'t numbers, so they weren\'t saved. ' : ''}{blanks ? `${blanks} cells still empty. ` : ''}Paste a block from a spreadsheet into any cell. Enter moves down.</span>
	</div>

	<Collapsible.Root>
		<Collapsible.Trigger class="min-h-10 border-0 bg-transparent p-0 text-sm font-semibold text-accent">Axes, outputs and source</Collapsible.Trigger>
		<Collapsible.Content class="flex flex-col gap-2 pt-2">
			{#each table.axes as axis, i (i)}
				<div class="grid grid-cols-2 gap-2 rounded-[10px] border border-line bg-subtle-2 p-3 md:grid-cols-6">
					<label class="adm-field">Axis name<input class="adm" bind:value={axis.name} oninput={onchange} /></label>
					<label class="adm-field">Uses<select class="adm" bind:value={axis.input} onchange={onchange}>{#each INPUTS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					<label class="adm-field">Unit<input class="adm" bind:value={axis.unit} oninput={onchange} placeholder="m, ft, C, F, kg, lb" /></label>
					<label class="adm-field">Values, rising<input class="adm" value={axis.values.join(' ')} onchange={(e) => setAxisValues(axis, e.currentTarget.value)} aria-label={`${axis.name} values`} /></label>
					<label class="adm-field">Below the table<select class="adm" bind:value={axis.below} onchange={onchange}>{#each RULES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					<label class="adm-field">Above the table<select class="adm" bind:value={axis.above} onchange={onchange}>{#each RULES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					{#if table.axes.length > 1}<div class="col-span-2 md:col-span-6"><button type="button" class="small" onclick={() => removeAxis(i)}>Remove this axis</button></div>{/if}
				</div>
			{/each}
			<div class="flex flex-wrap items-center gap-3">
				<button type="button" class="small" onclick={addAxis}>Add an axis</button>
				<label class="adm-check"><input type="checkbox" checked={'groundRoll' in table.outputs} onchange={() => toggleOutput('groundRoll')} /> Ground roll</label>
				<label class="adm-check"><input type="checkbox" checked={'total' in table.outputs} onchange={() => toggleOutput('total')} /> Total distance</label>
				<label class="adm-field min-w-48 flex-1">Source<input class="adm" bind:value={table.source} oninput={onchange} /></label>
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
</div>
