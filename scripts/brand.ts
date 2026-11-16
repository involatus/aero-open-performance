// Builds the app icons, shortcut icons, iOS splash screens, favicon, share image and README images
// from the SVG sources in docs/brand, and writes the splash screen links into src/app.html.
// Run `npm run brand` after changing a source. It renders with Playwright's Chromium (`npx playwright install chromium`),
// or with another Chrome when CHROME_PATH is set.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (name: string) => `${root}docs/brand/${name}`;
const out = (path: string) => `${root}${path}`;
// Embedded, because a page set from a string may not load local files.
const font = (file: string) => `data:font/woff2;base64,${readFileSync(`${root}node_modules/@ibm/plex-sans/fonts/complete/woff2/${file}`).toString('base64')}`;

const FONTS = [['Regular', 400], ['SemiBold', 600], ['Bold', 700]]
	.map(([name, weight]) => `@font-face{font-family:'IBM Plex Sans';font-weight:${weight};src:url('${font(`IBMPlexSans-${name}.woff2`)}') format('woff2')}`)
	.join('');

/** Each PNG: the SVG source, where it goes, and its size. */
const PNGS: [string, string, number, number][] = [
	['aop-mark.svg', 'static/icons/icon-192.png', 192, 192],
	['aop-mark.svg', 'static/icons/icon-512.png', 512, 512],
	['aop-mark.svg', 'static/icons/apple-touch-icon.png', 180, 180],
	['aop-mark-maskable.svg', 'static/icons/icon-maskable-192.png', 192, 192],
	['aop-mark-maskable.svg', 'static/icons/icon-maskable-512.png', 512, 512],
	['aop-mark-monochrome.svg', 'static/icons/icon-monochrome-512.png', 512, 512],
	// The manifest's shortcuts: New calculation and Reports.
	['icons/aircraft.svg', 'static/icons/shortcut-new-96.png', 96, 96],
	['icons/aircraft.svg', 'static/icons/shortcut-new-192.png', 192, 192],
	['icons/send-report.svg', 'static/icons/shortcut-reports-96.png', 96, 96],
	['icons/send-report.svg', 'static/icons/shortcut-reports-192.png', 192, 192],
	['og.svg', 'static/og.png', 1200, 630],
	['social-preview.svg', 'docs/brand/social-preview.png', 1280, 640],
	['lockup-dark.svg', 'docs/brand/lockup-dark.png', 1200, 300],
	['lockup-light.svg', 'docs/brand/lockup-light.png', 1200, 300]
];
const ICO_SIZES = [16, 32, 48];

/**
 * The screens iOS and iPadOS show while the home-screen app starts. iOS uses one only when its media query matches
 * the device exactly, so each screen size needs its own image: width and height in points, portrait, and the pixel ratio.
 */
const SPLASH_SCREENS: [string, number, number, number][] = [
	['iPhone 16 Pro Max, 17 Pro Max', 440, 956, 3],
	['iPhone Air', 420, 912, 3],
	['iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus', 430, 932, 3],
	['iPhone 12 Pro Max, 13 Pro Max, 14 Plus', 428, 926, 3],
	['iPhone 16 Pro, 17, 17 Pro', 402, 874, 3],
	['iPhone 14 Pro, 15, 15 Pro, 16', 393, 852, 3],
	['iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e', 390, 844, 3],
	['iPhone X, XS, 11 Pro, 12 mini, 13 mini', 375, 812, 3],
	['iPhone XS Max, 11 Pro Max', 414, 896, 3],
	['iPhone XR, 11', 414, 896, 2],
	['iPhone 6 Plus to 8 Plus', 414, 736, 3],
	['iPhone 6 to 8, SE 2nd and 3rd generation', 375, 667, 2],
	['iPhone SE 1st generation', 320, 568, 2],
	['iPad Pro 13-inch (M4 and later)', 1032, 1376, 2],
	['iPad Pro 12.9-inch, iPad Air 13-inch', 1024, 1366, 2],
	['iPad Pro 11-inch (M4 and later)', 834, 1210, 2],
	['iPad Pro 11-inch', 834, 1194, 2],
	['iPad Air 10.9-inch and 11-inch, iPad 10th generation and later', 820, 1180, 2],
	['iPad Air 3rd generation, iPad Pro 10.5-inch', 834, 1112, 2],
	['iPad 7th to 9th generation', 810, 1080, 2],
	['iPad mini 6th generation and later', 744, 1133, 2],
	['iPad 9.7-inch, iPad mini 5th generation and earlier', 768, 1024, 2]
];
const NAVY = '#14263a';
const DRAWING = '#f4f7fa';

