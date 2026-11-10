<script lang="ts">
	import { onMount, tick, untrack, type Component } from 'svelte';
	import { Collapsible, Dialog } from 'bits-ui';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Card from '#lib/components/ui/Card.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AircraftEditor from '#lib/components/admin/AircraftEditor.svelte';
	import SourcesEditor from '#lib/components/admin/SourcesEditor.svelte';
	import ConfigurationsEditor from '#lib/components/admin/ConfigurationsEditor.svelte';
	import LoadEditor from '#lib/components/admin/LoadEditor.svelte';
	import FuelEditor from '#lib/components/admin/FuelEditor.svelte';
	import LimitsEditor from '#lib/components/admin/LimitsEditor.svelte';
	import PerformanceEditor from '#lib/components/admin/PerformanceEditor.svelte';
	import NotesEditor from '#lib/components/admin/NotesEditor.svelte';
	import TableEditor from '#lib/components/admin/TableEditor.svelte';
	import CaseInputs from '#lib/components/admin/CaseInputs.svelte';
	import CaseEditor from '#lib/components/admin/CaseEditor.svelte';
	import { blankInput, caseCoverage, caseSummaries, newHandCase } from '#lib/admin/hand-cases.ts';
	import { defaultSource, draftId, makeId } from '#lib/admin/editing.ts';
	import type { AdminStatus, Overview } from '#lib/server/admin-requests.ts';
	import { NEW_AIRCRAFT, copyForNewAircraft, emptyCells } from '#lib/admin/table-grid.ts';
	import TableVerify from '#lib/components/admin/TableVerify.svelte';
	import { tableCheckState } from '#lib/data/table-check.ts';
	import { checkList, type Check } from '#lib/data/publish-checks.ts';
	import { sha256 } from '#lib/data/canonical.ts';
	import { validateAircraft } from '#lib/aircraft/validate.ts';
	import type { Aircraft, CalculationInput, HandCase , Axis } from '#lib/aircraft/schema.ts';
	import { calculate, runHandCases } from '#lib/engine/index.ts';

	type Status = AdminStatus;

	let status = $state<Status | null>(null);
	let overview = $state<Overview | null>(null);
	let message = $state('');
	let problems = $state<string[]>([]);
	let working = $state(false);

	// A draft has the shape of an aircraft file, even while values are still missing or invalid.
	let editing = $state<{ id: string; aircraft: Aircraft; version: string | null } | null>(null);
	let dirty = $state(false);
	let tab = $state('Aircraft');
	let newName = $state('');
	let copyFrom = $state('');
	let operator = $state('');
	let notes = $state('');
	let withdrawReg = $state('');
	let chosen = $state<string[]>([]);
	let withdrawReason = $state('');
	let confirmDelete = $state<string | null>(null);
	let tableName = $state('');
	let currentTable = $state('');
	let secondTable = $state('');
	let testInput = $state<CalculationInput | null>(null);
	let jsonText = $state('');
	let jsonError = $state('');

	// In the order a manual is usually entered, grouped as in the sidebar.
	type Section = { id: string; label: string; description: string };
	const GROUPS: { label: string; sections: Section[] }[] = [
		{ label: 'Aircraft data', sections: [
			{ id: 'Aircraft', label: 'Aircraft and units', description: 'What pilots see in the aircraft list, and the units every other section uses.' },
			{ id: 'Documents', label: 'Documents', description: 'The manuals and reports every value comes from, so each value can name its page.' },
			{ id: 'Weighing', label: 'Weighing', description: 'The empty mass and moment from the weighing report, for each configuration.' },
			{ id: 'Load', label: 'Loading stations', description: 'Seats and baggage areas, and limits on several stations together.' },
			{ id: 'Fuel', label: 'Fuel', description: 'Tanks, their arms and capacities, and how fuel is burned between takeoff and landing.' },
			{ id: 'Limits', label: 'Limits', description: 'Mass limits and the CG envelope. Type them as printed in the manual.' },
			{ id: 'Notes', label: 'Manual notes', description: 'Notes from the manual that pilots must confirm before a report.' }
		] },
		{ label: 'Performance', sections: [
			{ id: 'Tables', label: 'Tables', description: 'Enter values exactly as printed in the manual. Corrections for wind and surface go in Steps per condition.' },
			{ id: 'Performance', label: 'Steps per condition', description: 'For each takeoff and landing condition pilots can pick, the steps from table to distance.' }
		] },
		{ label: 'Verify before publishing', sections: [
			{ id: 'Test cases', label: 'Hand-calculated cases', description: 'Results someone worked out on paper. The app must match each one before you can publish.' },
			{ id: 'Compare tables', label: 'Compare tables', description: 'Every table of a real aircraft must be compared with the manual by a person before it can be published. Changing a table afterwards means comparing it again.' },
			{ id: 'Try it', label: 'Try it', description: 'Any inputs, with the full working, to see the data behave as the manual does.' },
			{ id: 'Check', label: 'Publish checks', description: 'Every check must pass before this aircraft can go into a release. There is no override.' }
		] },
		{ label: 'Advanced', sections: [{ id: 'JSON', label: 'Edit as JSON', description: 'The whole file, for anything the forms don\'t cover. See docs/FORMAT.md.' }] }
	];
	const SECTIONS = GROUPS.flatMap((g) => g.sections);
	const EDITORS: Record<string, Component<{ a: Aircraft; touch: () => void }>> = {
		Aircraft: AircraftEditor, Documents: SourcesEditor, Weighing: ConfigurationsEditor, Load: LoadEditor,
		Fuel: FuelEditor, Limits: LimitsEditor, Performance: PerformanceEditor, Notes: NotesEditor
	};
	let section = $derived(SECTIONS.find((x) => x.id === tab)!);
	let Editor = $derived(EDITORS[tab]);
	// Rerun on every change, so the sidebar always says what still blocks publishing.
	let liveChecks = $derived.by(() => { if (!editing) return null; try { return checkList($state.snapshot(editing.aircraft)); } catch { return null; } });
	let failing = $derived(liveChecks?.checks.filter((c) => c.status === 'fail') ?? []);
	/** A section is red while a check it fixes fails, green once they pass, and grey when nothing checks it yet. */
	function sectionStatus(id: string): Check['status'] | 'none' {
		const own = liveChecks?.checks.filter((c) => c.section === id) ?? [];
		if (!own.length) return 'none';
		return own.some((c) => c.status === 'fail') ? 'fail' : own.some((c) => c.status === 'blocked') ? 'blocked' : 'pass';
	}
	const DOT = { fail: 'bg-bad', pass: 'bg-good', blocked: 'bg-line-strong', none: 'bg-line-strong' };
	let summaries = $derived.by(() => { if (!parsed) return []; try { return caseSummaries(parsed); } catch { return []; } });
	let coverage = $derived.by(() => (parsed ? caseCoverage(parsed) : null));
	let openCase = $state<string | null>(null);
	async function showCase(id: string) {
		openCase = id;
		await tick();
		document.getElementById(`case-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
	const liveEntry = (registration: string) => overview?.index?.aircraft.find((e) => e.registration === registration && !e.withdrawn);
	// Pilots' Reports show the data revision, so changed data under the same number would be ambiguous.
	let published = $derived(editing ? liveEntry(editing.aircraft.registration) : undefined);
	let changedFromPublished = $state<boolean | null>(null);
	$effect(() => {
		const entry = published, data = editing ? $state.snapshot(editing.aircraft) : null;
		if (!entry?.sha256 || !data) { changedFromPublished = null; return; }
		let current = true;
		sha256(data).then((hash) => { if (current) changedFromPublished = hash !== entry.sha256; });
		return () => { current = false; };
	});
	let needsRevision = $derived(!!published && changedFromPublished === true && (editing?.aircraft.revision ?? 0) <= published.revision);
	function raiseRevision() { editing!.aircraft.revision = published!.revision + 1; touch(); }
	let showAdd = $state(false);
	let showSettings = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let nextRelease = $derived((overview?.index?.release ?? 0) + 1);
	// Pilots can only lose an aircraft through a withdrawal, so every published one can be withdrawn.
	let withdrawable = $derived([...new Set([...(overview?.index?.aircraft.filter((e) => !e.withdrawn).map((e) => e.registration) ?? []), ...(overview?.drafts.map((d) => d.registration).filter(Boolean) ?? [])])]);
	let parsed = $derived.by(() => { if (!editing) return null; const v = validateAircraft($state.snapshot(editing.aircraft)); return v.ok ? v.aircraft : null; });
	let validationProblems = $derived.by(() => { if (!editing) return []; const v = validateAircraft($state.snapshot(editing.aircraft)); return v.ok ? [] : v.problems; });
	let isFictional = $derived(editing?.aircraft?.fictional === true);
	let tableIds = $derived(editing ? Object.keys(editing.aircraft.tables ?? {}) : []);
	let caseFailures = $derived.by(() => { if (!parsed) return []; try { return runHandCases(parsed); } catch { return []; } });
	let testResult = $derived.by(() => { if (!parsed || !testInput) return null; try { return calculate(parsed, $state.snapshot(testInput)); } catch (e) { return String((e as Error).message); } });

	let signInName = $state('');
	let signInPassword = $state('');

	async function api(action: string, body: Record<string, unknown> = {}) {
		const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error ?? 'That didn\'t work.');
		return data;
	}
	async function refresh() {
		overview = await api('overview');
		operator = overview!.settings.operator;
	}
	onMount(() => {
		(async () => {
			try {
				status = await api('status');
				if (status!.signedIn) await refresh();
			} catch (e) { message = (e as Error).message; }
		})();
		const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
		addEventListener('beforeunload', warn);
		return () => removeEventListener('beforeunload', warn);
	});
	async function run(task: () => Promise<void>) {
		working = true; message = ''; problems = [];
		try { await task(); } catch (e) { message = (e as Error).message; }
		working = false;
	}
	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		await run(async () => {
			await api('signIn', { name: signInName, password: signInPassword });
			signInPassword = '';
			status = await api('status');
			await refresh();
		});
	}
	async function signOut() {
		await api('signOut');
		location.reload();
	}

	function open(id: string, aircraft: unknown, version: string | null) {
		editing = { id, aircraft: structuredClone(aircraft) as Aircraft, version };
		dirty = false; tab = 'Aircraft'; testInput = null; currentTable = ''; secondTable = '';
	}
	const openDraft = (id: string) => run(async () => { const d = await api('getDraft', { id }); open(id, d.data.aircraft, d.version); });
	const createAircraft = () => run(async () => {
		const reg = newName.trim();
		if (!reg) throw new Error('Enter a registration first.');
		let aircraft: unknown = NEW_AIRCRAFT(reg);
		if (copyFrom) aircraft = copyForNewAircraft((await api('getDraft', { id: copyFrom })).data.aircraft, reg);
		const id = draftId(reg), saved = await api('saveDraft', { id, aircraft });
		newName = ''; copyFrom = ''; showAdd = false;
		await refresh();
		open(id, aircraft, saved.version);
	});
	async function importFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await run(async () => {
			let aircraft: { registration?: string };
			try { aircraft = JSON.parse(await file.text()); } catch { throw new Error('That file isn\'t valid JSON.'); }
			if (!aircraft?.registration) throw new Error('That file has no registration.');
			await api('saveDraft', { id: draftId(aircraft.registration), aircraft });
			await refresh();
			message = `Imported ${aircraft.registration} as a draft.`;
		});
		(event.target as HTMLInputElement).value = '';
	}
	const save = () => run(async () => {
		const e = editing!;
		const saved = await api('saveDraft', { id: e.id, aircraft: $state.snapshot(e.aircraft), version: e.version });
		e.version = saved.version;
		dirty = false;
		message = 'Saved.';
	});
	async function close() {
		if (dirty && !confirm) return;
		editing = null;
		await run(refresh);
	}
	let confirm = $state(false);
	function requestClose() {
		if (dirty && !confirm) { confirm = true; return; }
		confirm = false; dirty = false;
		close();
	}
	function exportJson() {
		const url = URL.createObjectURL(new Blob([JSON.stringify($state.snapshot(editing!.aircraft), null, '\t')], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url; a.download = `${editing!.id}.json`; a.click();
		URL.revokeObjectURL(url);
	}
	const removeDraft = (id: string) => {
		if (confirmDelete !== id) { confirmDelete = id; return; }
		confirmDelete = null;
		run(async () => { await api('deleteDraft', { id }); await refresh(); });
	};
	const saveOperator = () => run(async () => { await api('saveSettings', { settings: { operator } }); await refresh(); showSettings = false; message = 'Saved.'; });
	const publish = () => run(async () => {
		const withdraw = withdrawReg ? { [withdrawReg]: withdrawReason } : undefined;
		const result = await api('publish', { notes, withdraw, include: chosen });
		if (!result.ok) { problems = result.problems; message = 'Nothing was published. Fix these first:'; return; }
		notes = ''; withdrawReg = ''; withdrawReason = ''; chosen = [];
		await refresh();
		message = `Published Release ${result.release}. Pilots see it when they next check for new data.`;
	});
	const restore = (release: number, registration: string) => run(async () => {
		await api('restore', { release, registration });
		await refresh();
		message = `${registration} from Release ${release} is now the draft. Publish to make it a new release.`;
	});

	function touch() { dirty = true; }
	function addTable() {
		const name = tableName.trim();
		if (!name) { message = 'Name the table first, such as "takeoff".'; return; }
		const id = makeId(name, Object.keys(editing!.aircraft.tables), 'table');
		const axes: Axis[] = [{ name: 'Altitude', input: 'pressureAltitude', unit: 'ft', values: [0, 2000], below: 'none', above: 'none' }, { name: 'Temperature', input: 'temperature', unit: 'C', values: [0, 20], below: 'none', above: 'none' }];
		editing!.aircraft.tables[id] = { axes, outputs: { total: emptyCells([2, 2]) }, source: defaultSource(editing!.aircraft) };
		currentTable = id; tableName = ''; touch();
	}
	function removeTable(id: string) { delete editing!.aircraft.tables[id]; currentTable = ''; touch(); }
	$effect(() => {
		if (tab === 'JSON' && editing) untrack(() => { jsonText = JSON.stringify($state.snapshot(editing!.aircraft), null, 2); jsonError = ''; });
		if (tab === 'Try it' && parsed && !testInput) untrack(() => { testInput = blankInput(parsed!); });
	});
	function applyJson() {
		try { editing!.aircraft = JSON.parse(jsonText); jsonError = ''; touch(); message = 'Applied. Save to keep it.'; }
		catch (e) { jsonError = `That isn't valid JSON: ${(e as Error).message}`; }
	}
</script>

<svelte:head><title>Admin, Aero Open Performance</title></svelte:head>

{#snippet dialog(title: string, description: string, open: boolean, setOpen: (v: boolean) => void, body: import('svelte').Snippet)}
	<Dialog.Root {open} onOpenChange={setOpen}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-40 bg-ink/40" />
			<Dialog.Content class="fixed top-1/2 left-1/2 z-50 flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-6 shadow-menu">
				<div>
					<Dialog.Title class="text-[19px] font-bold">{title}</Dialog.Title>
					<Dialog.Description class="mt-1 text-sm text-muted">{description}</Dialog.Description>
				</div>
				{@render body()}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/snippet}

{#snippet checksPage(list: NonNullable<typeof liveChecks>)}
	{@const passing = list.checks.filter((c) => c.status === 'pass').length}
	<div class={['flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3', failing.length ? 'border-bad-line bg-bad-bg' : 'border-good bg-good-bg']} role="status">
		{#if failing.length}
			<span class="num flex size-8 flex-none items-center justify-center rounded-full bg-bad font-semibold text-surface">{failing.length}</span>
			<span class="flex-1"><strong>{failing.length} check{failing.length > 1 ? 's' : ''} to fix.</strong> <span class="text-ink-2">{passing} pass. They rerun on every change.</span></span>
		{:else}
			<span class="flex size-8 flex-none items-center justify-center rounded-full bg-good text-surface"><Icon name="check" size={16} stroke={3} /></span>
			<span class="flex-1 font-bold text-good">This aircraft passes every check.</span>
		{/if}
	</div>
	{#each ['Aircraft data', 'Mass and balance', 'Performance and verification'] as group (group)}
		{@const own = list.checks.filter((c) => c.group === group)}
		<section class="overflow-hidden rounded-xl border border-line bg-surface" aria-label={group}>
			<div class="flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-2">
				<h3 class="text-[16px] font-bold">{group}</h3>
				<span class="num text-[13px] text-muted">{own.filter((c) => c.status === 'pass').length} of {own.length}</span>
			</div>
			<ul class="m-0 list-none p-0">
				{#each own as c (c.id)}
					<li class="flex min-h-12 items-center gap-3 border-t border-canvas px-5 py-1.5">
						<span class={['flex size-6 flex-none items-center justify-center rounded-full', { pass: 'bg-good-bg text-good', fail: 'bg-bad-bg text-bad', blocked: 'bg-canvas text-muted' }[c.status]]}>
							<Icon name={c.status === 'pass' ? 'check' : c.status === 'fail' ? 'close' : 'more'} size={12} stroke={3} />
						</span>
						<span class="flex-1 text-sm">
							{#if c.status === 'fail'}<strong>{c.label}</strong>{:else}{c.label}{/if}
							{#if c.status === 'blocked'}<span class="text-muted"> · runs once the data is complete</span>{/if}
							{#each c.problems as p (p)}<br /><span class="text-[13px] text-ink-2">{p}</span>{/each}
						</span>
						{#if c.status === 'fail' && c.section !== 'Check'}<Button size="sm" onclick={() => (tab = c.section)}>Fix</Button>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	{#if list.unusual.length && editing}
		<Card title="Unusual values" description="Compare each with the manual, and tick it only if the manual really says this.">
			{#each list.unusual as u (u)}
				<label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-0.5 size-5" checked={(editing.aircraft.acknowledgedUnusualValues ?? []).includes(u)} onchange={(e) => { const acknowledged = editing!.aircraft.acknowledgedUnusualValues ?? []; editing!.aircraft.acknowledgedUnusualValues = e.currentTarget.checked ? [...acknowledged, u] : acknowledged.filter((x: string) => x !== u); touch(); }} /> <span>{u}</span></label>
			{/each}
		</Card>
	{/if}
	<Card title="Optional" description="Compare tables and Try it help find mistakes, but don't block publishing." />
{/snippet}

{#snippet aside()}
	<aside class="flex min-w-0 flex-col gap-3" aria-label="Before publishing">
		<section class="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
			<span class="label-caps">Before publishing</span>
			{#if needsRevision && published}
				<div class="flex flex-col gap-2 rounded-lg bg-amber-bg p-3 text-sm text-amber-ink">
					<span><strong>Raise the data revision.</strong> The data changed since pilots got revision {published.revision}, and their Reports show this number.</span>
					<Button size="sm" variant="dark" class="self-start" onclick={raiseRevision}>Raise to {published.revision + 1}</Button>
				</div>
			{/if}
			{#if !liveChecks}
				<span class="text-sm text-muted">Checks run once the draft can be read.</span>
			{:else if failing.length}
				<div class="flex gap-2.5">
					<span class="num flex size-6 flex-none items-center justify-center rounded-full bg-bad-bg text-[13px] font-semibold text-bad">{failing.length}</span>
					<span class="text-sm"><strong>{failing[0].label}</strong><br /><span class="text-ink-2">{failing[0].problems[0]}</span></span>
				</div>
				{#if failing[0].section !== tab}
					<button type="button" class="link min-h-0 self-start p-0 text-sm" onclick={() => (tab = failing[0].section)}>Go to {SECTIONS.find((x) => x.id === failing[0].section)?.label}</button>
				{/if}
				<button type="button" class="link min-h-0 self-start p-0 text-sm" onclick={() => (tab = 'Check')}>See all publish checks</button>
			{:else}
				<div class="flex items-center gap-2.5 text-sm"><span class="flex size-6 items-center justify-center rounded-full bg-good-bg text-good"><Icon name="check" size={13} stroke={3} /></span>Every check passes.</div>
			{/if}
		</section>
		<section class="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
			<span class="label-caps">{tab === 'Test cases' ? 'Coverage' : 'Hand-calculated cases'}</span>
			{#if parsed && coverage && tab === 'Test cases'}
				{#each [['Takeoff conditions', coverage.takeoff], ['Landing conditions', coverage.landing]] as const as [label, c] (label)}
					<span class="flex justify-between text-sm"><span>{label}</span><span class={['num', c.missing.length ? 'text-amber' : 'text-good']}>{c.covered} of {c.total}</span></span>
				{/each}
				{#each [...coverage.takeoff.missing.map((m) => `${m} takeoff`), ...coverage.landing.missing.map((m) => `${m} landing`)] as m (m)}
					<span class="text-[13px] text-muted">{m} has no case yet.</span>
				{/each}
			{:else if parsed}
				<span class="text-sm"><strong>{parsed.handCases.length} case{parsed.handCases.length === 1 ? '' : 's'}</strong>, {caseFailures.length ? `${new Set(caseFailures.map((f) => f.caseId)).size} failing` : 'all passing'}</span>
				<span class="text-[13px] text-muted">They rerun on every change.</span>
			{:else}<span class="text-sm text-muted">Finish the other sections first.</span>{/if}
		</section>
	</aside>
{/snippet}

<div class="flex min-h-dvh flex-col">
	{#if editing}
		<header class="border-b border-line bg-surface">
			<div class="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
				<Button variant={confirm ? 'danger' : 'default'} onclick={requestClose}>{#if !confirm}<Icon name="chevron-left" size={18} stroke={2.2} />{/if}{confirm ? 'Tap again to discard changes' : 'Back to list'}</Button>
				<div class="min-w-0 flex-1">
					<h1 class="truncate text-[20px] font-bold">{editing.aircraft.registration || editing.id} <span class="text-[15px] font-normal text-muted">{editing.aircraft.type}</span></h1>
					<span class={['text-[13px]', dirty ? 'font-semibold text-amber' : 'text-muted']}>{dirty ? 'Unsaved changes' : 'All changes saved'} · draft revision {editing.aircraft.revision ?? '–'}</span>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button onclick={exportJson}>Export JSON</Button>
					<Button variant="primary" disabled={working || !dirty} onclick={save}>{dirty ? 'Save draft' : 'Saved'}</Button>
				</div>
			</div>
		</header>
	{:else}
		<header class="border-b border-line bg-surface">
			<div class="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
				<div class="flex items-baseline gap-2.5">
					<strong class="text-[19px]">Admin</strong>
					{#if overview?.settings.operator}<span class="text-muted">{overview.settings.operator}</span>{/if}
				</div>
				<div class="flex flex-wrap items-center gap-1">
					{#if status?.signedIn}
						<span class="px-2 text-sm text-muted">Signed in as {status.name}</span>
						<Button variant="ghost" disabled={working} onclick={() => run(async () => { await refresh(); message = 'Reloaded.'; })}>Reload</Button>
						<Button variant="ghost" onclick={() => (showSettings = true)}>Settings</Button>
						<Button variant="ghost" onclick={signOut}>Sign out</Button>
					{/if}
					<Button variant="ghost" href={resolve('/')}>Back to the app</Button>
				</div>
			</div>
		</header>
	{/if}
	<div class="border-b border-amber-edge bg-amber-bg text-[13px] text-amber-ink">
		<div class="mx-auto max-w-[1240px] px-4 py-1.5 sm:px-5"><strong>Pre-release, not for flight.</strong> What you publish here reaches pilots' devices.</div>
	</div>

	<main class="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-4 px-4 py-5 sm:px-5">
		{#if message}<div class="banner {problems.length || /n't|not /.test(message) ? 'notsent' : 'sent'}" role="status">{message}</div>{/if}
		{#if problems.length}<ul class="m-0 list-disc pl-5 text-bad" aria-label="Problems">{#each problems as p (p)}<li>{p}</li>{/each}</ul>{/if}

		{#if !status}
			<p class="muted">Loading</p>
		{:else if !status.configured}
			<Card title="Not set up on this deployment" class="mx-auto w-full max-w-[640px]">
				<p>The admin area is optional. Pilots aren't affected. To turn it on, set these in your host's settings and redeploy:</p>
				<ul class="m-0 list-disc pl-5">
					<li><code>ADMIN_PASSWORD</code>, a long random password of at least 16 characters</li>
					<li>A connected Vercel Blob store (private)</li>
				</ul>
				<p class="muted">You can also publish hand-written files with the command-line tool. See <code>docs/FORMAT.md</code>.</p>
			</Card>
		{:else if !status.signedIn}
			<Card title="Sign in" description="One admin password for this copy of the app." class="mx-auto w-full max-w-[440px]">
				<form class="flex flex-col gap-3" onsubmit={signIn}>
					<label class="adm-field">Your name, recorded on what you change and publish<input class="adm" autocomplete="name" required maxlength="60" bind:value={signInName} /></label>
					<label class="adm-field">Admin password<input class="adm" type="password" autocomplete="current-password" required bind:value={signInPassword} /></label>
					<Button type="submit" variant="primary" size="lg" disabled={working}>Sign in</Button>
				</form>
			</Card>
		{:else if editing}
			<div class="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
				<nav aria-label="Aircraft setup sections" class="flex flex-col gap-4 lg:sticky lg:top-4">
					{#each GROUPS as group (group.label)}
						<div class="flex flex-col gap-0.5">
							<span class="label-caps px-3 pb-1">{group.label}</span>
							{#each group.sections as s (s.id)}
								<button
									type="button"
									aria-current={tab === s.id ? 'page' : undefined}
									onclick={() => (tab = s.id)}
									class="flex min-h-10 items-center justify-between gap-2 rounded-lg border-0 bg-transparent px-3 text-left text-sm font-medium text-ink-2 hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:shadow-raised"
								>
									<span class="flex items-center gap-2.5">
										{#if s.id !== 'Check' && s.id !== 'JSON'}<span aria-hidden="true" class={['size-2 flex-none rounded-full', DOT[sectionStatus(s.id)]]}></span>{/if}
										{s.label}
									</span>
									{#if s.id === 'Check' && failing.length}<span aria-hidden="true" class="num rounded-full bg-bad-bg px-[7px] py-0.5 text-xs text-bad">{failing.length}</span>{/if}
								</button>
							{/each}
						</div>
					{/each}
				</nav>

				<div class="adm-body flex min-w-0 flex-col gap-4">
					<div>
						<h2 class="text-[22px]! font-bold tracking-[-0.01em]">{section.label}</h2>
						<p class="mt-0.5 text-muted">{section.description}</p>
					</div>
					{#if tab === 'Check' && liveChecks}
						{@render checksPage(liveChecks)}
					{:else}
					<section class="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface p-5">
						{#if Editor}
							<Editor a={editing.aircraft} {touch} />
						{:else if tab === 'Tables'}
							<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tables">
								{#each tableIds as id (id)}<Button size="sm" variant={currentTable === id ? 'dark' : 'default'} onclick={() => (currentTable = id)}>{id}</Button>{/each}
								<input class="adm max-w-56" placeholder="New table, e.g. takeoff" aria-label="New table name" bind:value={tableName} />
								<Button size="sm" onclick={addTable}><Icon name="plus" />Add table</Button>
							</div>
							{#if currentTable && editing.aircraft.tables[currentTable]}
								{#key currentTable}<TableEditor id={currentTable} table={editing.aircraft.tables[currentTable]} onchange={touch} />{/key}
								<div><Button variant="danger-quiet" onclick={() => removeTable(currentTable)}>Delete this table</Button></div>
							{/if}
						{:else if tab === 'Compare tables'}
							{#if isFictional}<p>Fictional aircraft don't need this.</p>{/if}
							<div class="flex flex-wrap gap-1.5">{#each tableIds as id (id)}{@const s = tableCheckState(editing.aircraft.tables[id])}<Button size="sm" variant={secondTable === id ? 'dark' : 'default'} onclick={() => (secondTable = id)}>{s.status === 'checked' ? '✓ ' : ''}{id}</Button>{/each}</div>
							{#if secondTable && editing.aircraft.tables[secondTable]}
								{#key secondTable}<TableVerify a={editing.aircraft} id={secondTable} table={editing.aircraft.tables[secondTable]} by={status?.name ?? ''} {touch} />{/key}
							{/if}
						{:else if tab === 'Test cases'}
							{#if !parsed}
								<div class="banner unk">Finish the other sections first. Still needed: {validationProblems[0]}</div>
							{:else}
								{@const failingCases = new Set(caseFailures.map((f) => f.caseId)).size}
								<div class="flex flex-wrap items-center justify-between gap-3">
									<p class={['font-semibold', failingCases ? 'text-bad' : 'text-good']} role="status">{failingCases ? `${failingCases} of ${parsed.handCases.length} cases fail.` : `${parsed.handCases.length} of ${parsed.handCases.length} match.`} <span class="font-normal text-muted">They rerun on every change.</span></p>
									<Button onclick={() => { const c = newHandCase(parsed!, status?.name ?? '', Date.now()); editing!.aircraft.handCases.push(c); touch(); showCase(c.id); }}><Icon name="plus" />Add a case</Button>
								</div>
								<p class="text-sm text-muted">Each takeoff and landing condition needs a case between table values, and a fictional aircraft one exactly on a table value too. Also check forward CG, aft CG and an exceeded limit. One case can check a takeoff, a landing, the CG and a limit together.</p>
								{#if summaries.length}
									<div class="-mx-5 overflow-x-auto border-y border-line">
										<table class="w-full border-collapse text-sm">
											<thead>
												<tr class="bg-subtle-2 text-left">
													<th class="label-caps px-3 py-2 text-[11px] first:pl-5">#</th>
													<th class="label-caps min-w-[260px] px-3 py-2 text-[11px]">Situation</th>
													<th class="label-caps px-3 py-2 text-right text-[11px]">Ground roll<br /><span class="font-normal tracking-normal normal-case">paper · app</span></th>
													<th class="label-caps px-3 py-2 text-right text-[11px]">Total<br /><span class="font-normal tracking-normal normal-case">paper · app</span></th>
													<th class="label-caps px-3 py-2 pr-5 text-[11px]">Result</th>
												</tr>
											</thead>
											<tbody>
												{#each summaries as row, i (`${row.caseId}-${row.phase}`)}
													<tr class="border-t border-divider">
														<td class="num px-3 py-2 pl-5 align-top text-muted">{i + 1}</td>
														<td class="px-3 py-2 align-top">
															<button type="button" class="link min-h-0 p-0 text-left font-normal text-ink no-underline hover:underline" onclick={() => showCase(row.caseId)}>
																{#if row.phase === 'massBalance'}<strong>Mass and balance</strong>{row.situation.slice('Mass and balance'.length)}{:else}<strong>{row.situation.split(',')[0]}</strong>{row.situation.slice(row.situation.indexOf(','))}{/if}
															</button>
															<br /><span class="text-[13px] text-muted">{row.label} · {row.detail}</span>
														</td>
														{#each [row.groundRoll, row.total] as v, k (k)}
															<td class={['num px-3 py-2 text-right align-top whitespace-nowrap', v.paper !== v.app && 'font-semibold text-bad']}>{v.paper} · {v.app}</td>
														{/each}
														<td class="px-3 py-2 pr-5 align-top"><span class={['rounded-full px-2 py-0.5 text-xs font-semibold', row.matches ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad']}>{row.matches ? 'Match' : 'Differs'}</span></td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
								<h3 class="pt-2 text-[16px] font-bold">Edit cases</h3>
								{#each editing.aircraft.handCases as c, i (c.id)}
									<CaseEditor aircraft={parsed} {c} open={openCase === c.id} fails={caseFailures.filter((f) => f.caseId === c.id)} {touch} remove={() => { editing!.aircraft.handCases.splice(i, 1); touch(); }} />
								{/each}
							{/if}
						{:else if tab === 'Try it'}
							{#if !parsed}<div class="banner unk">Finish the other sections first. Still needed: {validationProblems[0]}</div>
							{:else if testInput}
								<CaseInputs aircraft={parsed} input={testInput} onchange={() => {}} />
								{#if typeof testResult === 'string'}<div class="banner notsent">{testResult}</div>
								{:else if testResult}
									<p><strong>Takeoff mass</strong> <span class="num">{testResult.massBalance.takeoff.mass.toFixed(1)}</span>, CG <span class="num">{testResult.massBalance.takeoff.arm.toFixed(3)}</span>. <strong>Landing mass</strong> <span class="num">{testResult.massBalance.landing.mass.toFixed(1)}</span>, CG <span class="num">{testResult.massBalance.landing.arm.toFixed(3)}</span>.</p>
									{#if testResult.exceeded.length}<p class="font-bold text-bad">Exceeded: {testResult.exceeded.join(', ')}</p>{/if}
									{#each [['Takeoff', testResult.takeoff], ['Landing', testResult.landing]] as const as [title, r] (title)}
										<div><strong>{title}:</strong> {r.status === 'ok' ? `total ${r.total ?? '-'}, ground roll ${r.groundRoll ?? '-'} ${r.unit}` : r.reason}
											{#if r.steps.length}<div class="overflow-x-auto"><table><thead><tr><th>Step</th><th class="n">Total</th><th class="n">Ground roll</th></tr></thead><tbody>{#each r.steps as s, i (i)}<tr><td>{i + 1}. {s.detail}{s.cells ? `. Table values ${s.cells.join(', ')}` : ''}</td><td class="n num">{s.total?.toFixed(1) ?? '-'}</td><td class="n num">{s.groundRoll?.toFixed(1) ?? '-'}</td></tr>{/each}</tbody></table></div>{/if}
											{#each r.warnings as w (w)}<p class="m-0 text-sm font-semibold text-amber">{w}</p>{/each}
										</div>
									{/each}
								{/if}
							{/if}
						{:else if tab === 'JSON'}
							<textarea class="adm h-96 w-full font-mono text-sm" spellcheck="false" aria-label="Aircraft file as JSON" bind:value={jsonText}></textarea>
							{#if jsonError}<div class="banner notsent" role="alert">{jsonError}</div>{/if}
							<div><Button onclick={applyJson}>Apply</Button></div>
						{/if}
					</section>
					{/if}
				</div>

				{@render aside()}
			</div>
		{:else if overview}
			{#if overview.updateAvailable}
				<div class="flex flex-wrap items-center gap-3 rounded-xl border border-accent-ring bg-accent-soft px-4 py-3 text-sm" role="status">
					<Icon name="info" size={18} class="text-accent" />
					<span class="flex-1">App version <span class="num">{overview.updateAvailable}</span> is available. This copy is on <span class="num">{overview.version}</span> and doesn't update itself. Updates can include security fixes: see <code>docs/ADMIN.md</code>.</span>
				</div>
			{/if}

			<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div class="flex min-w-0 flex-col gap-4">
					<Card title="Aircraft" description="Drafts are private until you publish them.">
						{#snippet actions()}
							<div class="flex flex-wrap gap-2">
								<Button onclick={() => fileInput?.click()}>Import JSON</Button>
								<input bind:this={fileInput} class="sr-only" type="file" accept="application/json,.json" aria-label="Import a JSON file" onchange={importFile} />
								<Button variant="primary" onclick={() => (showAdd = true)}><Icon name="plus" stroke={2.5} />Add aircraft</Button>
							</div>
						{/snippet}
						{#if !overview.drafts.length}<p>No aircraft yet. Add one, or import a file.</p>{:else}
							<div class="-mx-5 -mb-5 overflow-x-auto">
								<table class="w-full border-collapse text-sm">
									<thead>
										<tr class="border-y border-line bg-subtle-2 text-left">
											{#each ['Registration', 'Type', 'Status', 'Last change'] as h (h)}<th class="label-caps px-5 py-2 text-[11px]">{h}</th>{/each}
											<th class="px-5 py-2"><span class="sr-only">Actions</span></th>
										</tr>
									</thead>
									<tbody>
										{#each overview.drafts as d (d.id)}
											<tr class="border-b border-divider last:border-b-0">
												<td class="px-5 py-3"><button type="button" class="link num min-h-0 p-0 font-semibold no-underline" onclick={() => openDraft(d.id)}>{d.registration || d.id}</button></td>
												<td class="px-5 py-3">{d.type}<br /><span class="text-[13px] text-muted">Revision {d.revision ?? '–'}</span></td>
												<td class="px-5 py-3">
													<span class={['rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', !d.published ? 'bg-amber-bg text-amber' : d.published.same ? 'bg-canvas text-ink-2' : 'bg-accent-soft text-accent-strong']}>
														{!d.published ? 'New, not published' : d.published.same ? 'Same as published' : `Changed since Release ${d.published.release}`}
													</span>
												</td>
												<td class="px-5 py-3">{d.updatedBy}<br /><span class="num text-[13px] text-muted">{d.updatedAt.slice(0, 10)}</span></td>
												<td class="px-5 py-3">
													<div class="flex justify-end gap-1.5">
														<Button size="sm" onclick={() => openDraft(d.id)}>Edit</Button>
														<Button size="sm" variant={confirmDelete === d.id ? 'danger' : 'danger-quiet'} onclick={() => removeDraft(d.id)}>{confirmDelete === d.id ? 'Tap again to delete draft' : 'Delete'}</Button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</Card>

					<Card title="Release history">
						{#if !overview.releases.length}<p class="muted">No releases yet.</p>{/if}
						{#each overview.releases as r (r.release)}
							<div class="grid gap-x-4 gap-y-1 border-t border-divider pt-3 first-of-type:border-t-0 first-of-type:pt-0 sm:grid-cols-[100px_minmax(0,1fr)]">
								<strong>Release {r.release}</strong>
								<div class="flex min-w-0 flex-col gap-1 text-sm">
									{#if r.notes}<span>{r.notes}</span>{/if}
									{#if r.changes.length}
										<ul class="m-0 list-none p-0 text-muted">
											{#each r.changes as c (c.registration)}
												<li>{c.registration}: {c.text} {#if !c.text.startsWith('Withdrawn') && !c.text.startsWith('Removed')}<button type="button" class="link min-h-8 py-0 text-sm" onclick={() => restore(r.release, c.registration)}>Restore as draft</button>{/if}</li>
											{/each}
										</ul>
									{/if}
									<span class="num text-xs text-muted">{r.published.slice(0, 16).replace('T', ' ')} UTC · {r.publishedBy}</span>
								</div>
							</div>
						{/each}
					</Card>
				</div>

				<aside aria-label="Next release" class="flex flex-col gap-3 lg:sticky lg:top-4">
					<section class="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
						<div>
							<span class="label-caps">Next release</span>
							<h2 class="text-[19px] font-bold">Release {nextRelease}</h2>
							<p class="mt-0.5 text-sm text-muted">{overview.index ? `Pilots are on Release ${overview.index.release}.` : 'Nothing is published yet.'} Releases are permanent.</p>
						</div>
						{#if overview.drafts.length}
							<fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
								<legend class="label-caps mb-1">Include</legend>
								{#each overview.drafts as d (d.id)}
									{@const live = liveEntry(d.registration)}
									<label class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-1.5 has-checked:border-accent has-checked:bg-accent-soft">
										<input type="checkbox" class="size-5" checked={chosen.includes(d.id)} onchange={(e) => (chosen = e.currentTarget.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id))} />
										<span class="flex-1 text-sm"><strong>{d.registration || d.id}</strong> <span class="text-muted">{live ? 'published now, this updates it' : 'new for pilots'}</span></span>
									</label>
								{/each}
								<span class="mt-1 text-[13px] text-muted">Unchanged aircraft stay as pilots have them. Each one is checked, with no override.</span>
							</fieldset>
						{/if}
						<label class="adm-field">What changed, shown to pilots<input class="adm" bind:value={notes} /></label>
						{#if withdrawable.length}
							<Collapsible.Root open={!!withdrawReg}>
								<Collapsible.Trigger class="min-h-9 border-0 bg-transparent p-0 text-sm font-semibold text-accent">Withdraw an aircraft instead</Collapsible.Trigger>
								<Collapsible.Content class="flex flex-col gap-2 pt-2">
									<label class="adm-field">Withdraw an aircraft<select class="adm" bind:value={withdrawReg}><option value="">None</option>{#each withdrawable as reg (reg)}<option value={reg}>{reg}</option>{/each}</select></label>
									{#if withdrawReg}
										<label class="adm-field">Reason, shown to pilots (required)<input class="adm" bind:value={withdrawReason} /></label>
										<p class="text-[13px] text-muted">Devices block this aircraft as soon as they see the release. A device that stays offline can't learn this.</p>
									{/if}
								</Collapsible.Content>
							</Collapsible.Root>
						{/if}
						<Button variant="primary" size="lg" disabled={working || (!chosen.length && !withdrawReg)} onclick={publish}>{working ? 'Working' : `Check and publish Release ${nextRelease}`}</Button>
					</section>
				</aside>
			</div>
		{/if}
	</main>
</div>

{#snippet addBody()}
	<div class="flex flex-col gap-3">
		<label class="adm-field">New registration<input class="adm" bind:value={newName} placeholder="HB-XXX" /></label>
		{#if overview?.drafts.length}<label class="adm-field">Start from<select class="adm" bind:value={copyFrom}><option value="">Blank</option>{#each overview.drafts as d (d.id)}<option value={d.id}>Copy of {d.registration || d.id}</option>{/each}</select></label>{/if}
		{#if copyFrom}<p class="muted">A copy is independent. Its tables and test cases start empty, so they get entered and checked again.</p>{/if}
		{#if message && showAdd}<p class="adm-error">{message}</p>{/if}
		<div class="flex justify-end gap-2">
			<Dialog.Close class="min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold">Cancel</Dialog.Close>
			<Button variant="primary" disabled={working} onclick={createAircraft}>Add aircraft</Button>
		</div>
	</div>
{/snippet}
{@render dialog('Add aircraft', 'A new draft, private until you publish it.', showAdd, (v) => (showAdd = v), addBody)}

{#snippet settingsBody()}
	<div class="flex flex-col gap-3">
		<label class="adm-field">Operator, the name shown on reports and data<input class="adm" bind:value={operator} /></label>
		<div class="flex justify-end gap-2">
			<Dialog.Close class="min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold">Cancel</Dialog.Close>
			<Button variant="primary" disabled={working} onclick={saveOperator}>Save</Button>
		</div>
	</div>
{/snippet}
{@render dialog('Settings', 'For this copy of the app.', showSettings, (v) => (showSettings = v), settingsBody)}
