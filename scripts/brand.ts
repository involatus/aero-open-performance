// Builds the app icons, favicon, share image and README images from the SVG sources in docs/brand.
// Run `npm run brand` after changing a source. It renders with Playwright's Chromium (`npx playwright install chromium`),
// or with another Chrome when CHROME_PATH is set.
import { chromium } from '@playwright/test';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
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
	['og.svg', 'static/og.png', 1200, 630],
	['social-preview.svg', 'docs/brand/social-preview.png', 1280, 640],
	['lockup-dark.svg', 'docs/brand/lockup-dark.png', 1200, 300],
	['lockup-light.svg', 'docs/brand/lockup-light.png', 1200, 300]
];
const ICO_SIZES = [16, 32, 48];

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

await browser.close();
