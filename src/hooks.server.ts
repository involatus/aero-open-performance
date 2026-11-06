import type { Handle } from '@sveltejs/kit/hooks';
import { authIsConfigured, getAuth } from '#lib/server/auth.ts';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/api/auth/') && authIsConfigured()) {
		const { svelteKitHandler } = await import('better-auth/svelte-kit');
		const { building } = await import('$app/env');
		return svelteKitHandler({ event, resolve, auth: await getAuth(), building });
	}
	return resolve(event);
};
