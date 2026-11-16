<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { reloadOnce } from '#lib/app/reload.ts';

	let { children } = $props();

	// After an update, an app that was left open can ask for code files the new deployment no longer has.
	// Reloading starts the current version instead of showing an error.
	onMount(() => {
		const stale = (event: Event) => { if (reloadOnce()) event.preventDefault(); };
		window.addEventListener('vite:preloadError', stale);
		return () => window.removeEventListener('vite:preloadError', stale);
	});
</script>

{@render children()}
