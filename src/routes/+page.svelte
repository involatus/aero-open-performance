<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Checkbox, Collapsible, Tabs } from 'bits-ui';
	import { resolve } from '$app/paths';
	import { version } from '$app/env';
	import Keypad from '#lib/components/Keypad.svelte';
	import NumberField from '#lib/components/NumberField.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import CgChart from '#lib/components/CgChart.svelte';
	import DistanceResult from '#lib/components/DistanceResult.svelte';
	import { AppState } from '#lib/app/app-state.svelte.ts';
	import { describeChanges, isStale, STALE_DAYS } from '#lib/data/release.ts';
	import {
		STEP_NAMES, OLD_CALCULATION_DAYS, OLD_REPORT_MINUTES, WEATHER_KEYS, applyKey, applyQuick, applyWeather, canReport, changeConfiguration, confirmValue, confirmWeather, fieldsFor, isOldCalculation, isVariableWind, newCalculation, nextFlight,
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

	function massText(x: number) { return `${x.toFixed(aircraft!.display.massDecimals)} ${aircraft!.units.mass}`; }
	function armText(x: number) { return `${x.toFixed(aircraft!.display.armDecimals)} ${aircraft!.units.arm}`; }

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
		<p class="muted">Version {version}. <a href={resolve('/device-test')}>Device test</a>. <a href={resolve('/admin')}>Admin</a></p>
	{:else if calc}
		<Tabs.Root value={calc.id} onValueChange={(id) => selectTab(app.tabs.findIndex((t) => t.id === id))} class="grid gap-3">
		<div class="flex gap-1.5 overflow-x-auto">
			<Tabs.List aria-label="Calculations" class="flex flex-none gap-1.5">
				{#each app.tabs as tab, i (tab.id)}
					<Tabs.Trigger value={tab.id} class="min-h-[52px] max-w-[260px] flex-none truncate rounded-[5px] border border-line bg-panel px-3.5 font-semibold text-ink data-[state=active]:border-ink data-[state=active]:bg-ink data-[state=active]:text-bg">{labels[i]}</Tabs.Trigger>
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
			<div class="s">
				{#if results.takeoff.status === 'ok'}<b>{results.takeoff.total ?? results.takeoff.groundRoll} {results.takeoff.unit}</b>{:else}<b class="none">{results.takeoff.status === 'noData' ? 'No data' : results.takeoff.status === 'noResult' ? 'No result' : 'Needs inputs'}</b>{/if}
				<small>Takeoff</small>
			</div>
			<div class="s">
				{#if results.landing.status === 'ok'}<b>{results.landing.total ?? results.landing.groundRoll} {results.landing.unit}</b>{:else}<b class="none">{results.landing.status === 'noData' ? 'No data' : results.landing.status === 'noResult' ? 'No result' : 'Needs inputs'}</b>{/if}
				<small>Landing</small>
			</div>
			<div class="s"><b class:bad={results.exceeded.includes('takeoffMass') || results.exceeded.includes('takeoffCg')}>{results.massBalance.takeoff.mass.toFixed(0)} {aircraft.units.mass}</b><small>Takeoff, CG {armText(results.massBalance.takeoff.arm)}</small></div>
			<div class="s"><b class:bad={results.exceeded.includes('landingMass') || results.exceeded.includes('landingCg')}>{results.massBalance.landing.mass.toFixed(0)} {aircraft.units.mass}</b><small>Landing, CG {armText(results.massBalance.landing.arm)}</small></div>
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
								<NumberField {field} {calc} active={padKey === field.key} onopen={() => openPad(field.key)} onquick={(op) => quick(field, op)} onconfirm={() => confirmValue(calc!, field.key)} />
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
						<Segmented label="Elevation unit" options={[{ id: 'm', label: 'Metres' }, { id: 'ft', label: 'Feet' }]} value={calc.elevationUnit} onchange={(id) => (calc!.elevationUnit = id as 'm' | 'ft')} />
						{#if perf}
							<Segmented label="Takeoff condition" options={perf.takeoff.map((c) => ({ id: c.id, label: c.label }))} value={calc.takeoffCondition} onchange={(id) => (calc!.takeoffCondition = id)} />
							<Segmented label="Landing condition" options={perf.landing.map((c) => ({ id: c.id, label: c.label }))} value={calc.landingCondition} onchange={(id) => (calc!.landingCondition = id)} />
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
						<DistanceResult title="Takeoff" result={results.takeoff} mass={massText(results.massBalance.takeoff.mass)} />
						<DistanceResult title="Landing" result={results.landing} mass={massText(results.massBalance.landing.mass)} />
						<div class="num"><h2>Altitude</h2>
							{#if results.atmosphere}<b>{Math.round(results.atmosphere.pressureAltitudeFt)} ft</b><small>Pressure altitude{results.atmosphere.densityAltitudeFt !== null ? `. Density altitude ${Math.round(results.atmosphere.densityAltitudeFt)} ft` : ''}</small>{:else}<b class="none">Enter elevation and QNH</b>{/if}
						</div>
						<div class="num"><h2>Wind</h2>
							{#if results.wind && isVariableWind(calc)}<b>{Math.abs(results.wind.headwind).toFixed(0)} kt tail</b><small>Variable wind, applied as a tailwind</small>{:else if results.wind}<b>{Math.abs(results.wind.headwind).toFixed(0)} kt {results.wind.headwind >= 0 ? 'head' : 'tail'}</b><small>Crosswind {results.wind.crosswind.toFixed(0)} kt</small>{:else}<b class="none">Enter wind and heading</b>{/if}
						</div>
					</div>
				</section>
				<section>
					<h2>Limits</h2>
					<div class="list">
						{#each results.massBalance.limits as limit (limit.id)}
							<div class="check">
								<i class={limit.status === 'ok' ? 'ok' : limit.status === 'warning' ? 'warnb' : 'fail'}>{limit.status === 'ok' ? 'OK' : limit.status === 'warning' ? 'CHECK' : 'OVER'}</i>
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
								{#each results.massBalance.rows as row (row.id)}<tr><td>{row.label}</td><td class="n">{row.mass.toFixed(aircraft.display.massDecimals)}</td><td class="n">{row.arm.toFixed(aircraft.display.armDecimals)}</td><td class="n">{row.moment.toFixed(2)}</td></tr>{/each}
								<tr><th>Takeoff</th><th class="n">{results.massBalance.takeoff.mass.toFixed(aircraft.display.massDecimals)}</th><th class="n">{results.massBalance.takeoff.arm.toFixed(aircraft.display.armDecimals)}</th><th class="n">{results.massBalance.takeoff.moment.toFixed(2)}</th></tr>
								<tr><th>Landing</th><th class="n">{results.massBalance.landing.mass.toFixed(aircraft.display.massDecimals)}</th><th class="n">{results.massBalance.landing.arm.toFixed(aircraft.display.armDecimals)}</th><th class="n">{results.massBalance.landing.moment.toFixed(2)}</th></tr>
							</tbody>
						</table></div>
						{#each [['Takeoff', results.takeoff], ['Landing', results.landing]] as const as [title, result] (title)}
							{#if result.steps.length}
								<div class="scroll"><table>
									<caption>{title}, {result.conditionLabel}</caption>
									<thead><tr><th>Step</th><th class="n">Total</th><th class="n">Ground roll</th></tr></thead>
									<tbody>
										{#each result.steps as step, i (i)}
											<tr><td>{i + 1}. {step.detail}{step.cells ? `. Table values ${step.cells.join(', ')}` : ''}</td><td class="n">{step.total?.toFixed(1) ?? '–'}</td><td class="n">{step.groundRoll?.toFixed(1) ?? '–'}</td></tr>
										{/each}
										{#if result.status === 'ok'}<tr><th>Rounded up, {result.unit}</th><th class="n">{result.total ?? '–'}</th><th class="n">{result.groundRoll ?? '–'}</th></tr>{/if}
									</tbody>
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
	<Keypad field={padField} value={calc.values[padField.key] ?? ''} last={fields[calc.step].at(-1)?.key === padField.key} onkey={press} />
{/if}
