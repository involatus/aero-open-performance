<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { asset } from '$app/paths';
	import { installWay, isIos, type InstallWay } from '#lib/app/install.ts';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';

	/** Chromium's install event, which TypeScript's DOM types don't include. */
	type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

	const DISMISSED = 'aop-install-dismissed';
	let open = $state(false);
	let way = $state<InstallWay | null>(null);
	let deferred: InstallEvent | null = null;

	const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
	function dismissedAt(): number | null {
		try { const v = Number(localStorage.getItem(DISMISSED)); return v > 0 ? v : null; } catch { return null; }
	}

	function decide() {
		way = installWay({
			standalone: standalone(),
			canPrompt: !!deferred,
			ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
			automated: navigator.webdriver,
			dismissedAt: dismissedAt(),
			now: Date.now()
		});
		open = !!way;
	}

	onMount(() => {
		const offer = (event: Event) => {
			// Keeps the browser's own mini bar away, so the app asks once, in its own words.
			event.preventDefault();
			deferred = event as InstallEvent;
			decide();
		};
		const installed = () => { deferred = null; open = false; };
		addEventListener('beforeinstallprompt', offer);
		addEventListener('appinstalled', installed);
		// iOS has no install event, so it is offered once the page has settled.
		const timer = setTimeout(() => { if (!deferred) decide(); }, 1500);
		return () => { clearTimeout(timer); removeEventListener('beforeinstallprompt', offer); removeEventListener('appinstalled', installed); };
	});

	function notNow() {
		try { localStorage.setItem(DISMISSED, String(Date.now())); } catch { /* it asks again next time */ }
		open = false;
	}

	async function install() {
		if (!deferred) return;
		const event = deferred;
		deferred = null;
		await event.prompt();
		const { outcome } = await event.userChoice;
		if (outcome === 'dismissed') notNow();
		else open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (!o) notNow(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-ink/40" />
		<Dialog.Content class="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-menu">
			<div class="flex items-center gap-3">
				<img src={asset('icons/icon-192.png')} alt="" width="56" height="56" class="size-14 flex-none rounded-[14px]" />
				<div>
					<Dialog.Title class="text-[17px] font-bold">Install AoP</Dialog.Title>
					<Dialog.Description class="mt-0.5 text-sm text-muted">Aero Open Performance on your home screen</Dialog.Description>
				</div>
			</div>
			<p class="text-sm text-ink-2">Installed, the app opens full screen, works offline in the cockpit and keeps your calculations and reports on this device.</p>
			{#if way === 'ios'}
				<ol class="m-0 flex list-none flex-col gap-2 p-0 text-sm">
					<li class="flex items-center gap-3"><span class="flex size-9 flex-none items-center justify-center rounded-lg bg-subtle text-accent"><Icon name="share" size={18} /></span><span>Tap <strong>Share</strong> in the browser toolbar. In Safari it may be under <strong>⋯</strong>.</span></li>
					<li class="flex items-center gap-3"><span class="flex size-9 flex-none items-center justify-center rounded-lg bg-subtle text-accent"><Icon name="add-to-home" size={18} /></span><span>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</span></li>
				</ol>
				<div class="flex justify-end"><Button onclick={notNow}>OK</Button></div>
			{:else}
				<div class="flex justify-end gap-2">
					<Button variant="ghost" onclick={notNow}>Not now</Button>
					<Button variant="primary" onclick={install}>Install</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
