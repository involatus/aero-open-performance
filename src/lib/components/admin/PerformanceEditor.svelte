<script lang="ts">
	import { defaultSource, makeId, move, sourceFor } from '#lib/admin/editing.ts';
	import Num from './Num.svelte';
	import SourcePick from './SourcePick.svelte';

	let { a, touch }: { a: any; touch: () => void } = $props();

	let phase = $state<'takeoff' | 'landing'>('takeoff');
	let list = $derived(a.performance[phase] as any[]);
	let tables = $derived(Object.keys(a.tables ?? {}));

	const STEP_TYPES: [string, string, string][] = [
		['lookup', 'Look up a table', 'Reads the distance from one of the tables, by altitude and temperature for example.'],
		['wind', 'Wind correction', 'Headwind and tailwind rules, such as 1% less per knot of headwind.'],
		['surface', 'Surface correction', 'Adds a percentage of the ground roll, for grass for example.'],
		['factor', 'Multiply by a factor', 'A fixed factor, such as 1.10 for an engine or a safety margin.'],
		['massCorrection', 'Mass correction', 'Scales the distance by the actual mass compared with the table\'s mass.'],
		['ratio', 'Derive one distance from the other', 'Such as ground roll as a share of the total distance.'],
		['fixed', 'Fixed distance', 'A distance that doesn\'t depend on the conditions.']
	];
	const OUTPUTS: [string, string][] = [['total', 'Total distance'], ['groundRoll', 'Ground roll']];
	const BEYOND: [string, string][] = [['none', 'No result'], ['nearest', 'Use the maximum'], ['nearestWarn', 'Use the maximum, with a warning']];
	// Published factors for when the manual gives none. Each is added as an ordinary factor step with its source,
	// so it is aircraft data the admin chose, never a value built into the code.
	const CAA = { document: 'UK CAA Safety Sense Leaflet 12: Strip Flying', date: 'May 2024' }, CAA_PAGE = '15';
	const EASA = { document: 'EASA Sunny Swift 42: Take-off and landing performance', date: 'January 2026' }, EASA_PAGE = '1';
	const PRESETS: { id: string; label: string; takeoff: number | null; landing: number | null; doc: typeof CAA; page: string }[] = [
		{ id: 'dry-grass', label: 'Dry grass up to 20 cm, firm soil (UK CAA)', takeoff: 1.2, landing: 1.15, doc: CAA, page: CAA_PAGE },
		{ id: 'wet-grass', label: 'Wet grass up to 20 cm, firm soil (UK CAA)', takeoff: 1.3, landing: 1.35, doc: CAA, page: CAA_PAGE },
		{ id: 'wet-grass-easa', label: 'Wet grass landing (EASA)', takeoff: null, landing: 1.6, doc: EASA, page: EASA_PAGE },
		{ id: 'wet-paved', label: 'Wet paved runway (UK CAA)', takeoff: null, landing: 1.15, doc: CAA, page: CAA_PAGE },
		{ id: 'soft-ground', label: 'Soft ground or snow, 25% or more (UK CAA)', takeoff: 1.25, landing: 1.25, doc: CAA, page: CAA_PAGE },
		{ id: 'safety', label: 'Safety factor for unfactored manual data (UK CAA)', takeoff: 1.33, landing: 1.43, doc: CAA, page: CAA_PAGE }
	];
	let presets = $derived(PRESETS.filter((p) => p[phase] !== null));
	function addPreset(c: any, id: string) {
		const p = PRESETS.find((x) => x.id === id)!, value = p[phase]!;
		c.steps.push({ type: 'factor', value, applies: ['total', 'groundRoll'], reason: `${p.label}: ${value.toFixed(2)}`, source: sourceFor(a.sources, p.doc, p.page) });
		touch();
	}
	const typeName = (t: string) => STEP_TYPES.find((s) => s[0] === t)?.[1] ?? t;

	function newStep(type: string): any {
		const source = defaultSource(a), applies = ['total', 'groundRoll'];
		const rule = (percent: number, perKnots: number) => ({ mode: 'proportional', percent, perKnots, above: 'none' });
		switch (type) {
			case 'lookup': return { type, table: tables[0] ?? '' };
			case 'wind': return { type, headwind: rule(1, 1), tailwind: rule(10, 2), applies, source };
			case 'surface': return { type, percent: 15, carryToTotal: true, source };
			case 'factor': return { type, value: 1.1, applies, reason: '', source };
			case 'massCorrection': return { type, referenceMass: a.massLimits.maxTakeoff.value || 1, exponent: 2, applies, source };
			case 'ratio': return { type, from: 'total', into: 'groundRoll', value: 0.5, source };
			default: return { type: 'fixed', total: 0, source };
		}
	}
	function addCondition(copyOf?: any) {
		const label = copyOf ? `${copyOf.label} (copy)` : list.length ? `Condition ${list.length + 1}` : 'Paved runway';
		const id = makeId(label, list.map((c) => c.id));
		list.push(copyOf ? { ...structuredClone($state.snapshot(copyOf)), id, label } : { kind: 'steps', id, label, distanceUnit: 'm', steps: [newStep('lookup')] });
		touch();
	}
	function setKind(c: any, noData: boolean) {
		if (noData) { for (const k of Object.keys(c)) if (!['id', 'label'].includes(k)) delete c[k]; c.kind = 'noData'; }
		else Object.assign(c, { kind: 'steps', distanceUnit: 'm', steps: [newStep('lookup')] });
		touch();
	}
	function toggleApplies(s: any, out: string, on: boolean) {
		const next = OUTPUTS.map(([k]) => k).filter((k) => (k === out ? on : s.applies.includes(k)));
		if (next.length) s.applies = next;
		touch();
	}
	function setRule(s: any, side: 'headwind' | 'tailwind', on: boolean) {
		if (on) s[side] = side === 'headwind' ? { mode: 'proportional', percent: 1, perKnots: 1, above: 'none' } : { mode: 'proportional', percent: 10, perKnots: 2, above: 'none' };
		else delete s[side];
		touch();
	}
