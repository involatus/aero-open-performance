<script lang="ts">
	import { resolve } from '$app/paths';
	import { version } from '$app/env';
</script>

<svelte:head><title>Aero Open Performance</title></svelte:head>

<main>
	<div class="notice">Pre-release, not for flight. This version has no calculations yet.</div>
	<h1>Aero Open Performance</h1>
	<p>Open-source mass and balance and performance for piston aircraft.</p>
	<section>
		<h2>This build</h2>
		<p>It checks that the app can install, start offline, store data and share a PDF on your device.</p>
		<p><a href={resolve('/device-test')}>Open the device test</a></p>
		<p class="muted">Version {version}</p>
	</section>
</main>
