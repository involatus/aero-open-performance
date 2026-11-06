<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</title></svelte:head>

<main>
	<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
	<p>{page.status === 404 ? 'This address does not exist in the app.' : page.error?.message}</p>
	<p><a href={resolve('/')}>Back to start</a></p>
</main>
