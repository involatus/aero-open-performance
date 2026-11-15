<script lang="ts">
	import { SUGGESTED_RULES, type OperatorRules } from '#lib/aircraft/operator-rules.ts';

	/** The operator's own corrections, used only where an aircraft's manual gives none. */
	let { rules, onchange }: { rules: OperatorRules | undefined; onchange: (r: OperatorRules | undefined) => void } = $props();

	const wind = $derived(rules?.wind), above = $derived(rules?.aboveTable);
	const set = (next: OperatorRules) => onchange(next.wind || next.aboveTable ? next : undefined);
	const num = (e: Event) => { const v = Number((e.currentTarget as HTMLInputElement).value); return Number.isFinite(v) && v > 0 ? v : undefined; };
	const S = SUGGESTED_RULES;
	const box = 'flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold';
	const field = 'adm w-20 text-right';
	const row = 'flex flex-wrap items-center gap-2 text-sm';
</script>

<fieldset class="flex flex-col gap-3 border-0 p-0">
	<legend class="label-caps mb-1">Operator rules</legend>
	<p class="text-[13px] text-muted">Used only where an aircraft's manual gives none, marked "Operator rule" in the calculation steps and the Report. Pilots get changes with the next release.</p>

	<div class="flex flex-col gap-2 rounded-lg border border-line p-3">
		<label class={box}><input type="checkbox" class="size-5" checked={!!wind} onchange={(e) => set({ ...rules, wind: e.currentTarget.checked ? S.wind : undefined })} /> Wind, when the manual has no wind correction</label>
		{#if wind}
			<div class={row}>
				<span>Tailwind: add</span>
				<input class={field} type="number" min="0" step="any" aria-label="Tailwind percent" value={wind.tailwind?.percent ?? ''} onchange={(e) => { const p = num(e); set({ ...rules, wind: { ...wind, tailwind: p ? { percent: p, perKnots: wind.tailwind?.perKnots ?? 2, ...(wind.tailwind?.maxKnots ? { maxKnots: wind.tailwind.maxKnots } : {}) } : undefined } }); }} />
				<span>% per</span>
				<input class={field} type="number" min="0" step="any" aria-label="Tailwind knots" disabled={!wind.tailwind} value={wind.tailwind?.perKnots ?? ''} onchange={(e) => { const k = num(e); if (k && wind.tailwind) set({ ...rules, wind: { ...wind, tailwind: { ...wind.tailwind, perKnots: k } } }); }} />
				<span>kt, up to</span>
				<input class={field} type="number" min="0" step="any" aria-label="Most tailwind" disabled={!wind.tailwind} value={wind.tailwind?.maxKnots ?? ''} onchange={(e) => { const k = num(e); if (wind.tailwind) { const { maxKnots: _, ...t } = wind.tailwind; set({ ...rules, wind: { ...wind, tailwind: k ? { ...t, maxKnots: k } : t } }); } }} />
				<span>kt, then no result</span>
			</div>
			<label class={box}><input type="checkbox" class="size-5" checked={!!wind.headwind} onchange={(e) => set({ ...rules, wind: { ...wind, headwind: e.currentTarget.checked ? S.wind!.headwind : undefined } })} /> Headwind credit</label>
			{#if wind.headwind}
				<div class={row}>
					<span>Headwind: subtract</span>
					<input class={field} type="number" min="0" step="any" aria-label="Headwind percent" value={wind.headwind.percent} onchange={(e) => { const p = num(e); if (p) set({ ...rules, wind: { ...wind, headwind: { ...wind.headwind!, percent: p } } }); }} />
					<span>% per</span>
					<input class={field} type="number" min="0" step="any" aria-label="Headwind knots" value={wind.headwind.perKnots} onchange={(e) => { const k = num(e); if (k) set({ ...rules, wind: { ...wind, headwind: { ...wind.headwind!, perKnots: k } } }); }} />
					<span>kt</span>
				</div>
			{:else}
				<p class="text-[13px] text-muted">No headwind credit: a headwind is shown but doesn't shorten the distance.</p>
			{/if}
		{/if}
	</div>

	<div class="flex flex-col gap-2 rounded-lg border border-line p-3">
		<label class={box}><input type="checkbox" class="size-5" checked={!!above} onchange={(e) => set({ ...rules, aboveTable: e.currentTarget.checked ? S.aboveTable : undefined })} /> Above a table's highest altitude</label>
		{#if above}
			<p class="text-[13px] text-muted">The top row grows by the larger of the table's own trend with air density and these figures (UK CAA Safety Sense Leaflet 09: 10% takeoff, 5% landing per 1000 ft).</p>
			<div class={row}>
				<span>Takeoff: add</span>
				<input class={field} type="number" min="0" step="any" aria-label="Takeoff percent per 1000 ft" value={above.takeoffPercentPer1000ft} onchange={(e) => { const p = num(e); if (p) set({ ...rules, aboveTable: { ...above, takeoffPercentPer1000ft: p } }); }} />
				<span>% per 1000 ft. Landing: add</span>
				<input class={field} type="number" min="0" step="any" aria-label="Landing percent per 1000 ft" value={above.landingPercentPer1000ft} onchange={(e) => { const p = num(e); if (p) set({ ...rules, aboveTable: { ...above, landingPercentPer1000ft: p } }); }} />
				<span>% per 1000 ft</span>
			</div>
			<div class={row}>
				<span>Alert pilots more than</span>
				<input class={field} type="number" min="0" step="any" aria-label="Alert above, metres" value={above.alertAboveM} onchange={(e) => { const m = num(e); if (m) set({ ...rules, aboveTable: { ...above, alertAboveM: m } }); }} />
				<span>m above the table. There is no limit.</span>
			</div>
		{/if}
	</div>
</fieldset>
