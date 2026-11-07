<script lang="ts">
	import { entryUnits, shown } from '#lib/admin/editing.ts';

	// The CG Envelope as the admin types it, in the manual's units, redrawn on every change.
	let { a, envelope }: { a: any; envelope: { points: any[] } } = $props();

	const W = 640, H = 360, L = 56, R = 16, T = 14, B = 40;
	let u = $derived(entryUnits(a));
	let toArm = $derived((p: any): number | null => {
		if (typeof p.arm === 'number') return shown(a, 'arm', p.arm);
		if (typeof p.percentMac === 'number' && a.mac) return shown(a, 'arm', a.mac.leadingEdgeArm + (p.percentMac / 100) * a.mac.length);
		return null;
	});
	let pts = $derived(envelope.points.map((p) => ({ arm: toArm(p), mass: typeof p.mass === 'number' ? shown(a, 'mass', p.mass) : null })).filter((p): p is { arm: number; mass: number } => p.arm !== null && p.mass !== null && p.mass > 0));
	let empties = $derived((a.configurations ?? []).filter((c: any) => c.weighing?.mass > 0).map((c: any) => ({ label: c.label, mass: shown(a, 'mass', c.weighing.mass), arm: shown(a, 'arm', c.weighing.moment / c.weighing.mass) })));
	let maxLanding = $derived(a.massLimits?.maxLanding?.value > 0 ? shown(a, 'mass', a.massLimits.maxLanding.value) : null);
	let maxTakeoff = $derived(a.massLimits?.maxTakeoff?.value > 0 ? shown(a, 'mass', a.massLimits.maxTakeoff.value) : null);

	function nice(lo: number, hi: number, n: number) {
		const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
		const out: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
		return out;
	}
	let domain = $derived.by(() => {
		const arms = [...pts, ...empties].map((p) => p.arm), masses = [...pts, ...empties].map((p) => p.mass).concat(maxTakeoff ?? []);
		if (!arms.length) return null;
		const [a0, a1] = [Math.min(...arms), Math.max(...arms)], [m0, m1] = [Math.min(...masses), Math.max(...masses)];
		const pa = (a1 - a0 || 1) * 0.12, pm = (m1 - m0 || 1) * 0.1;
		return { arm: [a0 - pa, a1 + pa], mass: [m0 - pm, m1 + pm] };
	});
	let x = $derived((v: number) => (domain ? L + ((v - domain.arm[0]) / (domain.arm[1] - domain.arm[0])) * (W - L - R) : 0));
	let y = $derived((v: number) => (domain ? H - B - ((v - domain.mass[0]) / (domain.mass[1] - domain.mass[0])) * (H - T - B) : 0));

	/** Edges that cross each other mean the points are not in order around the shape. */
	let crossing = $derived.by(() => {
		const n = pts.length;
		const cross = (p: any, q: any, r: any) => (q.arm - p.arm) * (r.mass - p.mass) - (q.mass - p.mass) * (r.arm - p.arm);
		for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			const [p1, p2, q1, q2] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
			if (cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0) return true;
		}
		return false;
	});
</script>

<div class="adm-preview">
	{#if !domain || pts.length < 3}
		<p class="adm-hint">The envelope appears here once it has three points.</p>
	{:else}
		<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`CG envelope preview with ${pts.length} points`}>
			{#each nice(domain.mass[0], domain.mass[1], 6) as m (m)}
				<line x1={L} x2={W - R} y1={y(m)} y2={y(m)} stroke="var(--line)" />
				<text x={L - 6} y={y(m) + 4} text-anchor="end">{m}</text>
			{/each}
			{#each nice(domain.arm[0], domain.arm[1], 8) as v (v)}
				<line x1={x(v)} x2={x(v)} y1={T} y2={H - B} stroke="var(--line)" stroke-dasharray="2 4" />
				<text x={x(v)} y={H - B + 16} text-anchor="middle">{v}</text>
			{/each}
			<polygon points={pts.map((p) => `${x(p.arm)},${y(p.mass)}`).join(' ')} fill="var(--good-bg)" stroke={crossing ? 'var(--bad)' : 'var(--good)'} stroke-width="2" />
			{#each pts as p, i (i)}
				<circle cx={x(p.arm)} cy={y(p.mass)} r="4" fill="var(--good)" />
				<text x={x(p.arm) + 6} y={y(p.mass) - 6} style="fill: var(--ink); font-weight: 700">{i + 1}</text>
			{/each}
			{#if maxLanding !== null && maxLanding !== maxTakeoff}
				<line x1={L} x2={W - R} y1={y(maxLanding)} y2={y(maxLanding)} stroke="var(--amber)" stroke-dasharray="6 4" />
				<text x={W - R - 2} y={y(maxLanding) - 4} text-anchor="end">Max landing {maxLanding}</text>
			{/if}
			{#each empties as e (e.label)}
				<rect x={x(e.arm) - 5} y={y(e.mass) - 5} width="10" height="10" fill="var(--accent)" />
				<text x={x(e.arm) + 8} y={y(e.mass) + 4} style="fill: var(--ink)">Empty, {e.label}</text>
			{/each}
			<text x={(L + W - R) / 2} y={H - 6} text-anchor="middle">CG arm, {u.arm}. Mass, {u.mass}.</text>
		</svg>
		{#if crossing}<p class="adm-error">Some edges cross. List the points in order around the shape.</p>{/if}
	{/if}
</div>
