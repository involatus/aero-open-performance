import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// The Svelte plugin compiles runes in .svelte.ts modules, such as the app state.
export default defineConfig({ plugins: [svelte()], test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] } });
