/** The web app manifest. A server route, so a club with a logo gets its own icons. */
import { json } from '@sveltejs/kit';
import { manifestIcons } from '#lib/server/club-brand.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ fetch }) => {
	const manifest = {
		id: '/',
		name: 'Aero Open Performance',
		short_name: 'AoP',
		lang: 'en',
		description: 'Mass and balance and takeoff and landing performance for piston aircraft. Open source, and works offline.',
		start_url: '/',
		scope: '/',
		display: 'standalone',
		background_color: '#14263a',
		theme_color: '#14263a',
		icons: await manifestIcons(fetch),
		shortcuts: [
			{
				name: 'New calculation',
				short_name: 'New',
				description: 'Start a calculation from the aircraft list',
				url: '/?open=new',
				icons: [{ src: '/icons/shortcut-new-96.png', sizes: '96x96', type: 'image/png' }, { src: '/icons/shortcut-new-192.png', sizes: '192x192', type: 'image/png' }]
			},
			{
				name: 'Reports',
				description: 'The reports created on this device',
				url: '/?open=reports',
				icons: [{ src: '/icons/shortcut-reports-96.png', sizes: '96x96', type: 'image/png' }, { src: '/icons/shortcut-reports-192.png', sizes: '192x192', type: 'image/png' }]
			}
		]
	};
	return json(manifest, { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } });
};
