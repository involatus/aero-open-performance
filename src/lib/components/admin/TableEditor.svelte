<script lang="ts">
	import { countBlank, differingCells, emptyCells, getCell, isMultiCell, parseCell, parsePaste, reshape, setCell } from '#lib/admin/table-grid.ts';

	type Axis = { name: string; input: string; unit: string; values: number[]; below: string; above: string };
	type Table = { axes: Axis[]; outputs: Record<string, unknown>; source: string };
	let { id, table, compareWith = null, secondEntry = false, onchange }: {
		id: string; table: Table; compareWith?: Table | null; secondEntry?: boolean; onchange: () => void;
	} = $props();

	const OUTPUT_LABELS: Record<string, string> = { total: 'Total distance', groundRoll: 'Ground roll' };
	const INPUTS = [['pressureAltitude', 'Pressure altitude'], ['densityAltitude', 'Density altitude'], ['elevation', 'Elevation'], ['temperature', 'Temperature'], ['mass', 'Mass']];
	const RULES = [['none', 'No result'], ['nearest', 'Nearest value'], ['nearestWarn', 'Nearest value, with a warning']];

	let output = $state('total');
	let slice = $state<number[]>([]);
	let invalid = $state<Record<string, string>>({});
	let showDifferences = $state(false);

	let outputs = $derived(Object.keys(table.outputs));
	let active = $derived(outputs.includes(output) ? output : outputs[0]);
	let lengths = $derived(table.axes.map((a) => a.values.length));
	// The last two axes form the grid, and any axes before them are chosen above it.
	let outer = $derived(table.axes.slice(0, Math.max(0, table.axes.length - 2)));
	let rowAxis = $derived(table.axes.length >= 2 ? table.axes[table.axes.length - 2] : null);
	let colAxis = $derived(table.axes[table.axes.length - 1]);
	let prefix = $derived(outer.map((_, i) => Math.min(slice[i] ?? 0, outer[i].values.length - 1)));
	let rows = $derived(rowAxis ? rowAxis.values.map((_, i) => i) : [0]);
	let cols = $derived(colAxis ? colAxis.values.map((_, i) => i) : []);
	let cells = $derived(table.outputs[active]);
	let differences = $derived(compareWith ? new Set(differingCells(compareWith.outputs[active], cells).map((p) => p.join(','))) : new Set<string>());
	let blanks = $derived(countBlank(cells));

	const pathOf = (r: number, c: number) => (rowAxis ? [...prefix, r, c] : [c]);
	const keyOf = (r: number, c: number) => `${active}:${pathOf(r, c).join(',')}`;
	const cellId = (r: number, c: number) => `cell-${id}-${r}-${c}`;

	function shown(r: number, c: number) {
		const key = keyOf(r, c);
		if (key in invalid) return invalid[key];
		const v = getCell(cells, pathOf(r, c));
		return v === null ? '' : String(v);
	}
	function enter(r: number, c: number, text: string) {
		const parsed = parseCell(text), key = keyOf(r, c);
		showDifferences = false;
		if (!parsed.valid) { invalid[key] = text; return; }
		delete invalid[key];
		setCell(cells, pathOf(r, c), parsed.value);
		onchange();
	}
	function paste(event: ClipboardEvent, r: number, c: number) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (!isMultiCell(text)) return;
		event.preventDefault();
		parsePaste(text).forEach((line, dr) => line.forEach((value, dc) => {
			if (r + dr < rows.length && c + dc < cols.length) enter(r + dr, c + dc, value);
		}));
	}
	function keydown(event: KeyboardEvent, r: number, c: number) {
		if (event.key === 'Enter') { event.preventDefault(); document.getElementById(cellId(r + 1, c))?.focus(); }
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
</script>

<div class="grid gap-3">
	{#if !secondEntry}
		<div class="grid gap-2">
			{#each table.axes as axis, i (i)}
				<div class="grid grid-cols-2 gap-2 rounded-[5px] border border-line p-2 md:grid-cols-6">
					<label class="grid gap-1 text-sm font-semibold">Axis name<input class="adm" bind:value={axis.name} oninput={onchange} /></label>
					<label class="grid gap-1 text-sm font-semibold">Uses<select class="adm" bind:value={axis.input} onchange={onchange}>{#each INPUTS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					<label class="grid gap-1 text-sm font-semibold">Unit<input class="adm" bind:value={axis.unit} oninput={onchange} placeholder="m, ft, C, F, kg, lb" /></label>
					<label class="grid gap-1 text-sm font-semibold">Values, rising<input class="adm" value={axis.values.join(' ')} onchange={(e) => setAxisValues(axis, e.currentTarget.value)} aria-label={`${axis.name} values`} /></label>
					<label class="grid gap-1 text-sm font-semibold">Below the table<select class="adm" bind:value={axis.below} onchange={onchange}>{#each RULES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					<label class="grid gap-1 text-sm font-semibold">Above the table<select class="adm" bind:value={axis.above} onchange={onchange}>{#each RULES as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
					{#if table.axes.length > 1}<button type="button" class="col-span-2 md:col-span-6" onclick={() => removeAxis(i)}>Remove this axis</button>{/if}
				</div>
			{/each}
			<div class="flex flex-wrap items-center gap-2">
				<button type="button" onclick={addAxis}>Add an axis</button>
				<label class="flex items-center gap-2"><input type="checkbox" checked={'total' in table.outputs} onchange={() => toggleOutput('total')} /> Total distance</label>
				<label class="flex items-center gap-2"><input type="checkbox" checked={'groundRoll' in table.outputs} onchange={() => toggleOutput('groundRoll')} /> Ground roll</label>
				<label class="flex items-center gap-2">Source <input class="adm" bind:value={table.source} oninput={onchange} /></label>
			</div>
		</div>
	{/if}

	{#if outputs.length > 1}
		<div class="flex flex-wrap gap-1">{#each outputs as name (name)}<button type="button" class:primary={name === active} onclick={() => (output = name)}>{OUTPUT_LABELS[name]}</button>{/each}</div>
	{/if}
	{#each outer as axis, i (i)}
		<label class="flex items-center gap-2 font-semibold">{axis.name}
			<select class="adm" value={prefix[i]} onchange={(e) => (slice[i] = Number(e.currentTarget.value))}>{#each axis.values as v, j (j)}<option value={j}>{v} {axis.unit}</option>{/each}</select>
		</label>
	{/each}

	<div class="overflow-x-auto">
		<table class="w-auto" aria-label={`Table ${id}, ${OUTPUT_LABELS[active]}`}>
			<thead><tr>
				<th>{rowAxis ? `${rowAxis.name} ${rowAxis.unit}` : ''}</th>
				{#each cols as c (c)}<th class="n">{colAxis.values[c]} {colAxis.unit}</th>{/each}
			</tr></thead>
			<tbody>
				{#each rows as r (r)}
					<tr>
						<th>{rowAxis ? rowAxis.values[r] : OUTPUT_LABELS[active]}</th>
						{#each cols as c (c)}
							{@const bad = keyOf(r, c) in invalid}
							{@const differs = showDifferences && blanks === 0 && differences.has(pathOf(r, c).join(','))}
							<td class="p-0.5">
								<input id={cellId(r, c)} class="adm-cell" class:adm-bad={bad || differs} inputmode="decimal" autocomplete="off" value={shown(r, c)} aria-invalid={bad || differs} aria-label={`${rowAxis ? `${rowAxis.name} ${rowAxis.values[r]}, ` : ''}${colAxis.name} ${colAxis.values[c]}`} onchange={(e) => enter(r, c, e.currentTarget.value)} onpaste={(e) => paste(e, r, c)} onkeydown={(e) => keydown(e, r, c)} />
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="muted">{Object.keys(invalid).length ? 'Red cells aren\'t numbers, so they weren\'t saved. ' : ''}{blanks ? `${blanks} cells still empty. ` : ''}You can paste a block from Excel into any cell. Enter moves down.</p>

	{#if secondEntry && compareWith}
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" onclick={() => (showDifferences = true)}>Compare with the first entry</button>
			{#if showDifferences}
				{#if blanks}<span class="font-bold text-amber" role="status">Finish this table first: {blanks} cell{blanks > 1 ? 's' : ''} still empty.</span>
				{:else if differences.size}<span class="font-bold text-bad" role="alert">{differences.size} cell{differences.size > 1 ? 's differ' : ' differs'} in this view. Check {differences.size > 1 ? 'them' : 'it'} against the manual.</span>
				{:else}<span class="font-bold text-good" role="status">This table matches the first entry.</span>{/if}
			{/if}
		</div>
	{/if}
</div>
