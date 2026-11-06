<script lang="ts">
	import { onMount } from 'svelte';
	import { version } from '$app/env';
	import { resolve } from '$app/paths';
	import { createTestPdf } from '#lib/test-pdf.ts';

	type Launches = { first: string; last: string; count: number };

	let online = $state(true);
	let installed = $state(false);
	let worker = $state('checking');
	let updateReady = $state(false);
	let persisted = $state('checking');
	let storage = $state('checking');
	let launches = $state<Launches | null>(null);
	let daysSince = $state<number | null>(null);
	let dbError = $state('');
	let pdf = $state<File | null>(null);
	let pdfBusy = $state(false);
	let log = $state<string[]>([]);
	let copied = $state('');

	function note(line: string) {
		log = [...log, `${new Date().toISOString().slice(11, 19)}  ${line}`];
	}

	function openDb(): Promise<IDBDatabase> {
		return new Promise((done, fail) => {
			const request = indexedDB.open('device-test', 1);
			request.onupgradeneeded = () => request.result.createObjectStore('kv');
			request.onsuccess = () => done(request.result);
			request.onerror = () => fail(request.error);
		});
	}

	// Records every launch on the device, which shows whether stored data survives over time.
	async function recordLaunch() {
		try {
			const db = await openDb();
			const previous = await new Promise<Launches | undefined>((done, fail) => {
				const get = db.transaction('kv').objectStore('kv').get('launches');
				get.onsuccess = () => done(get.result);
				get.onerror = () => fail(get.error);
			});
			const now = new Date().toISOString();
			const next: Launches = { first: previous?.first ?? now, last: now, count: (previous?.count ?? 0) + 1 };
			await new Promise<void>((done, fail) => {
				const tx = db.transaction('kv', 'readwrite');
				tx.objectStore('kv').put(next, 'launches');
				tx.oncomplete = () => done();
				tx.onerror = () => fail(tx.error);
			});
			if (previous) daysSince = (Date.parse(now) - Date.parse(previous.last)) / 86400000;
			launches = next;
		} catch (error) {
			dbError = String(error);
		}
	}

	async function readStorage() {
		if (!navigator.storage) {
			persisted = 'not available';
			storage = 'not available';
			return;
		}
		persisted = (await navigator.storage.persisted?.()) ? 'yes' : 'no';
		const estimate = await navigator.storage.estimate?.();
		if (estimate?.usage != null) storage = `${(estimate.usage / 1048576).toFixed(1)} MB used`;
	}

	async function askPersist() {
		const granted = await navigator.storage?.persist?.();
		note(`Keep-data request: ${granted ? 'granted' : 'not granted'}`);
		await readStorage();
	}

	async function makePdf() {
		pdfBusy = true;
		const started = performance.now();
		try {
			pdf = await createTestPdf(version);
			note(`PDF created in ${Math.round(performance.now() - started)} ms, ${Math.round(pdf.size / 1024)} KB, while ${navigator.onLine ? 'online' : 'offline'}`);
		} catch (error) {
			note(`PDF failed: ${error}`);
		}
		pdfBusy = false;
		await readStorage();
	}

	async function sharePdf() {
		if (!pdf) return;
		if (!navigator.canShare?.({ files: [pdf] })) {
			note('Sharing a file is not supported here');
			return;
		}
		try {
			await navigator.share({ files: [pdf], title: 'Aero Open Performance test' });
			note('Share finished without an error');
		} catch (error) {
			note(`Share ended: ${(error as Error).name}`);
		}
	}

	function openPdf() {
		if (!pdf) return;
		const url = URL.createObjectURL(pdf);
		location.href = url;
	}

	function activateUpdate() {
		navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage('activate-update'));
	}

	let summary = $derived(
		[
			`Version: ${version}`,
			`Installed: ${installed ? 'yes' : 'no'}`,
			`Online: ${online ? 'yes' : 'no'}`,
			`Service worker: ${worker}`,
			`Keep data: ${persisted}`,
			`Storage: ${storage}`,
			`Launches: ${launches ? `${launches.count}, first ${launches.first}` : dbError || 'none'}`,
			`Browser: ${navigator.userAgent}`,
			...log
		].join('\n')
	);

	async function copy() {
		try {
			await navigator.clipboard.writeText(summary);
			copied = 'Copied';
		} catch {
			copied = 'Copy failed, select the text below instead';
		}
	}

	onMount(() => {
		online = navigator.onLine;
		installed = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
		const setOnline = () => {
			online = navigator.onLine;
			note(online ? 'Connection returned' : 'Connection lost');
		};
		addEventListener('online', setOnline);
		addEventListener('offline', setOnline);

		recordLaunch();
		readStorage();

		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.ready.then(async (registration) => {
				worker = navigator.serviceWorker.controller ? 'active, controlling this page' : 'active, reopen to take control';
				updateReady = !!registration.waiting;
				registration.addEventListener('updatefound', () => {
					registration.installing?.addEventListener('statechange', () => {
						updateReady = !!registration.waiting;
					});
				});
				if (navigator.onLine) registration.update().catch(() => {});
			});
			navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
		} else {
			worker = 'not supported';
		}

		return () => {
			removeEventListener('online', setOnline);
			removeEventListener('offline', setOnline);
		};
	});
