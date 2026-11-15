<script lang="ts">
	import { SUGGESTED_RULES, type OperatorRules } from '#lib/aircraft/operator-rules.ts';

	/** The operator's own corrections, used only where an aircraft's manual gives none. */
	let { rules, onchange }: { rules: OperatorRules | undefined; onchange: (r: OperatorRules | undefined) => void } = $props();

	const wind = $derived(rules?.wind), above = $derived(rules?.aboveTable);
	const set = (next: OperatorRules) => onchange(next.wind || next.aboveTable ? next : undefined);
	const num = (e: Event) => { const v = Number((e.currentTarget as HTMLInputElement).value); return Number.isFinite(v) && v > 0 ? v : undefined; };
	const S = SUGGESTED_RULES;
	const box = 'flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold';
	const field = 'num h-8 w-14 rounded-md border border-line-strong bg-surface px-1.5 text-right text-sm disabled:opacity-50';
	const row = 'flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-7 text-sm text-ink-2';
</script>

<fieldset class="flex flex-col gap-2 border-0 p-0">
	<legend class="label-caps mb-1">Operator rules</legend>
	<p class="text-[13px] text-muted">Only where an aircraft's manual has none. Shown as "Operator rule"; pilots get changes with the next release.</p>

	<div class="flex flex-col gap-1 rounded-lg border border-line px-3 py-2">
		<label class={box}><input type="checkbox" class="size-5" checked={!!wind} onchange={(e) => set({ ...rules, wind: e.currentTarget.checked ? S.wind : undefined })} /> Wind</label>
		{#if wind}
			<div class={row}>
				<span class="w-[5.75rem]">Tailwind</span>+
				<input class={field} type="number" min="0" step="any" aria-label="Tailwind percent" value={wind.tailwind?.percent ?? ''} onchange={(e) => { const p = num(e); set({ ...rules, wind: { ...wind, tailwind: p ? { percent: p, perKnots: wind.tailwind?.perKnots ?? 2, ...(wind.tailwind?.maxKnots ? { maxKnots: wind.tailwind.maxKnots } : {}) } : undefined } }); }} />
				% per
				<input class={field} type="number" min="0" step="any" aria-label="Tailwind knots" disabled={!wind.tailwind} value={wind.tailwind?.perKnots ?? ''} onchange={(e) => { const k = num(e); if (k && wind.tailwind) set({ ...rules, wind: { ...wind, tailwind: { ...wind.tailwind, perKnots: k } } }); }} />
				kt, max
				<input class={field} type="number" min="0" step="any" aria-label="Most tailwind" disabled={!wind.tailwind} value={wind.tailwind?.maxKnots ?? ''} onchange={(e) => { const k = num(e); if (wind.tailwind) { const { maxKnots: _, ...t } = wind.tailwind; set({ ...rules, wind: { ...wind, tailwind: k ? { ...t, maxKnots: k } : t } }); } }} />
				kt
			</div>
			<div class={row}>
				<label class="flex w-[5.75rem] cursor-pointer items-center gap-1.5"><input type="checkbox" class="size-4" checked={!!wind.headwind} onchange={(e) => set({ ...rules, wind: { ...wind, headwind: e.currentTarget.checked ? S.wind!.headwind : undefined } })} /> Headwind</label>
				{#if wind.headwind}
					−
					<input class={field} type="number" min="0" step="any" aria-label="Headwind percent" value={wind.headwind.percent} onchange={(e) => { const p = num(e); if (p) set({ ...rules, wind: { ...wind, headwind: { ...wind.headwind!, percent: p } } }); }} />
					% per
					<input class={field} type="number" min="0" step="any" aria-label="Headwind knots" value={wind.headwind.perKnots} onchange={(e) => { const k = num(e); if (k) set({ ...rules, wind: { ...wind, headwind: { ...wind.headwind!, perKnots: k } } }); }} />
					kt
				{:else}<span class="text-muted">no credit</span>{/if}
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-1 rounded-lg border border-line px-3 py-2">
		<label class={box}><input type="checkbox" class="size-5" checked={!!above} onchange={(e) => set({ ...rules, aboveTable: e.currentTarget.checked ? S.aboveTable : undefined })} /> Above a table's top altitude</label>
		{#if above}
			<div class={row}>
				<span class="w-[5.75rem]">Per 1000 ft</span>takeoff +
				<input class={field} type="number" min="0" step="any" aria-label="Takeoff percent per 1000 ft" value={above.takeoffPercentPer1000ft} onchange={(e) => { const p = num(e); if (p) set({ ...rules, aboveTable: { ...above, takeoffPercentPer1000ft: p } }); }} />
				%, landing +
				<input class={field} type="number" min="0" step="any" aria-label="Landing percent per 1000 ft" value={above.landingPercentPer1000ft} onchange={(e) => { const p = num(e); if (p) set({ ...rules, aboveTable: { ...above, landingPercentPer1000ft: p } }); }} />
				%
			</div>
			<div class={row}>
				<span class="w-[5.75rem]">Alert past</span>
				<input class={field} type="number" min="0" step="any" aria-label="Alert above, metres" value={above.alertAboveM} onchange={(e) => { const m = num(e); if (m) set({ ...rules, aboveTable: { ...above, alertAboveM: m } }); }} />
				m above the table
			</div>
			<p class="pl-7 text-[12px] text-muted">The larger of the table's own trend with air density and these figures (UK CAA SSL 09). No limit.</p>
		{/if}
	</div>
</fieldset>
