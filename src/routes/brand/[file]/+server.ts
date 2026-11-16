/** A club's app icons and splash screens. The club brand module decides everything; this only adapts HTTP. */
import { error, redirect } from '@sveltejs/kit';
import { brandImage } from '#lib/server/club-brand.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const answer = await brandImage(params.file, url.searchParams.get('v'), fetch);
	if (answer.kind === 'not-found') error(404, 'Not found');
	if (answer.kind === 'redirect') redirect(307, answer.to);
	return new Response(answer.png as Uint8Array<ArrayBuffer>, { headers: { 'content-type': 'image/png', 'cache-control': answer.cacheControl } });
};
