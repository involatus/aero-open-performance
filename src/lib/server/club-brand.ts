/**
 * A club's own app icons and splash screens, drawn by the server from the logo in its published data.
 * All clubs deploy the same code, so these can't be files in the repository. The routes only adapt HTTP:
 * this module decides which logo applies, what each file looks like, where its address points and how long
 * it may be cached. Without a logo, devices are sent on to the plain AoP files in static/.
 * The layouts are the "white band" icon and the splash screen from the club co-branding designs.
 */
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import markSvg from '../../../docs/brand/aop-mark.svg?raw';
import signature from '../../../docs/brand/splash-signature.png?inline';
import { logoAspect, type OperatorLogo } from '../data/logo.ts';
import { parseIndex } from '../data/release.ts';
import { SPLASH_IMAGES } from '../splash-screens.ts';
import { latestIndex } from './admin.ts';
import { storageFromEnv } from './storage/from-env.ts';

type Fetch = typeof globalThis.fetch;

/** What a /brand/<file> request gets. */
export type BrandAnswer =
	| { kind: 'image'; png: Uint8Array; cacheControl: string }
	| { kind: 'redirect'; to: string }
	| { kind: 'not-found' };

export type ManifestIcon = { src: string; sizes: string; type: 'image/png'; purpose: 'any' | 'maskable' | 'monochrome' };

/** The icons the manifest and app.html name: size, and whether it is the maskable one. */
const ICONS: Record<string, { size: number; maskable: boolean }> = {
	'icon-192.png': { size: 192, maskable: false },
	'icon-512.png': { size: 512, maskable: false },
	'icon-maskable-192.png': { size: 192, maskable: true },
	'icon-maskable-512.png': { size: 512, maskable: true },
	'apple-touch-icon.png': { size: 180, maskable: false }
};
const SPLASH = new Map(SPLASH_IMAGES.map((s) => [s.file, s]));

/**
 * The answer for /brand/<file>. `version` is the address's `v`: the manifest adds the logo's key, so that address
 * never changes its answer and may be kept for a year. app.html's links have none, so iOS gets a new logo within the hour.
 */
