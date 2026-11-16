<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import BrandMark from '#lib/components/ui/BrandMark.svelte';

	let notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Page not found' : 'Something went wrong'}</title></svelte:head>

<div class="min-h-dvh bg-canvas pt-[env(safe-area-inset-top,0px)]">
	<div aria-hidden="true" class="h-[3px] bg-brand"></div>
	<main class="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 pt-7 pb-8 sm:px-5">
		<BrandMark class="size-10" />
		<section class="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
			<h1 class="text-[22px] leading-tight font-bold">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
			<p>{notFound ? 'This address does not exist in the app.' : page.error?.message}</p>
			<div><Button variant="primary" size="lg" href={resolve('/')}>Back to start</Button></div>
		</section>
	</main>
</div>
