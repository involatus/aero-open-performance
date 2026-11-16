<script lang="ts" module>
	/** A dragged value: onto the nearest snap point when within `zone` of it, else to the nearest step. */
	export function snapped(x: number, max: number, step: number, snaps: number[], zone: number): number {
		const nearest = snaps.reduce<number | undefined>((best, s) => (best === undefined || Math.abs(x - s) < Math.abs(x - best) ? s : best), undefined);
		if (nearest !== undefined && Math.abs(x - nearest) <= zone) return nearest;
		// Rounded, so 28 steps of 0.05 read 1.4, not 1.4000000000000001.
		return Math.min(max, Math.max(0, Number((Math.round(x / step) * step).toFixed(6))));
	}
</script>

<script lang="ts">
	/**
	 * A slider beside a typed value, for a quick setting. Near a snap point it pulls onto it; elsewhere it
	 * moves freely by `step`. Labelled marks under it set their value with a tap. The keypad stays for exact values.
	 */
	let { label, value, max, step, snaps, zone, marks, unit, onchange }: {
		label: string; value: number; max: number; step: number;
		snaps: number[];
		/** How close a dragged value must come to a snap point to be pulled onto it. */
		zone: number;
		marks: { value: number; label: string; spoken: string }[];
		unit: string;
		onchange: (value: number) => void;
	} = $props();

	let shown = $derived(Math.min(max, Math.max(0, value)));
	let pct = $derived((shown / max) * 100);
	const at = (v: number) => Math.abs(value - v) < 1e-9;
</script>

<div class="flex flex-col gap-0.5">
	<input
		type="range"
		class="slider"
		min="0"
		{max}
		step="any"
		value={shown}
		aria-label={label}
		aria-valuetext={`${Number(value.toFixed(2))} ${unit}`}
		style:--fill={`${pct}%`}
		oninput={(e) => onchange(snapped(Number(e.currentTarget.value), max, step, snaps, zone))}
	/>
	<div class="relative mx-[15px] h-10">
		{#each marks as m (m.value)}
			<button
				type="button"
				tabindex="-1"
				aria-label={m.spoken}
				aria-pressed={at(m.value)}
				onclick={() => onchange(m.value)}
				style:left={`${(m.value / max) * 100}%`}
				class={['absolute top-0 min-h-10 min-w-11 -translate-x-1/2 rounded-lg border px-1.5 text-sm font-semibold', at(m.value) ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-surface text-ink']}
			>{m.label}</button>
		{/each}
	</div>
</div>

<style>
	/* Only sideways drags move it, so a vertical swipe still scrolls the page. */
	.slider { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 44px; min-height: 0; margin: 0; padding: 0; border: 0; background: transparent; touch-action: pan-y; cursor: pointer; }
	.slider::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill)); }
	.slider::-moz-range-track { height: 10px; border-radius: 5px; background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill)); }
	.slider::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); box-shadow: 0 1px 4px rgb(var(--shadow) / 0.3); }
	.slider::-moz-range-thumb { width: 26px; height: 26px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); box-shadow: 0 1px 4px rgb(var(--shadow) / 0.3); }
</style>
