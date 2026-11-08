<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Checkbox, Collapsible, Tabs } from 'bits-ui';
	import { resolve } from '$app/paths';
	import { version } from '$app/env';
	import Keypad from '#lib/components/Keypad.svelte';
	import NumberField from '#lib/components/NumberField.svelte';
	import { findAirfields, loadAirfields, type Airfield } from '#lib/airfield/airfields.ts';
	import Segmented from '#lib/components/Segmented.svelte';
	import CgChart from '#lib/components/CgChart.svelte';
	import DistanceResult from '#lib/components/DistanceResult.svelte';
	import { altitudeText, armText, distanceText, limitBadge, massBalanceRows, massText, statusWord, windText, workingRows } from '#lib/app/presentation.ts';
	import { AppState } from '#lib/app/app-state.svelte.ts';
	import { describeChanges, isStale, STALE_DAYS } from '#lib/data/release.ts';
	import {
		STEP_NAMES, OLD_CALCULATION_DAYS, applyAirfield, applyRunway, conditionCorrections, OLD_REPORT_MINUTES, WEATHER_KEYS, applyKey, applyQuick, applyWeather, canReport, changeConfiguration, confirmValue, confirmWeather, fieldsFor, isOldCalculation, isVariableWind, newCalculation, nextFlight,
		performanceOf, reportAgeMinutes, setByPilot, stepOfLimit, tabLabels, toDoList, toInput, type Calculation as Calc, type Field
	} from '#lib/app/calculation.ts';
	import { calculate } from '#lib/engine/index.ts';
	import { limitText } from '#lib/engine/mass-balance.ts';
	import { chartSvg } from '#lib/report/chart.ts';
	import { renderPdf } from '#lib/report/pdf.ts';
	import { RETENTION_DAYS, createReportData, deliveryLabel, fingerprint, newReportId, reportDocument, type StoredReport } from '#lib/report/report.ts';
	import { version as toolVersion } from '../../package.json';

	const app = new AppState();
	let choosing = $state(false);
	let padKey = $state<string | null>(null);
	let padFresh = $state(true);
	let confirmDelete = $state(false);
	let appUpdateReady = $state(false);
	let appUpdating = false;
	let showReports = $state(false);
	let weatherBusy = $state(false);
	let airfieldQuery = $state('');
	let airfieldMatches = $state<Airfield[]>([]);
	let airfieldMessage = $state('');
	let airfieldDate = $state('');
	let airfieldFound = $state<Airfield | null>(null);
	async function findAirfield() {
		airfieldMessage = ''; airfieldMatches = [];
		try {
			const data = await loadAirfields();
			airfieldDate = data.date;
			const found = findAirfields(data, airfieldQuery);
			if (found.length === 1) chooseAirfield(found[0]);
			else if (found.length) airfieldMatches = found;
			else airfieldMessage = 'Not in the airfield list. Enter the elevation and runway by hand.';
		} catch (e) { airfieldMessage = `${(e as Error).message} Enter the elevation and runway by hand.`; }
	}
	function chooseAirfield(a: Airfield) {
		airfieldFound = a; airfieldMatches = []; airfieldQuery = a.ident;
		applyAirfield(calc!, a, airfieldDate);
	}
	let weatherMessage = $state('');
	let now = $state(Date.now());
	let creating = $state(false);
	let reportError = $state('');
	let deleteReportId = $state<string | null>(null);
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
	let metarAge = $derived(calc ? reportAgeMinutes(calc.weather, now) : null);
	let weatherToConfirm = $derived(calc ? WEATHER_KEYS.filter((k) => calc!.status[k] === 'pre').length : 0);
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

	const WEATHER_ERRORS: Record<string, string> = {
		notConfigured: 'Weather isn\'t set up for this app. Enter the values from ATIS or the aircraft.',
		unavailable: 'Weather is unavailable right now. Enter the values from ATIS or the aircraft.',
		noStation: 'No report found. Try another station code, or enter the values from ATIS or the aircraft.',
		badRequest: 'Enter a four-character station code, such as LSZH.',
		forbidden: 'Weather is unavailable right now. Enter the values from ATIS or the aircraft.'
	};

	async function loadWeather(params: string) {
		if (!calc || weatherBusy) return;
		const target = calc;
		weatherBusy = true;
		weatherMessage = '';
		closePad();
		try {
			if (!navigator.onLine) throw new Error('offline');
			const response = await fetch(`/api/metar?${params}`, { signal: AbortSignal.timeout(12000) });
			const body = await response.json();
			if (!response.ok) { weatherMessage = WEATHER_ERRORS[body.error] ?? WEATHER_ERRORS.unavailable; return; }
			now = Date.now();
			applyWeather(target, body, now);
		} catch {
			weatherMessage = navigator.onLine ? WEATHER_ERRORS.unavailable : 'No connection. Enter the values from ATIS or the aircraft.';
		} finally {
			weatherBusy = false;
		}
	}
	function getStationWeather() {
		loadWeather(`station=${encodeURIComponent(calc?.values.station ?? '')}`);
	}
	function getNearestWeather() {
		weatherMessage = '';
		if (!navigator.geolocation) { weatherMessage = 'This device can\'t share its location. Enter a station code instead.'; return; }
		weatherBusy = true;
		navigator.geolocation.getCurrentPosition(
			(p) => { weatherBusy = false; loadWeather(`lat=${p.coords.latitude}&lon=${p.coords.longitude}`); },
			() => { weatherBusy = false; weatherMessage = 'Location isn\'t available. Enter a station code instead.'; },
			{ timeout: 10000, maximumAge: 300000 }
		);
	}

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
			if (!(await app.dataStillValid())) throw new Error('the aircraft data on this device failed its check');
			const now = Date.now();
			const id = newReportId(now, crypto.getRandomValues(new Uint8Array(4)));
			const data = createReportData(aircraft, $state.snapshot(calc), results, {
				id, now, preRelease: true, toolVersion: `${toolVersion}, build ${version}`,
				dataRelease: `Data Release ${app.data!.index.release} (${app.data!.index.operator})`,
				lastDataCheck: app.lastCheck ? `${new Date(app.lastCheck).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'unknown',
				chartSvg: chartSvg(aircraft, results, calc.configuration)
			});
			const pdf = await renderPdf(reportDocument(data));
			const date = new Date(now).toISOString().slice(0, 16).replace('T', ' ');
			const report: StoredReport = { id, calculationId: calc.id, created: now, label: `${aircraft.registration} ${data.departure}, ${date} UTC`, delivery: 'notSent', fingerprint: fingerprint(aircraft, calc), data };
			await app.addReport(report, pdf);
			await preparePdf(id);
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
		if (deleteReportId !== id) { deleteReportId = id; return; }
		app.deleteReport(id);
		pdfCache.delete(id);
		deleteReportId = null;
	}

	async function updateApp() {
		appUpdating = true;
		await app.save();
		const registration = await navigator.serviceWorker.getRegistration();
		registration?.waiting?.postMessage('activate-update');
	}

	let altitude = $derived(results ? altitudeText(results) : null);
	let wind = $derived(results && calc ? windText(results.wind, isVariableWind(calc)) : null);
	let mbRows = $derived(aircraft && results ? massBalanceRows(aircraft, results) : null);

	function startWith(registration: string) {
		const a = app.aircraft.find((x) => x.registration === registration)!;
		app.tabs.push(newCalculation(a, makeId(), Date.now()));
		app.current = app.tabs.length - 1;
		choosing = false;
		closePad();
	}
	function selectTab(i: number) { app.current = i; choosing = false; confirmDelete = false; closePad(); }
	function addNextFlight() {
		app.tabs.push(nextFlight(aircraft!, calc!, results!, makeId(), Date.now()));
		app.current = app.tabs.length - 1;
		closePad();
	}
	let checkedNow = $state(false);
	async function checkNow() { checkedNow = false; await app.check(true); checkedNow = true; }
	function closeTab(i: number) {
		app.tabs.splice(i, 1);
		if (app.current >= i) app.current = Math.max(0, app.current - 1);
		if (!app.tabs.length) choosing = true;
		confirmDelete = false;
		closePad();
	}
	function deleteTab() {
		if (!confirmDelete) { confirmDelete = true; return; }
		app.tabs.splice(app.current, 1);
		app.current = Math.max(0, app.current - 1);
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

<main class="flow" class:keypad={!!padField}>
	<div class="notice">Pre-release, not for flight.{isDemo ? ' These are fictional demo aircraft with invented data.' : ''}</div>
	{#if appUpdateReady}
		<div class="banner sent update" role="status"><span>A new version of the app is ready.</span><button type="button" onclick={updateApp}>Restart to update</button></div>
	{/if}
	{#if app.pending}
		<div class="banner sent" role="status">
			<p>New data available: Release {app.pending.release}.{app.pending.notes ? ` ${app.pending.notes}` : ''}</p>
			{#if changes.length}<ul class="m-0 list-disc pl-5 font-medium">{#each changes as change (change.registration)}<li>{change.registration}: {change.text}</li>{/each}</ul>{/if}
			<button type="button" class="primary mt-2" disabled={app.installing} onclick={() => app.install()}>{app.installing ? 'Installing' : 'Install'}</button>
		</div>
	{/if}
	{#if app.updateError && app.data}<div class="banner unk" role="status">{app.updateError}</div>{/if}
	{#if dataIsStale}<div class="banner notsent" role="alert">No check for new aircraft data in over {STALE_DAYS} days. Connect to the internet soon. The data may be out of date.</div>{/if}
	{#if app.saveFailed}<div class="notice">This device isn't saving your calculations. They will be lost if you close the app.</div>{/if}

	{#if app.loaded && !app.data}
		<h1>Aero Open Performance</h1>
		<section>
			<h2>Aircraft data needed</h2>
			<p>{app.dataProblem ?? 'Connect to the internet once to download aircraft data. After that, the app works offline.'}</p>
			{#if app.updateError}<p class="muted">{app.updateError}</p>{/if}
			<button type="button" class="primary" disabled={app.checking || app.installing} onclick={() => app.check(true)}>{app.checking || app.installing ? 'Downloading' : 'Try again'}</button>
		</section>
	{:else if app.loaded && showReports}
		<h1>Reports</h1>
		<section>
			<p class="muted">Reports stay only on this device, for {RETENTION_DAYS} days. Reports not yet sent stay until you send or delete them. Clearing browser data or losing this device loses them.</p>
			{#if reportError}<div class="banner notsent" role="alert">{reportError}</div>{/if}
			{#if !app.reports.length}<p>No reports yet. Reports appear here once you create them on the Send step.</p>{/if}
			{#each app.reports as report (report.id)}
				<div class="report-row">
					<div><strong>{report.label}</strong><br /><span class="muted">{report.id}</span><br /><span class="delivery {report.delivery}">{deliveryLabel(report.delivery)}</span></div>
					<div class="report-actions">
						<button type="button" onclick={() => shareReport(report.id)}>Share PDF</button>
						<button type="button" onclick={() => openReport(report.id)}>Open PDF</button>
						<button type="button" class:danger={deleteReportId === report.id} onclick={() => removeReport(report.id)}>{deleteReportId === report.id ? 'Tap again to delete' : 'Delete'}</button>
					</div>
				</div>
			{/each}
			<button type="button" onclick={() => { showReports = false; deleteReportId = null; reportError = ''; }}>Back</button>
		</section>
	{:else if app.loaded && (choosing || !app.tabs.length)}
		<h1>Aero Open Performance</h1>
		<section>
			<h2>Choose an aircraft</h2>
			{#each available as a (a.registration)}
				<button type="button" class="choose" onclick={() => startWith(a.registration)}><strong>{a.registration}</strong> {a.type}</button>
			{/each}
			{#if app.tabs.length}<button type="button" onclick={() => (choosing = false)}>Cancel</button>{/if}
		</section>
		<section>
			<p class="m-0">Aircraft data: Release {app.data?.index.release} from {app.data?.index.operator}.{app.lastCheck ? ` Last checked ${new Date(app.lastCheck).toLocaleString()}.` : ''}</p>
			{#if !app.pending && checkedNow && !app.checking && !app.updateError}<p class="m-0 font-semibold text-good" role="status">This is the latest data.</p>{/if}
			<button type="button" disabled={app.checking || app.installing} onclick={checkNow}>{app.checking ? 'Checking' : 'Check for new data'}</button>
		</section>
		<p class="muted">Version {version}. <a href={resolve('/device-test')}>Device test</a>. <a href={resolve('/admin')}>Admin</a></p>
	{:else if calc}
		<Tabs.Root value={calc.id} onValueChange={(id) => selectTab(app.tabs.findIndex((t) => t.id === id))} class="grid gap-3">
		<div class="flex gap-1.5 overflow-x-auto">
			<Tabs.List aria-label="Calculations" class="flex flex-none gap-1.5">
				{#each app.tabs as tab, i (tab.id)}
					<div class="flex flex-none">
						<Tabs.Trigger value={tab.id} class="min-h-[52px] max-w-[260px] flex-none truncate rounded-l-[5px] border border-r-0 border-line bg-panel pl-3.5 pr-2 font-semibold text-ink data-[state=active]:border-ink data-[state=active]:bg-ink data-[state=active]:text-bg">{labels[i]}</Tabs.Trigger>
						<button type="button" class="tab-close" class:active={i === app.current} aria-label={`Close ${labels[i]}`} onclick={() => closeTab(i)}>×</button>
					</div>
				{/each}
			</Tabs.List>
			<button type="button" class="flex-none" disabled={!aircraft} onclick={addNextFlight}>+ Next flight</button>
			<button type="button" class="flex-none" onclick={() => { choosing = true; closePad(); }}>+ New</button>
			<button type="button" class="flex-none" onclick={() => { showReports = true; closePad(); }}>Reports ({app.reports.length})</button>
		</div>
		<Tabs.Content value={calc.id} class="grid gap-3">
		{#if calc.notice}
			<div class="banner unk update" role="status"><span>{calc.notice}</span><button type="button" onclick={() => (calc!.notice = null)}>OK</button></div>
		{/if}
		{#if !aircraft || !results}
			<section>
				<div class="banner notsent" role="alert">{calc.aircraft} can't be used. {blockedReason ?? 'Its data could not be read.'}</div>
				<p>Calculations for this aircraft are blocked. Reports you already created aren't affected.</p>
				<button type="button" class:danger={confirmDelete} onclick={deleteTab}>{confirmDelete ? 'Tap again to delete this tab' : 'Delete this tab'}</button>
			</section>
		{:else}

		<div class="strip">
			{#each [['Takeoff', results.takeoff], ['Landing', results.landing]] as const as [title, r] (title)}
				<div class="s dist">
					<small>{title}{r.conditionLabel ? ` · ${r.conditionLabel}` : ''}</small>
					{#if r.status === 'ok'}
						<div class="pair">
							{#if r.groundRoll != null}<span><b>{r.groundRoll} {r.unit}</b><small>Ground roll</small></span>{/if}
							{#if r.total != null}<span><b>{r.total} {r.unit}</b><small>{title === 'Takeoff' ? 'To 50 ft' : 'From 50 ft'}</small></span>{/if}
						</div>
					{:else}<b class="none">{statusWord(r.status)}</b>{/if}
				</div>
			{/each}
			<div class="s"><b>{results.atmosphere?.densityAltitudeFt != null ? `${Math.round(results.atmosphere.densityAltitudeFt).toLocaleString('en')} ft` : '–'}</b><small>Density altitude{results.atmosphere ? `, PA ${Math.round(results.atmosphere.pressureAltitudeFt).toLocaleString('en')} ft` : ''}</small></div>
			<div class="s"><b class:bad={results.exceeded.includes('takeoffMass') || results.exceeded.includes('takeoffCg')}>{massText(aircraft, results.massBalance.takeoff.mass)}</b><small>Takeoff, CG {armText(aircraft, results.massBalance.takeoff.arm)}</small></div>
			<div class="s"><b class:bad={results.exceeded.includes('landingMass') || results.exceeded.includes('landingCg')}>{massText(aircraft, results.massBalance.landing.mass)}</b><small>Landing, CG {armText(aircraft, results.massBalance.landing.arm)}</small></div>
			{#if exceededLimits.length}
				<button type="button" class="status bad" onclick={goToFirstProblem}>{exceededLimits.length} limit{exceededLimits.length > 1 ? 's' : ''} over</button>
			{:else if todo.length}
				<button type="button" class="status todo" onclick={goToFirstProblem}>{todo.length} to do</button>
			{:else}
				<button type="button" class="status ok" onclick={() => goStep(3)}>All checked</button>
			{/if}
		</div>

		<div class="steps">
			{#each STEP_NAMES as name, i (name)}
				{@const left = todo.filter((t) => t.step === i).length}
				<button type="button" class:on={i === calc.step} aria-current={i === calc.step ? 'step' : undefined} onclick={() => goStep(i)}>
					{i + 1}. {name}
					{#if left}<small class="left">{left} to do</small>{:else}<small class="done">Done</small>{/if}
				</button>
			{/each}
		</div>

		<div class="columns">
			<div class="col">
				<section>
					{#if calc.step === 0}
						<h2>Who and what is on board</h2>
						{#if aircraft.configurations.length > 1}
							<Segmented label="Configuration" options={aircraft.configurations.map((c) => ({ id: c.id, label: c.label }))} value={calc.configuration} onchange={(id) => changeConfiguration(aircraft!, calc!, id)} />
						{/if}
					{:else if calc.step === 1}
						<h2>Fuel and flight</h2>
					{:else if calc.step === 2}
						<h2>Weather and runway</h2>
						<div class="fields">
							<div class="fld"><label for="f-airfield">Departure airfield</label><div class="inp"><input class="text" id="f-airfield" type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="ICAO code or name" bind:value={airfieldQuery} onfocus={closePad} onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); findAirfield(); } }} /></div></div>
							<div class="fld"><span class="fld-label">Fill in from the airfield list</span><div class="quick"><button type="button" disabled={airfieldQuery.trim().length < 2} onclick={findAirfield}>Find</button></div></div>
						</div>
						{#if airfieldMessage}<div class="banner unk" role="status">{airfieldMessage}</div>{/if}
						{#if airfieldMatches.length}<div class="quick">{#each airfieldMatches as a (a.ident)}<button type="button" onclick={() => chooseAirfield(a)}>{a.ident} {a.name}</button>{/each}</div>{/if}
						{#if airfieldFound && calc.airfield?.ident === airfieldFound.ident}
							<div class="metar">
								<p class="m-0"><strong>{airfieldFound.ident} {airfieldFound.name}</strong>{airfieldFound.elevationFt !== null ? `, ${airfieldFound.elevationFt} ft` : ''}. Choose the runway:</p>
								<div class="quick">{#each airfieldFound.runways as end (end.designator)}<button type="button" class:on={calc.airfield?.runway?.designator === end.designator} onclick={() => applyRunway(calc!, end)}>{end.designator} · {end.surfaceKind === 'unknown' ? end.surface || 'surface unknown' : end.surfaceKind}{end.lengthM ? ` · ${end.lengthM} m` : ''}</button>{/each}</div>
								<p class="muted m-0">From OurAirports, a community database, as of {airfieldDate}. Check every value against the AIP or the airfield's own information.</p>
							</div>
						{/if}
						{#if isOldCalculation(calc, now)}<div class="banner unk" role="status">This calculation is more than {OLD_CALCULATION_DAYS} days old. Get fresh weather.</div>{/if}
						<div class="fields">
							<div class="fld"><label for="f-station">Weather station</label><div class="inp"><input class="text" id="f-station" type="text" enterkeyhint="search" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" maxlength="4" placeholder="e.g. LSZH" bind:value={calc.values.station} onfocus={closePad} onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); getStationWeather(); } }} /></div></div>
							<div class="fld"><span class="fld-label">Get weather</span><div class="quick"><button type="button" disabled={weatherBusy} onclick={getStationWeather}>{weatherBusy ? 'Loading' : 'Get METAR'}</button><button type="button" disabled={weatherBusy} onclick={getNearestWeather}>Nearest</button></div></div>
						</div>
						{#if weatherMessage}<div class="banner unk" role="status">{weatherMessage}</div>{/if}
						{#if calc.weather}
							<div class="metar">
								<div class="raw">{calc.weather.raw}</div>
								<p class="muted">{calc.weather.stationName ?? calc.weather.station}{calc.weather.distanceKm !== null ? `, ${calc.weather.distanceKm.toFixed(1)} km away` : ''}{metarAge !== null ? `. Report is ${metarAge} minutes old.` : ''}</p>
								{#if metarAge !== null && metarAge > OLD_REPORT_MINUTES}<div class="banner notsent" role="alert">This report is {metarAge} minutes old. Check it is still valid, or enter current values.</div>{/if}
								{#each calc.weather.flags as flag (flag)}<p class="flag">{flag}</p>{/each}
								{#if weatherToConfirm}<button type="button" class="confirm wide" onclick={() => confirmWeather(calc!)}>I checked these: confirm {weatherToConfirm} weather value{weatherToConfirm > 1 ? 's' : ''}</button>{/if}
							</div>
						{/if}
					{/if}

					{#if calc.step < 3}
						<div class="fields">
							{#each fields[calc.step] as field (field.key)}
								<NumberField {field} {calc} active={padKey === field.key} onopen={() => openPad(field.key)} onquick={(op) => quick(field, op)} onconfirm={() => confirmValue(calc!, field.key)} onunit={(u) => (calc!.elevationUnit = u as 'm' | 'ft')} />
							{/each}
						</div>
					{/if}

					{#if calc.step === 0}
						{#each aircraft.stations.filter((s) => s.positions) as station (station.id)}
							<Segmented label={`${station.label} seat stop`} options={station.positions!.map((p) => ({ id: p.id, label: p.label }))} value={calc.positions[station.id]} onchange={(id) => (calc!.positions[station.id] = id)} />
						{/each}
					{:else if calc.step === 1}
						{#if aircraft.burnPlans.length > 1}
							<Segmented label="Burn plan" options={aircraft.burnPlans.map((p) => ({ id: p.id, label: p.label }))} value={calc.burnPlan} onchange={(id) => (calc!.burnPlan = id)} />
						{/if}
					{:else if calc.step === 2}
						{#if perf}
							{#if calc.airfield?.runway}<p class="m-0 font-semibold">Runway {calc.airfield.runway.designator} surface in the airfield list: {calc.airfield.runway.surface || 'unknown'}. Choose the matching condition.</p>{/if}
							{#each [['takeoff', 'Takeoff condition', perf.takeoff, calc.takeoffCondition], ['landing', 'Landing condition', perf.landing, calc.landingCondition]] as const as [phase, label, list, chosen] (phase)}
								<Segmented {label} options={list.map((c) => ({ id: c.id, label: c.label }))} value={chosen} onchange={(id) => { if (phase === 'takeoff') calc!.takeoffCondition = id; else calc!.landingCondition = id; }} />
								{@const corrections = conditionCorrections(list.find((c) => c.id === chosen))}
								<p class="muted m-0">{corrections.length ? `Corrections: ${corrections.join('; ')}.` : 'No correction beyond the table and wind.'}</p>
							{/each}
						{/if}
					{:else}
						<h2>Check and confirm</h2>
						<div class="fields">
							<div class="fld"><label for="f-place">Departure airfield</label><div class="inp"><input class="text" id="f-place" type="text" enterkeyhint="done" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="Identifier or name" bind:value={calc.values.place} onfocus={closePad} /></div></div>
							<div class="fld"><label for="f-name">Pilot name</label><div class="inp"><input class="text" id="f-name" type="text" enterkeyhint="done" autocapitalize="words" autocorrect="off" spellcheck="false" autocomplete="name" placeholder="First and last name" bind:value={calc.values.name} onfocus={closePad} /></div></div>
						</div>
						{#if aircraft.notes.length}
							<div class="list"><h2>Manual notes to confirm</h2>
								{#each aircraft.notes as note (note.id)}
									<label class="flex min-h-[52px] cursor-pointer items-center gap-2.5" id={`w-note:${note.id}`}>
										<Checkbox.Root checked={calc.notes[note.id] === true} onCheckedChange={(checked) => (calc!.notes[note.id] = checked)} aria-label={note.text} class="flex size-7 flex-none items-center justify-center rounded-[5px] border-2 border-line bg-panel text-accent-ink data-[state=checked]:border-accent data-[state=checked]:bg-accent">
											{#snippet children({ checked })}{#if checked}<span aria-hidden="true" class="font-bold">✓</span>{/if}{/snippet}
										</Checkbox.Root>
										<span>{note.text}</span>
									</label>
								{/each}
							</div>
						{/if}
						{#if todo.length}
							<div class="list"><h2>Still to do, tap to go there</h2>
								{#each todo as item (item.key)}<button type="button" class="link" onclick={() => goTo(item.key, item.step)}><i class="warnb">TO DO</i> {item.label}</button>{/each}
							</div>
						{/if}
						{#if exceededLimits.length}
							<div class="list"><h2>Exceeded limits, tap to go there</h2>
								{#each exceededLimits as limit (limit.id)}<button type="button" class="link" onclick={() => goStep(stepOfLimit(limit.id))}><i class="fail">OVER</i> {limit.label}</button>{/each}
							</div>
						{/if}
						{#if reportError}<div class="banner notsent" role="alert">{reportError}</div>{/if}
						{#if latestReport && reportIsCurrent}
							<div class="banner {latestReport.delivery === 'shared' ? 'unk' : 'notsent'}" role="status">{deliveryLabel(latestReport.delivery)}. Report {latestReport.id}.</div>
							<button type="button" class="primary" onclick={() => shareReport(latestReport!.id)}>Share PDF</button>
							<button type="button" onclick={() => openReport(latestReport!.id)}>Open PDF</button>
						{:else}
							{#if latestReport}<div class="banner unk" role="status">The inputs changed after report {latestReport.id}. That report stays as it was. Create a new one for the current values.</div>{/if}
							{#if !ready}<p class="muted">A report needs every item done and no exceeded limit.</p>{/if}
							<button type="button" class="primary" disabled={!ready || creating} onclick={createReport}>{creating ? 'Creating report' : 'Create report'}</button>
						{/if}
						<div class="actions">
							<button type="button" class:danger={confirmDelete} onclick={deleteTab}>{confirmDelete ? 'Tap again to delete this tab' : 'Delete this tab'}</button>
						</div>
					{/if}
				</section>
				<div class="nav">
					<button type="button" disabled={calc.step === 0} onclick={() => goStep(calc!.step - 1)}>Back</button>
					{#if calc.step < 3}<button type="button" class="primary" onclick={() => goStep(calc!.step + 1)}>Next: {STEP_NAMES[calc.step + 1]}</button>{/if}
				</div>
			</div>

			<div class="col">
				<section>
					<div class="big">
						<DistanceResult text={distanceText('Takeoff', results.takeoff, massText(aircraft, results.massBalance.takeoff.mass))} />
						<DistanceResult text={distanceText('Landing', results.landing, massText(aircraft, results.massBalance.landing.mass))} />
						<div class="num"><h2>Altitude</h2>
							{#if altitude}<b>{altitude.pressure}</b><small>Pressure altitude. Density altitude {altitude.density}</small>{:else}<b class="none">Enter elevation and QNH</b>{/if}
						</div>
						<div class="num"><h2>Wind</h2>
							{#if wind}<b>{wind.headline}</b><small>{wind.detail}</small>{:else}<b class="none">Enter wind and runway</b>{/if}
						</div>
					</div>
				</section>
				<section>
					<h2>Limits</h2>
					<div class="list">
						{#each results.massBalance.limits as limit (limit.id)}
							<div class="check">
								<i class={limitBadge(limit.status).tone}>{limitBadge(limit.status).text}</i>
								<span><strong>{limit.label}</strong> {limitText(aircraft, limit)}</span>
							</div>
						{/each}
					</div>
					<CgChart {aircraft} {results} configuration={calc.configuration} />
					<Collapsible.Root>
						<Collapsible.Trigger class="min-h-11 w-full border-0 bg-transparent p-0 text-left font-semibold underline underline-offset-3">Show the working</Collapsible.Trigger>
						<Collapsible.Content>
						<div class="scroll"><table>
							<thead><tr><th>Item</th><th class="n">Mass {aircraft.units.mass}</th><th class="n">Arm {aircraft.units.arm}</th><th class="n">Moment</th></tr></thead>
							<tbody>
								{#if mbRows}{#each mbRows.rows as row (row.id)}<tr><td>{row.label}</td><td class="n">{row.mass}</td><td class="n">{row.arm}</td><td class="n">{row.moment}</td></tr>{/each}
								<tr><th>Takeoff</th><th class="n">{mbRows.takeoff.mass}</th><th class="n">{mbRows.takeoff.arm}</th><th class="n">{mbRows.takeoff.moment}</th></tr>
								<tr><th>Landing</th><th class="n">{mbRows.landing.mass}</th><th class="n">{mbRows.landing.arm}</th><th class="n">{mbRows.landing.moment}</th></tr>{/if}
							</tbody>
						</table></div>
						{#each [['Takeoff', results.takeoff], ['Landing', results.landing]] as const as [title, result] (title)}
							{@const rows = workingRows(aircraft, result)}
							{#if rows.length}
								<div class="scroll"><table>
									<caption>{title}, {result.conditionLabel}</caption>
									<thead><tr><th>Step</th><th class="n">Total</th><th class="n">Ground roll</th></tr></thead>
									<tbody>{#each rows as row, k (k)}<tr><td>{row.step}</td><td class="n">{row.total}</td><td class="n">{row.groundRoll}</td></tr>{/each}</tbody>
								</table></div>
							{/if}
						{/each}
						</Collapsible.Content>
					</Collapsible.Root>
					<p class="muted">{aircraft.registration}, {aircraft.type}, revision {aircraft.revision}. Data Release {app.data?.index.release} from {app.data?.index.operator}{app.lastCheck ? `, checked ${new Date(app.lastCheck).toISOString().slice(0, 10)}` : ''}. App version {version}. <a href={resolve('/device-test')}>Device test</a></p>
					<button type="button" disabled={app.checking} onclick={() => app.check(true)}>{app.checking ? 'Checking' : 'Check for new data'}</button>
				</section>
			</div>
		</div>
		{/if}
		</Tabs.Content>
		</Tabs.Root>
	{/if}
</main>

{#if padField && calc}
	<Keypad field={padField} value={calc.values[padField.key] ?? ''} last={fields[calc.step].at(-1)?.key === padField.key} onkey={press} onclose={closePad} />
{/if}
