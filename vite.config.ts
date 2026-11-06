import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-vercel';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			// The cached start page also answers unknown addresses offline, so its file paths must be absolute.
			paths: { relative: false }
		})
	]
});
