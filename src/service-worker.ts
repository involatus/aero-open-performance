/// <reference lib="webworker" />
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { resolve as resolvePath } from '$app/paths';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-${version}`;
// The manifest's paths are valid app paths, but too general for resolve()'s route types.
const resolve = resolvePath as unknown as (path: string) => string;
const SHELL = resolve('/');
const FILES = [
	...immutable.map((file) => resolve(file.path)),
	...assets.filter((file) => !file.path.endsWith('.DS_Store')).map((file) => resolve(file.path)),
	...prerendered.map((file) => resolve(file.path))
];

sw.addEventListener('install', (event) => {
	// A failed file fails the install, so the previous complete version keeps running.
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	if (event.data === 'activate-update') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	// Live answers such as weather and sending must never be replayed from a cache.
	if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const hit = (await cache.match(url.pathname)) ?? (await cache.match(event.request));
			if (hit) return hit;
			if (event.request.mode === 'navigate') {
				const shell = await cache.match(SHELL);
				if (shell) return shell;
			}
			return fetch(event.request);
		})()
	);
});
