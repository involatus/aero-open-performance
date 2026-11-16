// Builds the app icons, shortcut icons, iOS splash screens, favicon, share image and README images
// from the SVG sources in docs/brand, and writes the splash screen links into src/app.html.
// A club with a logo gets its own icons and splash screens from the server (src/lib/server/club-brand.ts),
// which uses the splash signature drawn here.
// Run `npm run brand` after changing a source. It renders with Playwright's Chromium (`npx playwright install chromium`),
// or with another Chrome when CHROME_PATH is set.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPLASH_IMAGES } from '../src/lib/splash-screens.ts';

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

// The line at the foot of a club's splash screen: the AoP mark and the name, on navy. Drawn here because the
// server's renderer has no web fonts. Three times the size it shows at, so it stays sharp on every screen.
{
	const context = await browser.newContext({ deviceScaleFactor: 3 });
	const sig = await context.newPage();
	const mark = readFileSync(src('aop-mark.svg'), 'utf8').replace(/ width="512" height="512"/, ' width="44" height="44"');
	await sig.setContent(`<!doctype html><html><head><style>${FONTS}html,body{margin:0;background:transparent}#s{display:inline-flex;align-items:center;gap:10px}#m{width:44px;height:44px;border-radius:10px;overflow:hidden}#m svg{display:block}p{margin:0;font:600 15px 'IBM Plex Sans';letter-spacing:0.02em;color:#9aabb9}</style></head><body><div id="s"><div id="m">${mark}</div><p>Aero Open Performance</p></div></body></html>`);
	await sig.evaluate(() => document.fonts.ready);
	writeFileSync(out('docs/brand/splash-signature.png'), await sig.locator('#s').screenshot({ omitBackground: true }));
	await context.close();
	console.log('docs/brand/splash-signature.png');
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
for (const { file, w, h, devices, orientation, media } of SPLASH_IMAGES) {
	writeFileSync(out(`static/splash/${file}`), await render(splash(w, h), w, h));
	// The server answers with the club's splash screen, or sends the device on to this plain one.
	links.push(`\t\t<!-- ${devices}, ${orientation} -->\n\t\t<link rel="apple-touch-startup-image" media="${media}" href="/brand/${file}" />`);
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