</script>

<div class="flex flex-wrap gap-1" role="group" aria-label="Takeoff or landing">
	<button type="button" class:primary={phase === 'takeoff'} aria-pressed={phase === 'takeoff'} onclick={() => (phase = 'takeoff')}>Takeoff ({a.performance.takeoff.length})</button>
	<button type="button" class:primary={phase === 'landing'} aria-pressed={phase === 'landing'} onclick={() => (phase = 'landing')}>Landing ({a.performance.landing.length})</button>
</div>
<p class="adm-hint">Each condition is one choice pilots make, such as "Paved" or "Dry grass". Its steps run from top to bottom, in the order the manual applies them. If the manual has no figure for a surface, copy a condition and add a published factor from "Add a step".{tables.length ? '' : ' Add the tables first, under Tables.'}</p>

{#each list as c, i (c.id)}
	<div class="adm-card">
		<div class="adm-card-head">
			<h3>{c.label || 'Unnamed condition'}</h3>
			<div class="adm-tools">
				<button type="button" disabled={i === 0} onclick={() => { move(list, i, -1); touch(); }}>Up</button>
				<button type="button" disabled={i === list.length - 1} onclick={() => { move(list, i, 1); touch(); }}>Down</button>
				<button type="button" onclick={() => addCondition(c)}>Copy</button>
				<button type="button" onclick={() => { list.splice(i, 1); touch(); }} aria-label={`Delete ${c.label}`}>Delete</button>
			</div>
		</div>
		<div class="adm-row">
			<label class="adm-field">Name *<input class="adm" placeholder="e.g. Dry grass" value={c.label} oninput={(e) => { c.label = e.currentTarget.value; touch(); }} /></label>
			{#if c.kind === 'steps'}<label class="adm-field">Distances in<select class="adm" value={c.distanceUnit} onchange={(e) => { c.distanceUnit = e.currentTarget.value; touch(); }}><option value="m">metres</option><option value="ft">feet</option></select></label>{/if}
		</div>
		<label class="adm-check"><input type="checkbox" checked={c.kind === 'noData'} onchange={(e) => setKind(c, e.currentTarget.checked)} /> The manual has no data for this: pilots decide themselves</label>
		{#if c.kind === 'steps'}
			{#each c.steps as s, j (j)}
				<div class="adm-card sub">
					<div class="adm-card-head">
						<strong>{j + 1}. {typeName(s.type)}</strong>
						<div class="adm-tools">
							<button type="button" disabled={j === 0} onclick={() => { move(c.steps, j, -1); touch(); }}>Up</button>
							<button type="button" disabled={j === c.steps.length - 1} onclick={() => { move(c.steps, j, 1); touch(); }}>Down</button>
							<button type="button" disabled={c.steps.length < 2} onclick={() => { c.steps.splice(j, 1); touch(); }}>Delete</button>
						</div>
					</div>
					{#if s.type === 'lookup'}
						<label class="adm-field">Table<select class="adm" value={s.table} onchange={(e) => { s.table = e.currentTarget.value; touch(); }}>{#if !tables.includes(s.table)}<option value={s.table}>Choose a table</option>{/if}{#each tables as t (t)}<option value={t}>{t}</option>{/each}</select></label>
					{:else if s.type === 'wind'}
						{#each [['headwind', 'Headwind', 'less'], ['tailwind', 'Tailwind', 'more']] as const as [side, title, word] (side)}
							<label class="adm-check"><input type="checkbox" checked={!!s[side]} onchange={(e) => setRule(s, side, e.currentTarget.checked)} /> {title} correction</label>
							{#if s[side]}
								<div class="adm-row">
									<Num label={`Percent ${word}`} unit="%" value={s[side].percent} onchange={(v) => { s[side].percent = v ?? 0; touch(); }} />
									<Num label="For every" unit="kt" value={s[side].perKnots} onchange={(v) => { s[side].perKnots = v ?? 0; touch(); }} />
									<label class="adm-field">Part steps, such as 3 kt for every 2 kt<select class="adm" value={s[side].mode} onchange={(e) => { s[side].mode = e.currentTarget.value; touch(); }}><option value="proportional">Pro rata</option><option value="stepped">Whole steps only</option></select></label>
									<Num label="Up to" optional unit="kt" value={s[side].maxKnots} onchange={(v) => { if (v === undefined) delete s[side].maxKnots; else s[side].maxKnots = v; touch(); }} />
									{#if s[side].maxKnots !== undefined}<label class="adm-field">Above that<select class="adm" value={s[side].above} onchange={(e) => { s[side].above = e.currentTarget.value; touch(); }}>{#each BEYOND as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>{/if}
								</div>
							{/if}
						{/each}
					{:else if s.type === 'surface'}
						<div class="adm-row">
							<Num label="Add to the ground roll" unit="%" value={s.percent} onchange={(v) => { s.percent = v ?? 0; touch(); }} />
							<label class="adm-check"><input type="checkbox" checked={s.carryToTotal} onchange={(e) => { s.carryToTotal = e.currentTarget.checked; touch(); }} /> Add the same distance to the total</label>
						</div>
					{:else if s.type === 'factor'}
						<div class="adm-row">
							<Num label="Factor" value={s.value} hint="1.10 means 10% more." onchange={(v) => { s.value = v ?? 0; touch(); }} />
							<label class="adm-field">Reason, shown to pilots *<input class="adm" value={s.reason} oninput={(e) => { s.reason = e.currentTarget.value; touch(); }} /></label>
						</div>
					{:else if s.type === 'massCorrection'}
						<div class="adm-row">
							<Num label="Table mass" aircraft={a} kind="mass" value={s.referenceMass} onchange={(v) => { s.referenceMass = v ?? 0; touch(); }} />
							<Num label="Exponent" value={s.exponent} onchange={(v) => { s.exponent = v ?? 0; touch(); }} hint="Distance × (mass ÷ table mass) to this power." />
						</div>
					{:else if s.type === 'ratio'}
						<div class="adm-row">
							<label class="adm-field">From<select class="adm" value={s.from} onchange={(e) => { s.from = e.currentTarget.value; touch(); }}>{#each OUTPUTS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
							<label class="adm-field">Sets<select class="adm" value={s.into} onchange={(e) => { s.into = e.currentTarget.value; touch(); }}>{#each OUTPUTS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></label>
							<Num label="Multiplied by" value={s.value} onchange={(v) => { s.value = v ?? 0; touch(); }} />
						</div>
					{:else if s.type === 'fixed'}
						<div class="adm-row">
							<Num label="Total distance" optional unit={c.distanceUnit} value={s.total} onchange={(v) => { if (v === undefined) delete s.total; else s.total = v; touch(); }} />
							<Num label="Ground roll" optional unit={c.distanceUnit} value={s.groundRoll} onchange={(v) => { if (v === undefined) delete s.groundRoll; else s.groundRoll = v; touch(); }} />
						</div>
					{/if}
					{#if s.applies}
						<div class="flex flex-wrap gap-x-4"><span class="adm-field">Applies to</span>{#each OUTPUTS as [k, l] (k)}<label class="adm-check"><input type="checkbox" checked={s.applies.includes(k)} onchange={(e) => toggleApplies(s, k, e.currentTarget.checked)} /> {l}</label>{/each}</div>
					{/if}
					{#if s.type !== 'lookup'}<SourcePick aircraft={a} value={s.source} onchange={(id) => { s.source = id; touch(); }} />{/if}
				</div>
			{/each}
			<label class="adm-field">Add a step
				<select class="adm" value="" onchange={(e) => { const v = e.currentTarget.value; if (v.startsWith('preset:')) addPreset(c, v.slice(7)); else if (v) { c.steps.push(newStep(v)); touch(); } e.currentTarget.value = ''; }}>
					<option value="">Choose what the manual does next</option>
					<optgroup label="From the manual">{#each STEP_TYPES as [v, l, d] (v)}<option value={v}>{l}: {d}</option>{/each}</optgroup>
					<optgroup label={`Only if the manual gives no figure: published ${phase} factors`}>{#each presets as p (p.id)}<option value={`preset:${p.id}`}>{p.label}: × {p[phase]!.toFixed(2)}</option>{/each}</optgroup>
				</select>
			</label>
			<label class="adm-field">Only if the manual gives one distance for a fixed situation: which situation<span class="adm-hint">Pilots are then warned that the distance isn't corrected for their conditions. Leave empty when a table covers them.</span><input class="adm" placeholder="e.g. sea level, 15 °C" value={c.assumes?.text ?? ''} oninput={(e) => { const t = e.currentTarget.value; if (t.trim()) c.assumes = { text: t, inputs: c.assumes?.inputs ?? [] }; else delete c.assumes; touch(); }} /></label>
		{/if}
	</div>
{/each}
<div><button type="button" onclick={() => addCondition()}>Add {phase} condition</button></div>