/** A splash screen: the logo in the middle of the app's navy background, with the full name under it. */
function splash(w: number, h: number): string {
	const mark = readFileSync(src('aop-mark.svg'), 'utf8')
		.replace(/^<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/<rect[^>]*><\/rect>/, '');
	const short = Math.min(w, h);
	const size = short * 0.34;
	const top = h / 2 - size * 0.62;
	const font = short * 0.045;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${NAVY}"/><g transform="translate(${w / 2 - size / 2} ${top}) scale(${size / 512})">${mark}</g><text x="${w / 2}" y="${top + size + font * 1.2}" text-anchor="middle" font-family="IBM Plex Sans" font-weight="600" font-size="${font}" fill="${DRAWING}">Aero Open Performance</text></svg>`;
}

/** Sets the root element's width and height, so the browser draws the SVG at exactly that size. */
const sized = (svg: string, w: number, h: number) => svg.replace(/<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${w}" height="${h}"`);

/** An ICO file holding PNG images, which every current browser reads. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, png }, i) => {
		const at = 6 + 16 * i;
		header.writeUInt8(size % 256, at);
		header.writeUInt8(size % 256, at + 1);
		header.writeUInt16LE(1, at + 4);
		header.writeUInt16LE(32, at + 6);
		header.writeUInt32LE(png.length, at + 8);
		header.writeUInt32LE(offset, at + 12);
		offset += png.length;
	});
	return Buffer.concat([header, ...images.map((i) => i.png)]);
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();

async function render(svg: string, w: number, h: number): Promise<Buffer> {
	await page.setViewportSize({ width: w, height: h });
	await page.setContent(`<!doctype html><html><head><style>${FONTS}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${sized(svg, w, h)}</body></html>`);
	await page.evaluate(() => document.fonts.ready);
	return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}

for (const [source, path, w, h] of PNGS) {
	writeFileSync(out(path), await render(readFileSync(src(source), 'utf8'), w, h));
	console.log(`${path} (${w}x${h})`);
}

const compact = readFileSync(src('aop-compact.svg'), 'utf8');
const icons = [];
for (const size of ICO_SIZES) icons.push({ size, png: await render(compact, size, size) });
writeFileSync(out('static/favicon.ico'), ico(icons));
copyFileSync(src('aop-compact.svg'), out('static/favicon.svg'));
console.log('static/favicon.ico, static/favicon.svg');

// Cleared first, so images for a screen that was removed from the list don't stay behind.
rmSync(out('static/splash'), { recursive: true, force: true });
mkdirSync(out('static/splash'));
const links: string[] = [];
for (const [devices, pw, ph, ratio] of SPLASH_SCREENS) {
	for (const orientation of ['portrait', 'landscape'] as const) {
		const [w, h] = orientation === 'portrait' ? [pw * ratio, ph * ratio] : [ph * ratio, pw * ratio];
		const file = `splash/splash-${w}x${h}.png`;
		writeFileSync(out(`static/${file}`), await render(splash(w, h), w, h));
		// device-width and device-height are the portrait size in either orientation.
		const media = `(device-width: ${pw}px) and (device-height: ${ph}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`;
		links.push(`\t\t<!-- ${devices}, ${orientation} -->\n\t\t<link rel="apple-touch-startup-image" media="${media}" href="%sveltekit.assets%/${file}" />`);
	}
}
console.log(`static/splash (${links.length} splash screens)`);

// The links go between the markers in app.html, so the page and the images always match.
const html = readFileSync(out('src/app.html'), 'utf8');
const START = '<!-- splash screens: written by npm run brand -->';
const END = '<!-- end of splash screens -->';
const at = html.indexOf(START);
const end = html.indexOf(END);
if (at < 0 || end < at) throw new Error(`src/app.html needs the markers "${START}" and "${END}".`);
writeFileSync(out('src/app.html'), `${html.slice(0, at + START.length)}\n${links.join('\n')}\n\t\t${html.slice(end)}`);
console.log('src/app.html (splash screen links)');

await browser.close();
