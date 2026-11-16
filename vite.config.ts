import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-vercel';
import { defineConfig } from 'vite';

export default defineConfig({
	// Only variables with these prefixes reach the browser. PUBLIC_REPORT_EMAIL is meant to be public.
	envPrefix: ['VITE_', 'PUBLIC_'],
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			// The cached start page also answers unknown addresses offline, so its file paths must be absolute.
			paths: { relative: false }
		})
	]
});
