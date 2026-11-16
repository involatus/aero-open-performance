import type { Handle } from '@sveltejs/kit/hooks';

/** Each copy belongs to one club, so search engines keep it out of their results. Link previews still work. */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('x-robots-tag', 'noindex, nofollow');
	return response;
};
