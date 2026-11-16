import { describe, expect, it } from 'vitest';
import { logoAspect } from '../data/logo.ts';
import { SPLASH_IMAGES } from '../splash-screens.ts';
import { brandImage, clubSplash, manifestIcons } from './club-brand.ts';

const svg = (fill: string) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="${fill}"/></svg>`)}`;
const LIGHT = svg('#e30613'), DARK = svg('#ffffff');
const SIGNATURE = 'data:image/png;base64,' + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0xa9, 0, 0, 0, 0x84));

/** The bundled data the server falls back to, as a fetch that serves it. No storage is set up in tests. */
const data = (logo?: { light: string; dark?: string }) => (async () => new Response(JSON.stringify({ formatVersion: '0.6.0', operator: 'Club', release: 1, published: '2026-11-16T00:00:00Z', ...(logo ? { logo } : {}), aircraft: [] }))) as typeof fetch;

async function png(file: string, logo: { light: string; dark?: string }, version: string | null = null) {
	const answer = await brandImage(file, version, data(logo));
	if (answer.kind !== 'image') throw new Error(`expected an image, got ${answer.kind}`);
	return answer;
}
const pngSize = (png: Uint8Array) => { const v = new DataView(png.buffer, png.byteOffset); return [v.getUint32(16), v.getUint32(20)]; };
/** The colour of one pixel of a PNG, by drawing it again: enough to tell navy, white and the logo's red apart. */
async function pixel(png: Uint8Array, x: number, y: number) {
	const { Resvg } = await import('@resvg/resvg-js');
	const [w, h] = pngSize(png);
	const one = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><image href="data:image/png;base64,${Buffer.from(png).toString('base64')}" x="${-x}" y="${-y}" width="${w}" height="${h}"/></svg>`).render();
	const [r, g, b] = one.pixels;
	return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

describe('club icon, white band', () => {
	it('puts the AoP mark on navy above the light logo on white', async () => {
		const { png: icon } = await png('icon-512.png', { light: LIGHT, dark: DARK });
		expect(pngSize(icon)).toEqual([512, 512]);
		expect(await pixel(icon, 10, 10)).toBe('#14263a');
		expect(await pixel(icon, 10, 500)).toBe('#ffffff');
		expect(await pixel(icon, 256, 342)).toBe('#e30613');
	});
	it('keeps the maskable drawing inside the safe zone, with the colours to the edges', async () => {
		const { png: icon } = await png('icon-maskable-512.png', { light: LIGHT });
		expect(await pixel(icon, 2, 2)).toBe('#14263a');
		expect(await pixel(icon, 2, 508)).toBe('#ffffff');
		// The logo's box shrinks to the middle 80%, so its left edge moves in.
		expect(await pixel(icon, 40, 342)).toBe('#ffffff');
	});
	it('draws every icon the manifest names, at its size', async () => {
		const icons = await manifestIcons(data({ light: LIGHT }));
		for (const icon of icons.filter((i) => i.src.startsWith('/brand/'))) {
			const file = icon.src.slice('/brand/'.length).split('?')[0];
			expect(pngSize((await png(file, { light: LIGHT })).png).join('x')).toBe(icon.sizes);
		}
		expect(pngSize((await png('apple-touch-icon.png', { light: LIGHT })).png)).toEqual([180, 180]);
	});
});

describe('club splash screen', () => {
	const phone = SPLASH_IMAGES.find((s) => s.file === 'splash-1170x2532.png')!;
	const middle = (phone.h - 96 * 3) / 2;
	it('puts the dark logo straight on the navy', async () => {
		const { png: splash } = await png(phone.file, { light: LIGHT, dark: DARK });
		expect(pngSize(splash)).toEqual([phone.w, phone.h]);
		expect(await pixel(splash, phone.w / 2, middle)).toBe('#ffffff');
		expect(await pixel(splash, 20, 20)).toBe('#14263a');
		// No card: navy right beside the logo.
		const logoWidth = Math.min(phone.w * 0.82, phone.h * 0.3 * logoAspect(DARK));
		expect(await pixel(splash, phone.w / 2 - logoWidth / 2 - 30, middle)).toBe('#14263a');
	});
	it('without a dark logo, puts the light one on a white card', async () => {
		const { png: splash } = await png(phone.file, { light: LIGHT });
		expect(await pixel(splash, phone.w / 2, middle)).toBe('#e30613');
		// The card's padding, beside the logo.
		const logoWidth = Math.min(phone.w * 0.82 - 144, (phone.h * 0.3 - 144) * logoAspect(LIGHT));
		expect(await pixel(splash, phone.w / 2 - logoWidth / 2 - 30, middle)).toBe('#ffffff');
	});
	it('fits the logo on every screen, in both orientations', () => {
		for (const s of SPLASH_IMAGES) {
			for (const logo of [{ light: LIGHT }, { light: LIGHT, dark: DARK }]) {
				const art = clubSplash(logo, SIGNATURE, s.w, s.h, s.ratio);
				for (const [, x, y, w, h] of art.matchAll(/x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
					expect(Number(x)).toBeGreaterThanOrEqual(0);
					expect(Number(y)).toBeGreaterThanOrEqual(0);
					expect(Number(x) + Number(w)).toBeLessThanOrEqual(s.w + 0.01);
					expect(Number(y) + Number(h)).toBeLessThanOrEqual(s.h + 0.01);
				}
			}
		}
	});
});

describe('serving them', () => {
	it('sends devices on to the plain AoP file when the data has no logo', async () => {
		expect(await brandImage('icon-512.png', null, data())).toEqual({ kind: 'redirect', to: '/icons/icon-512.png' });
		expect(await brandImage('splash-1170x2532.png', null, data())).toEqual({ kind: 'redirect', to: '/splash/splash-1170x2532.png' });
		expect(await brandImage('icon-512.png', null, (async () => new Response('', { status: 404 })) as typeof fetch)).toEqual({ kind: 'redirect', to: '/icons/icon-512.png' });
	});
	it('knows only its own files', async () => {
		for (const file of ['splash-99999x99999.png', '../secret', 'icon-monochrome-512.png']) expect(await brandImage(file, null, data({ light: LIGHT }))).toEqual({ kind: 'not-found' });
	});
	it('names the club icons in the manifest with the logo\'s key, which may then be kept for a year', async () => {
		const icons = await manifestIcons(data({ light: LIGHT }));
		const src = icons.find((i) => i.purpose === 'any')!.src;
		expect(src).toMatch(/^\/brand\/icon-192\.png\?v=[0-9a-f]{12}$/);
		expect(icons.find((i) => i.purpose === 'monochrome')!.src).toBe('/icons/icon-monochrome-512.png');
		const version = src.split('v=')[1];
		expect((await png('icon-192.png', { light: LIGHT }, version)).cacheControl).toContain('immutable');
		// Without the key, or with an old one, only for an hour.
		expect((await png('icon-192.png', { light: LIGHT })).cacheControl).toBe('public, max-age=3600');
		expect((await png('icon-192.png', { light: LIGHT, dark: DARK }, version)).cacheControl).toBe('public, max-age=3600');
	});
	it('names the plain icons when the data has no logo', async () => {
		expect((await manifestIcons(data())).map((i) => i.src)).toEqual(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-192.png', '/icons/icon-maskable-512.png', '/icons/icon-monochrome-512.png']);
	});
});
