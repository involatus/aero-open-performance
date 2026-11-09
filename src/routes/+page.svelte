<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { Tabs } from 'bits-ui';
	import { version } from '$app/env';
	import Keypad from '#lib/components/Keypad.svelte';
	import NumberField from '#lib/components/NumberField.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AppHeader from '#lib/components/pilot/AppHeader.svelte';
	import StepNav from '#lib/components/pilot/StepNav.svelte';
	import SummaryStrip from '#lib/components/pilot/SummaryStrip.svelte';
	import ResultsAside from '#lib/components/pilot/ResultsAside.svelte';
	import ReportsView from '#lib/components/pilot/ReportsView.svelte';
	import ChooseAircraft from '#lib/components/pilot/ChooseAircraft.svelte';
	import LoadStep from '#lib/components/pilot/steps/LoadStep.svelte';
	import FuelStep from '#lib/components/pilot/steps/FuelStep.svelte';
	import ConditionsStep from '#lib/components/pilot/steps/ConditionsStep.svelte';
	import SendStep from '#lib/components/pilot/steps/SendStep.svelte';
	import { utcText } from '#lib/app/presentation.ts';
	import { AppState } from '#lib/app/app-state.svelte.ts';
	import { describeChanges, isStale, STALE_DAYS } from '#lib/data/release.ts';
	import {
		STEP_NAMES, applyKey, applyQuick, canReport, confirmValue, fieldsFor, newCalculation, nextFlight,
		performanceOf, setByPilot, stepOfLimit, tabLabels, toDoList, toInput, type Calculation as Calc, type Field, type ToDo
	} from '#lib/app/calculation.ts';
	import { calculate } from '#lib/engine/index.ts';
	import { renderPdf } from '#lib/report/pdf.ts';
	import { fingerprint } from '#lib/report/report.ts';
	import { version as toolVersion } from '../../package.json';

	const app = new AppState();
	let choosing = $state(false);
	let padKey = $state<string | null>(null);
	let padFresh = $state(true);
	let confirmDelete = $state(false);
	let appUpdateReady = $state(false);
	let appUpdating = false;
	let showReports = $state(false);
	let now = $state(Date.now());
	let creating = $state(false);
	let reportError = $state('');
	// Ready before the tap, because iPadOS only allows sharing right after one.
	const pdfCache = new Map<string, File>();

	let calc = $derived<Calc | undefined>(app.tabs[app.current]);
	let blockedReason = $derived(calc ? app.withdrawn(calc.aircraft) ?? (app.aircraft.some((a) => a.registration === calc!.aircraft) ? null : 'This aircraft is no longer in the data.') : null);
	let aircraft = $derived(calc && !blockedReason ? app.aircraft.find((a) => a.registration === calc!.aircraft) : undefined);
	let fields = $derived(aircraft && calc ? fieldsFor(aircraft, calc) : []);
	let padField = $derived<Field | undefined>(padKey ? fields.flat().find((f) => f.key === padKey) : undefined);
	let results = $derived.by(() => {
		if (!aircraft || !calc) return undefined;
		try { return calculate(aircraft, toInput(aircraft, calc)); } catch { return undefined; }
	});
	let todo = $derived(aircraft && calc ? toDoList(aircraft, calc) : []);
	let ready = $derived(aircraft && calc && results ? canReport(aircraft, calc, results) : false);
	let perf = $derived(aircraft && calc ? performanceOf(aircraft, calc.configuration) : null);
	let exceededLimits = $derived(results ? results.massBalance.limits.filter((l) => l.status === 'exceeded') : []);
	let labels = $derived(tabLabels(app.tabs));
	let available = $derived(app.aircraft.filter((a) => !app.withdrawn(a.registration)));
	let isDemo = $derived(app.aircraft.length > 0 && app.aircraft.every((a) => a.fictional));
	let changes = $derived(app.pending ? describeChanges(app.data?.index ?? null, app.pending) : []);
	let dataIsStale = $derived(isStale(app.lastCheck, now));
	let latestReport = $derived(calc ? app.reports.find((r) => r.calculationId === calc!.id) : undefined);
	let reportIsCurrent = $derived(!!(latestReport && aircraft && calc && latestReport.fingerprint === fingerprint(aircraft, calc)));
	const makeId = () => `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

	onMount(() => {
		app.load().then(() => app.check());
		const online = () => { now = Date.now(); app.check(); };
		addEventListener('online', online);
		// The new app version waits until the pilot chooses to restart, so nothing changes mid-entry.
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.ready.then((registration) => {
				const refresh = () => { appUpdateReady = !!registration.waiting; };
				refresh();
				registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', refresh));
				if (navigator.onLine) registration.update().catch(() => {});
			});
			navigator.serviceWorker.addEventListener('controllerchange', () => { if (appUpdating) location.reload(); });
		}
		try { navigator.storage?.persist?.(); } catch { /* keeping data is best effort */ }
		const wake = () => { try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* optional */ } };
		addEventListener('click', wake, { once: true });
		// Saves when the app is hidden or closed, because iPadOS can end it without warning.
		const saveNow = () => { if (app.loaded) app.save(); };
		addEventListener('pagehide', saveNow);
		document.addEventListener('visibilitychange', saveNow);
	});

	$effect(() => {
		if (!app.loaded) return;
		app.save();
		// Reads the whole state so any change saves it.
		JSON.stringify(app.tabs); void app.current;
	});

	$effect(() => {
		if (latestReport) preparePdf(latestReport.id);
	});


	async function preparePdf(id: string): Promise<File | undefined> {
		if (pdfCache.has(id)) return pdfCache.get(id);
		const blob = await app.pdf(id);
		if (!blob) return undefined;
		const file = new File([blob], `${id}.pdf`, { type: 'application/pdf' });
		pdfCache.set(id, file);
		return file;
	}

	async function createReport() {
		if (!ready || !aircraft || !calc || !results || creating) return;
		creating = true;
		reportError = '';
		try {
			const report = await app.createReport(
				{ aircraft, calc: $state.snapshot(calc), results, toolVersion: `${toolVersion}, build ${version}` },
				{ random: crypto.getRandomValues(new Uint8Array(4)), render: renderPdf }
			);
			await preparePdf(report.id);
		} catch (error) {
			reportError = `The report could not be created: ${(error as Error).message}. Nothing was saved. Try again.`;
		}
		creating = false;
	}

	async function shareReport(id: string) {
		reportError = '';
		const file = pdfCache.get(id) ?? (await preparePdf(id));
		if (!file) { reportError = 'The PDF for this report is missing on this device.'; return; }
		if (!navigator.canShare?.({ files: [file] })) { reportError = 'This device cannot share files from the app. Open the PDF and save or send it from there.'; return; }
		try {
			await navigator.share({ files: [file], title: `Performance report ${id}` });
			await app.setDelivery(id, 'shared');
		} catch (error) {
			if ((error as Error).name !== 'AbortError') reportError = `Sharing failed: ${(error as Error).message}. Try again.`;
		}
	}

	async function openReport(id: string) {
		reportError = '';
		const file = await preparePdf(id);
		if (!file) { reportError = 'The PDF for this report is missing on this device.'; return; }
		const url = URL.createObjectURL(file);
		if (!window.open(url, '_blank')) location.href = url;
	}

	function removeReport(id: string) {
		app.deleteReport(id);
		pdfCache.delete(id);
	}

	async function updateApp() {
		appUpdating = true;
		await app.save();
		const registration = await navigator.serviceWorker.getRegistration();
		registration?.waiting?.postMessage('activate-update');
	}

	let dataLine = $derived(`Data Release ${app.data?.index.release ?? '–'} from ${app.data?.index.operator ?? '–'}${app.lastCheck ? `, checked ${utcText(app.lastCheck).slice(0, 10)}` : ''}`);
	let aircraftLine = $derived(aircraft ? `${aircraft.registration}, ${aircraft.type}, revision ${aircraft.revision} · ${dataLine}. App version ${version}.` : '');
	let leftPerStep = $derived(STEP_NAMES.map((_, i) => todo.filter((t) => t.step === i).length));
	let overPerStep = $derived(STEP_NAMES.map((_, i) => exceededLimits.filter((l) => stepOfLimit(l.id) === i).length));

	function startWith(registration: string) {
		const a = app.aircraft.find((x) => x.registration === registration)!;
		app.addTab(newCalculation(a, makeId(), Date.now()));
		choosing = false;
		closePad();
	}
	function selectTab(i: number) { app.current = i; choosing = false; showReports = false; confirmDelete = false; closePad(); }
	function addNextFlight() {
		app.addTab(nextFlight(aircraft!, calc!, results!, makeId(), Date.now()));
		closePad();
	}
	let checkedNow = $state(false);
	async function checkNow() { checkedNow = false; await app.check(true); checkedNow = true; }
	function closeTab(i: number) {
		app.closeTab(i);
		if (!app.tabs.length) choosing = true;
		confirmDelete = false;
		closePad();
	}
	function deleteTab() {
		if (!confirmDelete) { confirmDelete = true; return; }
		app.closeTab(app.current);
		confirmDelete = false;
		closePad();
	}
	function goStep(step: number) { calc!.step = step; closePad(); scrollTo(0, 0); }

	function openPad(key: string) {
		if (padKey === key) return;
		padKey = key;
		padFresh = true;
		tick().then(() => document.getElementById(`w-${key}`)?.scrollIntoView({ block: 'center' }));
	}
	function closePad() { padKey = null; }
	function press(key: string) {
		const f = padField;
		if (!f) return;
		if (key === 'next') {
			const list = fields[calc!.step], i = list.findIndex((x) => x.key === f.key);
			if (i >= 0 && i < list.length - 1) openPad(list[i + 1].key); else closePad();
			return;
		}
		setByPilot(calc!, f.key, applyKey(f, calc!.values[f.key] ?? '', padFresh, key));
		padFresh = false;
	}
	function quick(f: Field, op: string) { setByPilot(calc!, f.key, applyQuick(f, calc!.values[f.key], op)); }
	async function goTo(key: string, step: number) {
		calc!.step = step;
		closePad();
		await tick();
		if (fields[step].some((f) => f.key === key)) { openPad(key); return; }
		const el = document.getElementById(`f-${key}`) ?? document.getElementById(`w-${key}`);
		el?.scrollIntoView({ block: 'center' });
		el?.focus();
	}
	function goToFirstProblem() {
		if (exceededLimits.length) { goStep(stepOfLimit(exceededLimits[0].id)); return; }
		if (todo.length) goTo(todo[0].key, todo[0].step);
	}
	const goToItem = (item: ToDo) => goTo(item.key, item.step);
	function nextFieldLabel(key: string) {
		const list = fields[calc!.step], i = list.findIndex((x) => x.key === key);
		return list[i + 1]?.label;
	}
	function hardwareKey(e: KeyboardEvent) {
		if (!padKey) return;
		const map: Record<string, string> = { Backspace: 'back', Enter: 'next', Tab: 'next', ',': '.', '.': '.', '-': 'neg' };
		if (/^[0-9]$/.test(e.key)) press(e.key);
		else if (map[e.key]) press(map[e.key]);
		else if (e.key === 'Escape') closePad();
		else return;
		e.preventDefault();
	}
</script>

<svelte:head><title>Aero Open Performance</title></svelte:head>
<svelte:window onkeydown={hardwareKey} />

{#snippet numberField(field: Field, extra?: Snippet)}
	<NumberField
		{field}
		calc={calc!}
		{extra}
		active={padKey === field.key}
		onopen={() => openPad(field.key)}
		onquick={(op) => quick(field, op)}
		onconfirm={() => confirmValue(calc!, field.key)}
		onunit={(u) => (calc!.elevationUnit = u as 'm' | 'ft')}
	/>
{/snippet}

<Tabs.Root value={calc?.id ?? ''} onValueChange={(id) => selectTab(app.tabs.findIndex((t) => t.id === id))} class="flex min-h-dvh flex-col">
	<AppHeader
		tabs={app.tabs}
		{labels}
		current={app.current}
		inCalculation={!!calc && !showReports && !choosing}
		canNextFlight={!!aircraft && !!results}
		reportCount={app.reports.length}
		reportsOpen={showReports}
		checking={app.checking || app.installing}
		{isDemo}
		{version}
		{dataLine}
		onclosetab={closeTab}
		onnextflight={addNextFlight}
		onnew={() => { choosing = true; showReports = false; closePad(); }}
		onreports={() => { showReports = !showReports; reportError = ''; closePad(); }}
		oncheck={checkNow}
	/>

	<main class="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-4 px-4 pt-5 pb-[calc(32px+env(safe-area-inset-bottom,0px))] sm:px-5">
		{#if appUpdateReady}
			<div class="banner sent flex flex-wrap items-center justify-between gap-2" role="status"><span>A new version of the app is ready.</span><Button onclick={updateApp}>Restart to update</Button></div>
		{/if}
		{#if app.pending}
			<div class="banner sent flex flex-col items-start gap-2" role="status">
				<p>New data available: Release {app.pending.release}.{app.pending.notes ? ` ${app.pending.notes}` : ''}</p>
				{#if changes.length}<ul class="m-0 list-disc pl-5 font-medium">{#each changes as change (change.registration)}<li>{change.registration}: {change.text}</li>{/each}</ul>{/if}
				<Button variant="primary" disabled={app.installing} onclick={() => app.install()}>{app.installing ? 'Installing' : 'Install'}</Button>
			</div>
		{/if}
		{#if app.updateError && app.data}<div class="banner unk" role="status">{app.updateError}</div>{/if}
		{#if dataIsStale}<div class="banner notsent" role="alert">No check for new aircraft data in over {STALE_DAYS} days. Connect to the internet soon. The data may be out of date.</div>{/if}
		{#if app.saveFailed}<div class="notice">This device isn't saving your calculations. They will be lost if you close the app.</div>{/if}

		{#if app.loaded && !app.data}
			<div class="mx-auto flex w-full max-w-[760px] flex-col gap-4">
				<h1 class="text-[26px] font-bold">Aero Open Performance</h1>
				<section class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
					<h2 class="text-[17px] font-semibold">Aircraft data needed</h2>
					<p>{app.dataProblem ?? 'Connect to the internet once to download aircraft data. After that, the app works offline.'}</p>
					{#if app.updateError}<p class="muted">{app.updateError}</p>{/if}
					<div><Button variant="primary" size="lg" disabled={app.checking || app.installing} onclick={() => app.check(true)}>{app.checking || app.installing ? 'Downloading' : 'Try again'}</Button></div>
				</section>
			</div>
		{:else if app.loaded && showReports}
			<ReportsView reports={app.reports} error={reportError} onshare={shareReport} onopen={openReport} ondelete={removeReport} onback={() => { showReports = false; reportError = ''; }} />
		{:else if app.loaded && (choosing || !app.tabs.length)}
			<ChooseAircraft
				aircraft={available}
				canCancel={app.tabs.length > 0}
				dataLine={`Aircraft data: Release ${app.data?.index.release} from ${app.data?.index.operator}.${app.lastCheck ? ` Last checked ${new Date(app.lastCheck).toLocaleString()}.` : ''}`}
				checking={app.checking}
				busy={app.checking || app.installing}
				latest={!app.pending && checkedNow && !app.checking && !app.updateError}
				{version}
				onchoose={startWith}
				oncancel={() => (choosing = false)}
				oncheck={checkNow}
			/>
		{:else if calc}
			<Tabs.Content value={calc.id} class="flex flex-col gap-4">
				{#if calc.notice}
					<div class="banner unk flex flex-wrap items-center justify-between gap-2" role="status"><span>{calc.notice}</span><Button onclick={() => (calc!.notice = null)}>OK</Button></div>
				{/if}
				{#if !aircraft || !results}
					<section class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
						<div class="banner notsent" role="alert">{calc.aircraft} can't be used. {blockedReason ?? 'Its data could not be read.'}</div>
						<p>Calculations for this aircraft are blocked. Reports you already created aren't affected.</p>
						<div><Button variant={confirmDelete ? 'danger' : 'danger-quiet'} onclick={deleteTab}>{confirmDelete ? 'Tap again to delete this tab' : 'Delete this tab'}</Button></div>
					</section>
				{:else}
					<SummaryStrip {aircraft} {results} todoCount={todo.length} exceededCount={exceededLimits.length} onproblem={goToFirstProblem} ondone={() => goStep(3)} />

					<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
						<div class="flex min-w-0 flex-col gap-4">
							<StepNav step={calc.step} left={leftPerStep} over={overPerStep} ongo={goStep} />

							{#if calc.step === 0}
								<LoadStep {aircraft} {calc} {results} fields={fields[0]} {numberField} />
							{:else if calc.step === 1}
								<FuelStep {aircraft} {calc} {results} fields={fields[1]} {numberField} />
							{:else if calc.step === 2}
								{#key calc.id}<ConditionsStep {calc} {results} {perf} fields={fields[2]} {numberField} {closePad} />{/key}
							{:else}
								<SendStep
									{aircraft} {calc} {todo} exceeded={exceededLimits} {ready} {creating} {reportError} {latestReport} {reportIsCurrent}
									{closePad} ongo={goToItem} onstep={goStep} oncreate={createReport} onshare={shareReport} onopen={openReport}
								/>
							{/if}

							{#if padField}
								<Keypad field={padField} value={calc.values[padField.key] ?? ''} last={fields[calc.step].at(-1)?.key === padField.key} nextLabel={nextFieldLabel(padField.key)} onkey={press} onclose={closePad} />
							{/if}

							<div class="flex flex-wrap justify-between gap-3">
								{#if calc.step > 0}<Button size="lg" onclick={() => goStep(calc!.step - 1)}>Back</Button>{:else}<span></span>{/if}
								{#if calc.step < 3}
									<Button variant="primary" size="lg" onclick={() => goStep(calc!.step + 1)}>Next: {STEP_NAMES[calc.step + 1]}<Icon name="chevron-right" stroke={2.5} /></Button>
								{:else}
									<Button variant={confirmDelete ? 'danger' : 'danger-quiet'} size="lg" onclick={deleteTab}>{confirmDelete ? 'Tap again to delete this tab' : 'Delete this tab'}</Button>
								{/if}
							</div>

						</div>

						<ResultsAside {aircraft} {results} {calc} {todo} exceeded={exceededLimits} dataLine={aircraftLine} onproblem={goToFirstProblem} />
					</div>
				{/if}
			</Tabs.Content>
		{/if}
	</main>
</Tabs.Root>
