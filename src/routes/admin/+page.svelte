<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
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
	import { entryUnits, limitLabel, makeId, shown, stored } from '#lib/admin/editing.ts';
	import { NEW_AIRCRAFT, copyForNewAircraft, emptyCells } from '#lib/admin/table-grid.ts';
	import TableVerify from '#lib/components/admin/TableVerify.svelte';
	import { tableCheckState } from '#lib/data/table-check.ts';
	import { publishChecks } from '#lib/data/publish-checks.ts';
	import { validateAircraft } from '#lib/aircraft/validate.ts';
	import type { Aircraft, CalculationInput, HandCase } from '#lib/aircraft/schema.ts';
	import { calculate, runHandCases } from '#lib/engine/index.ts';

	type Status = { configured: boolean; signedIn: boolean; name: string | null; storage: string | null };
	type Overview = { drafts: { id: string; registration: string; type: string; revision: number | null; updatedBy: string; updatedAt: string }[]; settings: { operator: string }; index: { release: number; aircraft: { registration: string; withdrawn?: { reason: string } }[] } | null; releases: { release: number; publishedBy: string; published: string; notes: string | null; changes: { registration: string; text: string }[] }[]; version: string; updateAvailable: string | null };

	let status = $state<Status | null>(null);
	let overview = $state<Overview | null>(null);
	let message = $state('');
	let problems = $state<string[]>([]);
	let working = $state(false);

	let editing = $state<{ id: string; aircraft: any; version: string | null } | null>(null);
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
	let checked = $state<ReturnType<typeof publishChecks> | null>(null);
	let testInput = $state<CalculationInput | null>(null);
	let jsonText = $state('');
	let jsonError = $state('');

	// In the order a manual is usually entered.
	const TABS = ['Aircraft', 'Documents', 'Weighing', 'Load', 'Fuel', 'Limits', 'Tables', 'Performance', 'Notes', 'Test cases', 'Compare tables', 'Try it', 'Check', 'JSON'];
	const EDITORS: Record<string, { title: string; component: any }> = {
		Aircraft: { title: 'Aircraft', component: AircraftEditor },
		Documents: { title: 'Documents', component: SourcesEditor },
		Weighing: { title: 'Weighing and Configurations', component: ConfigurationsEditor },
		Load: { title: 'Loading Stations', component: LoadEditor },
		Fuel: { title: 'Fuel', component: FuelEditor },
		Limits: { title: 'Limits', component: LimitsEditor },
		Performance: { title: 'Takeoff and landing', component: PerformanceEditor },
		Notes: { title: 'Notes for pilots', component: NotesEditor }
	};
	let section = $derived(EDITORS[tab]);
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
	const safeId = (reg: string) => reg.trim().replace(/[^A-Za-z0-9._-]/g, '-');

	function open(id: string, aircraft: unknown, version: string | null) {
		editing = { id, aircraft: structuredClone(aircraft), version };
		dirty = false; tab = 'Aircraft'; checked = null; testInput = null; currentTable = ''; secondTable = '';
	}
	const openDraft = (id: string) => run(async () => { const d = await api('getDraft', { id }); open(id, d.data.aircraft, d.version); });
	const createAircraft = () => run(async () => {
		const reg = newName.trim();
		if (!reg) throw new Error('Enter a registration first.');
		let aircraft: unknown = NEW_AIRCRAFT(reg);
		if (copyFrom) aircraft = copyForNewAircraft((await api('getDraft', { id: copyFrom })).data.aircraft, reg);
		const id = safeId(reg), saved = await api('saveDraft', { id, aircraft });
		newName = ''; copyFrom = '';
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
			await api('saveDraft', { id: safeId(aircraft.registration), aircraft });
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
	const saveOperator = () => run(async () => { await api('saveSettings', { settings: { operator } }); await refresh(); message = 'Saved.'; });
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

	function touch() { dirty = true; checked = null; }
	function addTable() {
		const name = tableName.trim();
		if (!name) { message = 'Name the table first, such as "takeoff".'; return; }
		const id = makeId(name, Object.keys(editing!.aircraft.tables), 'table');
		const axes = [{ name: 'Altitude', input: 'pressureAltitude', unit: 'ft', values: [0, 2000], below: 'none', above: 'none' }, { name: 'Temperature', input: 'temperature', unit: 'C', values: [0, 20], below: 'none', above: 'none' }];
		editing!.aircraft.tables[id] = { axes, outputs: { total: emptyCells([2, 2]) }, source: Object.keys(editing!.aircraft.sources ?? {})[0] ?? '' };
		currentTable = id; tableName = ''; touch();
	}
	function removeTable(id: string) { delete editing!.aircraft.tables[id]; currentTable = ''; touch(); }
	$effect(() => {
		if (tab === 'JSON' && editing) untrack(() => { jsonText = JSON.stringify($state.snapshot(editing!.aircraft), null, 2); jsonError = ''; });
		if (tab === 'Check' && editing) untrack(() => { checked = publishChecks($state.snapshot(editing!.aircraft)); });
		if (tab === 'Try it' && parsed && !testInput) untrack(() => { testInput = blankInput(parsed!); });
	});
	function applyJson() {
		try { editing!.aircraft = JSON.parse(jsonText); jsonError = ''; touch(); message = 'Applied. Save to keep it.'; }
		catch (e) { jsonError = `That isn't valid JSON: ${(e as Error).message}`; }
	}
	function blankInput(a: Aircraft): CalculationInput {
		const perf = a.performance;
		return { configuration: a.configurations[0].id, loads: {}, fuel: {}, burnPlan: a.defaultBurnPlan, flightTimeHours: 0, fuelFlow: a.fuelFlow?.value ?? 0, elevation: null, qnh: null, oat: null, windDirection: null, windSpeed: null, runwayHeading: null, takeoffCondition: perf.takeoff[0]?.id ?? '', landingCondition: perf.landing[0]?.id ?? '' };
	}
	function limitIds(a: Aircraft): string[] {
		return [...a.stations.filter((s) => s.maxMass !== undefined).map((s) => `station:${s.id}`), ...a.combinedLimits.map((l) => `combined:${l.id}`), ...a.tanks.map((t) => `tank:${t.id}`), 'takeoffMass', 'takeoffCg', 'landingMass', 'landingCg', 'fuelBurn'];
	}
	function addCase() {
		const a = parsed!, n = editing!.aircraft.handCases.length + 1;
		editing!.aircraft.handCases.push({ id: `case-${n}-${Date.now().toString(36)}`, label: `Case ${n}`, author: status?.name ?? '', date: new Date().toISOString().slice(0, 10), input: blankInput(a), expected: { exceeded: [] } } satisfies HandCase);
		touch();
	}
	// Expected masses and arms are typed in the manual's units, like the inputs.
	const expectedKind = (key: string) => (key.endsWith('Mass') ? 'mass' : 'arm') as 'mass' | 'arm';
	function setExpected(c: any, key: string, text: string) {
		const n = Number(text.replace(',', '.'));
		if (text.trim() === '' || !Number.isFinite(n)) delete c.expected[key]; else c.expected[key] = stored(editing!.aircraft, expectedKind(key), n);
		touch();
	}
	function setExpectedResult(c: any, phase: 'takeoff' | 'landing', field: string, text: string) {
		const r = c.expected[phase] ?? { status: 'ok' };
		if (field === 'status') { if (text) r.status = text; else { delete c.expected[phase]; touch(); return; } }
		else { const n = Number(text); if (text.trim() === '' || !Number.isFinite(n)) delete r[field]; else r[field] = n; }
		c.expected[phase] = r;
		touch();
	}
	function toggleExceeded(c: any, id: string, on: boolean) {
		c.expected.exceeded = on ? [...c.expected.exceeded, id] : c.expected.exceeded.filter((x: string) => x !== id);
		touch();
	}
</script>

<svelte:head><title>Admin, Aero Open Performance</title></svelte:head>

<main class="admin">
	<div class="notice">Pre-release, not for flight. What you publish here reaches pilots' devices.</div>
	{#if message}<div class="banner {problems.length || /n't|not /.test(message) ? 'notsent' : 'sent'}" role="status">{message}</div>{/if}
	{#if problems.length}<ul class="m-0 list-disc pl-5 text-bad">{#each problems as p (p)}<li>{p}</li>{/each}</ul>{/if}

	{#if !status}
		<p class="muted">Loading</p>
	{:else if !status.configured}
		<h1>Admin</h1>
		<section>
			<h2>Not set up on this deployment</h2>
			<p>The admin area is optional. Pilots aren't affected. To turn it on, set these in your host's settings and redeploy:</p>
			<ul class="m-0 list-disc pl-5">
				<li><code>ADMIN_PASSWORD</code>, a long random password of at least 16 characters</li>
				<li>A connected Vercel Blob store (private)</li>
			</ul>
			<p class="muted">You can also publish hand-written files with the command-line tool. See <code>docs/FORMAT.md</code>.</p>
			<p><a href={resolve('/')}>Back to the app</a></p>
		</section>
	{:else if !status.signedIn}
		<h1>Admin</h1>
		<section>
			<form class="grid gap-2" onsubmit={signIn}>
				<label class="adm-field">Your name, recorded on what you change and publish<input class="adm" autocomplete="name" required maxlength="60" bind:value={signInName} /></label>
				<label class="adm-field">Admin password<input class="adm" type="password" autocomplete="current-password" required bind:value={signInPassword} /></label>
				<button type="submit" class="primary" disabled={working}>Sign in</button>
			</form>
			<p><a href={resolve('/')}>Back to the app</a></p>
		</section>
	{:else if editing}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h1>{editing.aircraft.registration || editing.id}</h1>
			<div class="flex flex-wrap gap-2">
				<button type="button" class="primary" disabled={working || !dirty} onclick={save}>{dirty ? 'Save draft' : 'Saved'}</button>
				<button type="button" onclick={exportJson}>Export JSON</button>
				<button type="button" class:danger={confirm} onclick={requestClose}>{confirm ? 'Tap again to discard changes' : 'Back to list'}</button>
			</div>
		</div>
		<nav class="flex flex-wrap gap-1" aria-label="Aircraft setup sections">
			{#each TABS as name (name)}<button type="button" class="adm-tab" class:primary={tab === name} aria-current={tab === name ? 'page' : undefined} onclick={() => (tab = name)}>{name}</button>{/each}
		</nav>

		<section>
			{#if section}
				<h2>{section.title}</h2>
				<section.component a={editing.aircraft} {touch} />
			{:else if tab === 'Tables'}
				<h2>Tables</h2>
				<p class="muted">Enter values exactly as printed in the manual. Steps such as factors go under Performance.</p>
				<div class="flex flex-wrap gap-1">
					{#each tableIds as id (id)}<button type="button" class:primary={currentTable === id} onclick={() => (currentTable = id)}>{id}</button>{/each}
					<input class="adm" placeholder="New table, e.g. takeoff" aria-label="New table name" bind:value={tableName} />
					<button type="button" onclick={addTable}>Add table</button>
				</div>
				{#if currentTable && editing.aircraft.tables[currentTable]}
					{#key currentTable}<TableEditor id={currentTable} table={editing.aircraft.tables[currentTable]} onchange={touch} />{/key}
					<button type="button" onclick={() => removeTable(currentTable)}>Delete this table</button>
				{/if}
			{:else if tab === 'Compare tables'}
				<h2>Compare tables with the manual</h2>
				{#if isFictional}<p>Fictional aircraft don't need this.</p>{/if}
				<p>Every table of a real aircraft must be compared with the manual by a person before it can be published. Changing a table afterwards means comparing it again.</p>
				<div class="flex flex-wrap gap-1">{#each tableIds as id (id)}{@const s = tableCheckState(editing.aircraft.tables[id])}<button type="button" class:primary={secondTable === id} onclick={() => (secondTable = id)}>{s.status === 'checked' ? '✓ ' : ''}{id}</button>{/each}</div>
				{#if secondTable && editing.aircraft.tables[secondTable]}
					{#key secondTable}<TableVerify a={editing.aircraft} id={secondTable} table={editing.aircraft.tables[secondTable]} by={status?.name ?? ''} {touch} />{/key}
				{/if}
			{:else if tab === 'Test cases'}
				<h2>Hand-calculated cases</h2>
				<p>Work these out by hand from the manual, then type the expected results. Each takeoff and landing condition needs one case on a table value and one between values. Also add forward CG, aft CG and over-limit cases.</p>
				{#if !parsed}
					<div class="banner unk">Finish the other sections first. Still needed: {validationProblems[0]}</div>
				{:else}
					<p class="font-semibold" role="status">{caseFailures.length ? `${new Set(caseFailures.map((f) => f.caseId)).size} of ${parsed.handCases.length} cases fail.` : `${parsed.handCases.length} cases, all passing.`}</p>
					{#each editing.aircraft.handCases as c, i (c.id)}
						{@const fails = caseFailures.filter((f) => f.caseId === c.id)}
						<details class="rounded-[5px] border border-line p-2">
							<summary class="font-semibold"><span class={fails.length ? 'text-bad' : 'text-good'}>{fails.length ? 'FAILS' : 'PASSES'}</span> {c.label}</summary>
							<div class="grid gap-3 pt-2">
								<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
									<label class="adm-field">Label<input class="adm" bind:value={c.label} oninput={touch} /></label>
									<label class="adm-field">Worked out by<input class="adm" bind:value={c.author} oninput={touch} /></label>
									<label class="adm-field">Date<input class="adm" bind:value={c.date} oninput={touch} /></label>
								</div>
								<h3 class="m-0 font-bold">Inputs</h3>
								<CaseInputs aircraft={parsed} input={c.input} onchange={touch} />
								<h3 class="m-0 font-bold">Expected results, worked out by hand</h3>
								<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
									{#each [['takeoffMass', 'Takeoff mass'], ['takeoffArm', 'Takeoff CG'], ['landingMass', 'Landing mass'], ['landingArm', 'Landing CG']] as [key, label] (key)}
										<label class="adm-field">{label}, {entryUnits(editing.aircraft)[expectedKind(key)]}<input class="adm" inputmode="decimal" value={c.expected[key] === undefined ? '' : shown(editing.aircraft, expectedKind(key), c.expected[key])} onchange={(e) => setExpected(c, key, e.currentTarget.value)} /></label>
									{/each}
									{#each ['takeoff', 'landing'] as const as phase (phase)}
										<label class="adm-field">{phase === 'takeoff' ? 'Takeoff' : 'Landing'} result<select class="adm" value={c.expected[phase]?.status ?? ''} onchange={(e) => setExpectedResult(c, phase, 'status', e.currentTarget.value)}><option value="">Not checked</option><option value="ok">A distance</option><option value="noData">No data</option><option value="noResult">No result</option><option value="needsInput">Needs input</option></select></label>
										<label class="adm-field">{phase === 'takeoff' ? 'Takeoff' : 'Landing'} total, rounded up<input class="adm" inputmode="numeric" value={c.expected[phase]?.total ?? ''} onchange={(e) => setExpectedResult(c, phase, 'total', e.currentTarget.value)} /></label>
										<label class="adm-field">{phase === 'takeoff' ? 'Takeoff' : 'Landing'} ground roll, rounded up<input class="adm" inputmode="numeric" value={c.expected[phase]?.groundRoll ?? ''} onchange={(e) => setExpectedResult(c, phase, 'groundRoll', e.currentTarget.value)} /></label>
									{/each}
								</div>
								<fieldset class="m-0 flex flex-wrap gap-3 border-0 p-0"><legend class="font-bold">Limits this case should exceed</legend>
									{#each limitIds(parsed) as id (id)}<label class="flex items-center gap-1 text-sm"><input type="checkbox" checked={c.expected.exceeded.includes(id)} onchange={(e) => toggleExceeded(c, id, e.currentTarget.checked)} /> {limitLabel(parsed, id)}</label>{/each}
								</fieldset>
								{#if fails.length}<ul class="m-0 list-disc pl-5 text-bad">{#each fails as f (f.field)}<li>{f.field}: you expected {String(f.expected)}, the tool got {String(f.actual)}. Check both against the manual.</li>{/each}</ul>{/if}
								<button type="button" onclick={() => { editing!.aircraft.handCases.splice(i, 1); touch(); }}>Delete this case</button>
							</div>
						</details>
					{/each}
					<button type="button" onclick={addCase}>Add a case</button>
				{/if}
			{:else if tab === 'Try it'}
				<h2>Try it</h2>
				{#if !parsed}<div class="banner unk">Finish the other sections first. Still needed: {validationProblems[0]}</div>
				{:else if testInput}
					<CaseInputs aircraft={parsed} input={testInput} onchange={() => {}} />
					{#if typeof testResult === 'string'}<div class="banner notsent">{testResult}</div>
					{:else if testResult}
						<p><strong>Takeoff mass</strong> {testResult.massBalance.takeoff.mass.toFixed(1)}, CG {testResult.massBalance.takeoff.arm.toFixed(3)}. <strong>Landing mass</strong> {testResult.massBalance.landing.mass.toFixed(1)}, CG {testResult.massBalance.landing.arm.toFixed(3)}.</p>
						{#if testResult.exceeded.length}<p class="font-bold text-bad">Exceeded: {testResult.exceeded.join(', ')}</p>{/if}
						{#each [['Takeoff', testResult.takeoff], ['Landing', testResult.landing]] as const as [title, r] (title)}
							<div><strong>{title}:</strong> {r.status === 'ok' ? `total ${r.total ?? '-'}, ground roll ${r.groundRoll ?? '-'} ${r.unit}` : r.reason}
								{#if r.steps.length}<div class="overflow-x-auto"><table><thead><tr><th>Step</th><th class="n">Total</th><th class="n">Ground roll</th></tr></thead><tbody>{#each r.steps as s, i (i)}<tr><td>{i + 1}. {s.detail}{s.cells ? `. Table values ${s.cells.join(', ')}` : ''}</td><td class="n">{s.total?.toFixed(1) ?? '-'}</td><td class="n">{s.groundRoll?.toFixed(1) ?? '-'}</td></tr>{/each}</tbody></table></div>{/if}
								{#each r.warnings as w (w)}<p class="m-0 text-sm font-semibold text-amber">{w}</p>{/each}
							</div>
						{/each}
					{/if}
				{/if}
			{:else if tab === 'Check'}
				<h2>Publish checks for this aircraft</h2>
				{#if checked}
					{#if checked.problems.length}
						<p class="font-bold text-bad" role="status">{checked.problems.length} still to fix.</p>
						<ul class="m-0 list-disc pl-5">{#each checked.problems as p (p)}<li>{p}</li>{/each}</ul>
					{:else}<p class="font-bold text-good" role="status">This aircraft passes every check.{isFictional ? '' : ''}</p>{/if}
					{#if checked.unusual.length}
						<h3 class="m-0 font-bold">Unusual values</h3>
						<p class="muted">Compare each with the manual, and tick it only if the manual really says this.</p>
						{#each checked.unusual as u (u)}
							<label class="flex items-start gap-2"><input type="checkbox" checked={(editing.aircraft.acknowledgedUnusualValues ?? []).includes(u)} onchange={(e) => { const list = editing!.aircraft.acknowledgedUnusualValues ?? []; editing!.aircraft.acknowledgedUnusualValues = e.currentTarget.checked ? [...list, u] : list.filter((x: string) => x !== u); touch(); checked = publishChecks($state.snapshot(editing!.aircraft)); }} /> <span>{u}</span></label>
						{/each}
					{/if}
				{/if}
			{:else if tab === 'JSON'}
				<h2>JSON</h2>
				<p class="muted">The whole file, for anything the forms don't cover. See <code>docs/FORMAT.md</code>.</p>
				<textarea class="adm h-96 w-full font-mono text-sm" spellcheck="false" aria-label="Aircraft file as JSON" bind:value={jsonText}></textarea>
				{#if jsonError}<div class="banner notsent" role="alert">{jsonError}</div>{/if}
				<button type="button" onclick={applyJson}>Apply</button>
			{/if}
		</section>
	{:else if overview}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h1>Admin</h1>
			<div class="flex flex-wrap items-center gap-2"><span class="muted">{status.name}</span><button type="button" onclick={signOut}>Sign out</button><a href={resolve('/')}>Back to the app</a></div>
		</div>
		{#if overview.updateAvailable}<div class="banner unk" role="status">Version {overview.updateAvailable} of the app is available, and this copy is on {overview.version}. Updates can include security fixes. Your copy doesn't update itself: see <code>docs/ADMIN.md</code>.</div>{/if}
		<section>
			<h2>Operator</h2>
			<div class="flex flex-wrap items-end gap-2"><label class="adm-field grow">Name shown on reports and data<input class="adm" bind:value={operator} /></label><button type="button" disabled={working} onclick={saveOperator}>Save</button></div>
		</section>
		<section>
			<h2>Aircraft drafts</h2>
			{#if !overview.drafts.length}<p>No aircraft yet. Add one below, or import a file.</p>{/if}
			{#each overview.drafts as d (d.id)}
				<div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
					<div><strong>{d.registration || d.id}</strong> {d.type}<br /><span class="muted">Revision {d.revision ?? '-'}. Changed by {d.updatedBy}, {d.updatedAt.slice(0, 10)}.</span></div>
					<div class="flex flex-wrap gap-1"><button type="button" onclick={() => openDraft(d.id)}>Edit</button><button type="button" class:danger={confirmDelete === d.id} onclick={() => removeDraft(d.id)}>{confirmDelete === d.id ? 'Tap again to delete draft' : 'Delete'}</button></div>
				</div>
			{/each}
			<div class="flex flex-wrap items-end gap-2 border-t border-line pt-2">
				<label class="adm-field">New registration<input class="adm" bind:value={newName} placeholder="HB-XXX" /></label>
				{#if overview.drafts.length}<label class="adm-field">Start from<select class="adm" bind:value={copyFrom}><option value="">Blank</option>{#each overview.drafts as d (d.id)}<option value={d.id}>Copy of {d.registration || d.id}</option>{/each}</select></label>{/if}
				<button type="button" disabled={working} onclick={createAircraft}>Add aircraft</button>
				<label class="adm-field">Import a JSON file<input type="file" accept="application/json,.json" onchange={importFile} /></label>
			</div>
			{#if copyFrom}<p class="muted">A copy is independent. Its tables and test cases start empty, so they get entered and checked again.</p>{/if}
		</section>
		<section>
			<h2>Publish</h2>
			<p>{overview.index ? `Pilots are on Release ${overview.index.release}.` : 'Nothing is published yet.'} Tick the aircraft to publish. Each one is checked, with no override. Aircraft you don't tick stay as pilots have them. Releases are permanent.</p>
			{#if overview.drafts.length}
				<fieldset class="m-0 grid gap-1 border-0 p-0">
					<legend class="adm-field">Aircraft in this release</legend>
					{#each overview.drafts as d (d.id)}
						{@const live = overview.index?.aircraft.find((e) => e.registration === d.registration && !e.withdrawn)}
						<label class="adm-check"><input type="checkbox" checked={chosen.includes(d.id)} onchange={(e) => (chosen = e.currentTarget.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id))} /> {d.registration || d.id} <span class="adm-hint">{live ? 'published now, this updates it' : 'new for pilots'}</span></label>
					{/each}
				</fieldset>
			{/if}
			<label class="adm-field">What changed, shown to pilots<input class="adm" bind:value={notes} /></label>
			{#if withdrawable.length}
				<div class="grid gap-2 md:grid-cols-2">
					<label class="adm-field">Withdraw an aircraft<select class="adm" bind:value={withdrawReg}><option value="">None</option>{#each withdrawable as reg (reg)}<option value={reg}>{reg}</option>{/each}</select></label>
					{#if withdrawReg}<label class="adm-field">Reason, shown to pilots (required)<input class="adm" bind:value={withdrawReason} /></label>{/if}
				</div>
				{#if withdrawReg}<p class="muted">Devices block this aircraft as soon as they see the release. A device that stays offline can't learn this.</p>{/if}
			{/if}
			<button type="button" class="primary" disabled={working || (!chosen.length && !withdrawReg)} onclick={publish}>{working ? 'Working' : 'Publish new release'}</button>
		</section>
		<section>
			<h2>Released</h2>
			{#if !overview.releases.length}<p class="muted">No releases yet.</p>{/if}
			{#each overview.releases as r (r.release)}
				<div class="border-t border-line pt-2">
					<strong>Release {r.release}</strong> <span class="muted">{r.published.slice(0, 16).replace('T', ' ')} UTC, by {r.publishedBy}</span>{#if r.notes}<br />{r.notes}{/if}
					{#if r.changes.length}<ul class="m-0 list-disc pl-5 text-sm">{#each r.changes as c (c.registration)}<li>{c.registration}: {c.text} {#if !c.text.startsWith('Withdrawn') && !c.text.startsWith('Removed')}<button type="button" class="link" onclick={() => restore(r.release, c.registration)}>Restore as draft</button>{/if}</li>{/each}</ul>{/if}
				</div>
			{/each}
		</section>
	{/if}
</main>
