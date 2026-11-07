<script lang="ts">
	import { entryUnits, parseNumber, shown, stored, unitLabel, type Kind, type Units } from '#lib/admin/editing.ts';

	// A number typed in the manual's units and stored in the units pilots see.
	let { label, value, onchange, aircraft, kind, unit, hint, optional = false, round }: {
		label: string; value: number | undefined; onchange: (v: number | undefined) => void;
		aircraft?: { units: Units; manualUnits?: Units }; kind?: Kind; unit?: string; hint?: string; optional?: boolean; round?: number;
	} = $props();

	const uid = $props.id();
	let draft = $state<string | null>(null);
	let error = $state<string | null>(null);
	let display = $derived.by(() => {
		if (draft !== null) return draft;
		if (value === undefined || value === null) return '';
		const v = aircraft && kind ? shown(aircraft, kind, value) : value;
		return String(round === undefined ? v : Number(v.toFixed(round)));
	});
	let suffix = $derived(unit ?? (aircraft && kind ? unitLabel(entryUnits(aircraft), kind) : ''));
	// When the manual's units differ, show what pilots will get, so the conversion can be checked at a glance.
	let converted = $derived.by(() => {
		if (!aircraft?.manualUnits || !kind || value === undefined || value === null) return '';
		const pilot = unitLabel(aircraft.units, kind);
		if (pilot === unitLabel(aircraft.manualUnits, kind)) return '';
		return `Pilots see ${Number(value.toPrecision(6))} ${unit ? unit.replace(unitLabel(aircraft.manualUnits, kind), pilot) : pilot}`;
	});

	function input(text: string) {
		draft = text;
		const p = parseNumber(text);
		error = p.error;
		if (p.error) return;
		if (p.value === null) { if (optional) onchange(undefined); return; }
		onchange(aircraft && kind ? stored(aircraft, kind, p.value) : p.value);
	}
	function blur() {
		if (!error && !(draft !== null && draft.trim() === '' && !optional)) draft = null;
	}
</script>

<div class="adm-field">
	<label for={uid}>{label}{#if optional}&nbsp;<span class="adm-hint" style="display: inline">(optional)</span>{:else}<span aria-hidden="true"> *</span>{/if}</label>
	<span class="adm-unit"><input id={uid} class="adm" inputmode="decimal" value={display} oninput={(e) => input(e.currentTarget.value)} onblur={blur} aria-invalid={!!error} aria-describedby={`${uid}-help`} />{#if suffix}<span aria-label={`in ${suffix}`}>{suffix}</span>{/if}</span>
	<span id={`${uid}-help`} class="grid gap-1">
		{#if error}<span class="adm-error">{error}</span>{:else}
			{#if converted}<span class="adm-hint">{converted}</span>{/if}
			{#if hint}<span class="adm-hint">{hint}</span>{/if}
		{/if}
	</span>
</div>
