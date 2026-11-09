import { MONO, SANS } from './report.ts';
// IBM's complete fonts, bundled with the app so the service worker caches them and Reports render offline.
// The smaller web subsets can't be used: pdfmake's font library fails on their combined glyphs, such as ":" and "é".
import sansRegular from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff?url';
import sansBold from '@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Bold.woff?url';
import monoRegular from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff?url';
import monoSemibold from '@ibm/plex-mono/fonts/complete/woff/IBMPlexMono-SemiBold.woff?url';

const FILES = { 'PlexSans-Regular.woff': sansRegular, 'PlexSans-Bold.woff': sansBold, 'PlexMono-Regular.woff': monoRegular, 'PlexMono-SemiBold.woff': monoSemibold };
export const PDF_FONTS = {
	[SANS]: { normal: 'PlexSans-Regular.woff', bold: 'PlexSans-Bold.woff', italics: 'PlexSans-Regular.woff', bolditalics: 'PlexSans-Bold.woff' },
	[MONO]: { normal: 'PlexMono-Regular.woff', bold: 'PlexMono-SemiBold.woff', italics: 'PlexMono-Regular.woff', bolditalics: 'PlexMono-SemiBold.woff' }
};

async function base64(url: string): Promise<string> {
	const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** Renders a document on the device, with no network. pdfmake and the fonts load only when first needed. */
export async function renderPdf(document: unknown): Promise<Blob> {
	const [{ default: pdfMake }, ...data] = await Promise.all([
		// @ts-expect-error pdfmake's browser build has no type declarations
		import('pdfmake/build/pdfmake.js'),
		...Object.values(FILES).map(base64)
	]);
	pdfMake.addVirtualFileSystem(Object.fromEntries(Object.keys(FILES).map((name, i) => [name, data[i]])));
	pdfMake.setFonts(PDF_FONTS);
	return pdfMake.createPdf(document).getBlob();
}