</script>

<svelte:head><title>Device test</title></svelte:head>

<main>
	<div class="notice">Pre-release, not for flight. This page only tests your device.</div>
	<h1>Device test</h1>

	<section>
		<h2>Status</h2>
		<p><strong>Installed:</strong> {installed ? 'Yes, running from the Home Screen' : 'No, running in the browser'}</p>
		<p><strong>Connection:</strong> {online ? 'Online' : 'Offline'}</p>
		<p><strong>Offline support:</strong> {worker}</p>
		<p><strong>Keep data on this device:</strong> {persisted}</p>
		<p><strong>Storage:</strong> {storage}</p>
		<p><strong>Launches:</strong>
			{#if launches}{launches.count}, first on {launches.first.slice(0, 10)}{#if daysSince !== null}, {daysSince.toFixed(1)} days since the last{/if}{:else}{dbError || 'checking'}{/if}
		</p>
		<p class="muted">Version {version}</p>
		<button onclick={askPersist}>Ask to keep data</button>
		{#if updateReady}<button class="primary" onclick={activateUpdate}>New version ready: update now</button>{/if}
	</section>

	<section>
		<h2>PDF</h2>
		<p>Create the PDF first, then share it. Try this offline too.</p>
		<button class="primary" onclick={makePdf} disabled={pdfBusy}>{pdfBusy ? 'Creating PDF' : 'Create test PDF'}</button>
		<button onclick={sharePdf} disabled={!pdf}>Share PDF</button>
		<button onclick={openPdf} disabled={!pdf}>Open PDF here</button>
	</section>

	<section>
		<h2>Test steps</h2>
		<ol class="m-0 grid list-decimal gap-1.5 pl-[22px]">
			<li>In Safari, tap Share, then Add to Home Screen, and keep Open as Web App on.</li>
			<li>Open it once from the icon while online, and wait for Offline support to say active.</li>
			<li>Force-quit it, turn on Airplane Mode with Wi-Fi off, and open it from the icon.</li>
			<li>Create a PDF offline, then share it to Mail and tap Send.</li>
			<li>Turn the connection back on, and see whether Mail sends it by itself.</li>
			<li>Leave the app installed. Launches and days show whether data survives over time.</li>
		</ol>
		<p><a href={resolve('/')}>Back to start</a></p>
	</section>

	<section>
		<h2>Results to send back</h2>
		<button onclick={copy}>Copy results</button>
		{#if copied}<p class="muted">{copied}</p>{/if}
		<pre style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px">{summary}</pre>
	</section>
</main>