export async function brandImage(file: string, version: string | null, fetch: Fetch): Promise<BrandAnswer> {
	const plain = ICONS[file] ? `/icons/${file}` : SPLASH.has(file) ? `/splash/${file}` : null;
	if (!plain) return { kind: 'not-found' };
	const logo = await currentLogo(fetch);
	if (!logo) return { kind: 'redirect', to: plain };
	const current = version === logoKey(logo);
	return { kind: 'image', png: draw(file, logo), cacheControl: current ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' };
}

/** The manifest's icons: the club's own when its data has a logo, else the plain AoP ones. */
export async function manifestIcons(fetch: Fetch): Promise<ManifestIcon[]> {
	const logo = await currentLogo(fetch);
	const src = (name: string) => (logo ? `/brand/${name}?v=${logoKey(logo)}` : `/icons/${name}`);
	const icon = (name: string, size: number, purpose: ManifestIcon['purpose']): ManifestIcon => ({ src: src(name), sizes: `${size}x${size}`, type: 'image/png', purpose });
	return [
		icon('icon-192.png', 192, 'any'),
		icon('icon-512.png', 512, 'any'),
		icon('icon-maskable-192.png', 192, 'maskable'),
		icon('icon-maskable-512.png', 512, 'maskable'),
		// A one-colour icon is drawn by the system as a shape, where a club's logo can't be read, so it stays AoP.
		{ src: '/icons/icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' }
	];
}

/** Changes whenever the logo does. */
function logoKey(logo: OperatorLogo): string {
	return createHash('sha256').update(logo.light).update('\n').update(logo.dark ?? '').digest('hex').slice(0, 12);
}

/** The logo pilots get: from the release published in the admin area, or else from the data bundled with the app, as the app itself does. */
async function currentLogo(fetch: Fetch): Promise<OperatorLogo | undefined> {
	const storage = await storageFromEnv();
	const published = storage ? await latestIndex(storage).catch(() => null) : null;
	if (published) return published.logo;
	try {
		const response = await fetch('/data/index.json');
		return response.ok ? parseIndex(await response.json()).logo : undefined;
	} catch {
		return undefined;
	}
}

// Drawing takes a moment, so each image is kept while this server instance runs. Old logos drop out first.
const drawn = new Map<string, Uint8Array>();
const KEEP = 64;

function draw(file: string, logo: OperatorLogo): Uint8Array {
	const id = `${logoKey(logo)}/${file}`;
	const kept = drawn.get(id);
	if (kept) return kept;
	const icon = ICONS[file], splash = SPLASH.get(file)!;
	const svg = icon ? bandIcon(markSvg, logo, icon.size, icon.maskable) : clubSplash(logo, signature, splash.w, splash.h, splash.ratio);
	const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
	drawn.set(id, png);
	if (drawn.size > KEEP) drawn.delete(drawn.keys().next().value!);
	return png;
}

const NAVY = '#14263a';
const WHITE = '#ffffff';

const svgUri = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`;
const image = (href: string, x: number, y: number, w: number, h: number) =>
	`<image href="${href}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
/** The largest size with the logo's proportions that fits in the box. */
function fit(aspect: number, boxW: number, boxH: number) {
	const w = Math.min(boxW, boxH * aspect);
	return { w, h: w / aspect };
}

/**
 * The app icon on a 512 grid: the AoP mark on navy at the top, the club's light logo on a white band below.
 * `maskable` shrinks the drawing into Android's safe zone, the middle 80%, and lets the navy and white run to the edges.
 */
function bandIcon(markSvg: string, logo: OperatorLogo, size: number, maskable = false): string {
	const inner = maskable ? ' transform="translate(256 256) scale(0.8) translate(-256 -256)"' : '';
	const bandTop = maskable ? 256 + (172 - 256) * 0.8 : 172;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">`
		+ `<rect width="512" height="512" fill="${NAVY}"/>`
		+ `<g${inner}>${image(svgUri(markSvg), 156, -7, 200, 200)}</g>`
		+ `<rect y="${bandTop}" width="512" height="${512 - bandTop}" fill="${WHITE}"/>`
		+ `<g${inner}>${image(logo.light, 36, 198, 440, 288)}</g>`
		+ `</svg>`;
}

/**
 * A splash screen of w × h pixels at `ratio` pixels per point: the club's logo in the middle of the navy,
 * and the AoP signature (`signature`, a PNG data URI) at the foot. The dark logo goes straight on the navy.
 * Without one, the light logo sits on a white card, as it does in the app in dark mode.
 * @internal Exported only so its tests can check the layout on every screen size.
 */
export function clubSplash(logo: OperatorLogo, signature: string, w: number, h: number, ratio: number): string {
	const pt = (v: number) => v * ratio;
	const short = Math.min(w, h) / ratio, long = Math.max(w, h) / ratio;
	// The design's phone: a 320 pt logo on a 390 pt screen. Larger screens stop growing it at 440 × 220 pt.
	const box = { w: pt(Math.min(short * 0.82, 440)), h: pt(Math.min(long * 0.3, 220)) };
	const foot = { gap: pt(52), height: pt(44) };
	const cx = w / 2, cy = (h - foot.gap - foot.height) / 2;

	let logoPart: string;
	if (logo.dark) {
		const size = fit(logoAspect(logo.dark), box.w, box.h);
		logoPart = image(logo.dark, cx - size.w / 2, cy - size.h / 2, size.w, size.h);
	} else {
		const pad = pt(24);
		const size = fit(logoAspect(logo.light), box.w - 2 * pad, box.h - 2 * pad);
		const card = { w: size.w + 2 * pad, h: size.h + 2 * pad };
		logoPart = `<rect x="${(cx - card.w / 2).toFixed(2)}" y="${(cy - card.h / 2).toFixed(2)}" width="${card.w.toFixed(2)}" height="${card.h.toFixed(2)}" rx="${pt(20)}" fill="${WHITE}"/>`
			+ image(logo.light, cx - size.w / 2, cy - size.h / 2, size.w, size.h);
	}
	const sigWidth = foot.height * logoAspect(signature);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
		+ `<rect width="${w}" height="${h}" fill="${NAVY}"/>`
		+ logoPart
		+ image(signature, cx - sigWidth / 2, h - foot.gap - foot.height, sigWidth, foot.height)
		+ `</svg>`;
}
