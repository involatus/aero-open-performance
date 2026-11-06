/** Published aircraft data for pilots' devices. Falls through to the app's bundled data when nothing is published here. */
import { storageFromEnv } from '#lib/server/storage/from-env.ts';
import { publishedFile } from '#lib/server/admin.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ params }) => {
	const storage = await storageFromEnv();
	// "Nothing published here" is a normal answer, not an error, so the app can fall back quietly.
	const notFound = () => new Response('null', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
	if (!storage) return notFound();
	const file = await publishedFile(storage, params.path).catch(() => null);
	if (!file) return notFound();
	// Release files never change. The index must always be fresh.
	const cache = params.path === 'index.json' ? 'no-store' : 'public, max-age=31536000, immutable';
	return new Response(JSON.stringify(file.data), { headers: { 'content-type': 'application/json', 'cache-control': cache } });
};
