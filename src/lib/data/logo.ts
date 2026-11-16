/**
 * The Operator's logo. It travels inside the release index, so it is checked and installed with the data,
 * works offline and changes only with a new release. The app shows it in the header, on the aircraft list,
 * in the menu and on Reports.
 */
import * as v from 'valibot';

/** Big enough for a crisp header logo, small enough to keep in the index and in every stored Report. */
export const LOGO_MAX_BYTES = 48 * 1024;

const MEDIA = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml' } as const;
type Kind = keyof typeof MEDIA;

const DataUri = v.pipe(
	v.string(),
	v.maxLength(`data:${MEDIA.svg};base64,`.length + Math.ceil(LOGO_MAX_BYTES / 3) * 4),
	// One check, because a pipe goes on after a failed step: the contents are read only from a well-formed URI.
	v.check((uri) => /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(uri) && logoProblem(decode(uri), kindOf(uri)) === null)
);
/** `light` is for light backgrounds. `dark`, if given, replaces it in dark mode; without it the light logo sits on a white plate. */
export const OperatorLogo = v.strictObject({ light: DataUri, dark: v.optional(DataUri) });
export type OperatorLogo = v.InferOutput<typeof OperatorLogo>;

export class LogoError extends Error {}

function kindOf(uri: string): Kind {
	const media = uri.slice(5, uri.indexOf(';'));
	return (Object.keys(MEDIA) as Kind[]).find((k) => MEDIA[k] === media) ?? 'png';
}
function decode(uri: string): Uint8Array {
	const binary = atob(uri.slice(uri.indexOf(',') + 1));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function encode(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], JPEG = [0xff, 0xd8, 0xff];
const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Why these bytes can't be a logo, or null. The file's content must match its type. */
function logoProblem(bytes: Uint8Array, kind: Kind): string | null {
	if (!bytes.length) return 'The logo file is empty.';
	if (bytes.length > LOGO_MAX_BYTES) return `The logo is ${Math.ceil(bytes.length / 1024)} KB. Use one of at most ${LOGO_MAX_BYTES / 1024} KB.`;
	if (kind === 'png' && !startsWith(bytes, PNG)) return 'The logo file is not a PNG image.';
	if (kind === 'jpeg' && !startsWith(bytes, JPEG)) return 'The logo file is not a JPEG image.';
	if (kind === 'svg') {
		const text = new TextDecoder().decode(bytes);
		if (!/<svg[\s>]/i.test(text)) return 'The logo file is not an SVG image.';
		// Shown as an image, an SVG can't run anything, but the PDF renderer reads it as a drawing, so keep it to one.
		if (/<script|<foreignObject|<image|\bon[a-z]+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(text)) return 'The SVG logo must be a plain drawing: no scripts, embedded images or links.';
	}
	return null;
}

/** A logo file as stored in the index. Throws LogoError with a message for the person publishing. */
export function logoFromFile(name: string, bytes: Uint8Array): string {
	const ext = name.toLowerCase().split('.').pop();
	const kind: Kind | undefined = ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'svg' ? 'svg' : undefined;
	if (!kind) throw new LogoError('The logo must be a PNG, JPEG or SVG file.');
	const problem = logoProblem(bytes, kind);
	if (problem) throw new LogoError(problem);
	return `data:${MEDIA[kind]};base64,${encode(bytes)}`;
}

export function parseLogo(data: unknown): { ok: true; logo: OperatorLogo | undefined } | { ok: false; problem: string } {
	if (data === undefined || data === null) return { ok: true, logo: undefined };
	const r = v.safeParse(OperatorLogo, data);
	return r.success ? { ok: true, logo: r.output } : { ok: false, problem: 'The Operator logo is not valid. Use a PNG, JPEG or SVG file of at most 48 KB.' };
}

export function sameLogo(a: OperatorLogo | undefined, b: OperatorLogo | undefined): boolean {
	return a?.light === b?.light && a?.dark === b?.dark;
}

/** Width over height, read from the file itself, so a layout can size and centre the logo. 1 if the file doesn't say. */
export function logoAspect(uri: string): number {
	const bytes = decode(uri), kind = kindOf(uri);
	let w = 0, h = 0;
	if (kind === 'svg') {
		const tag = /<svg[^>]*>/i.exec(new TextDecoder().decode(bytes))?.[0] ?? '';
		const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
		const size = (name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)(px)?["']`, 'i').exec(tag)?.[1] ?? 0);
		[w, h] = box ? [Number(box[1]), Number(box[2])] : [size('width'), size('height')];
	} else if (kind === 'png') {
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		[w, h] = [view.getUint32(16), view.getUint32(20)];
	} else {
		// A JPEG gives its size in the first start-of-frame segment.
		for (let i = 2; i + 9 < bytes.length; ) {
			if (bytes[i] !== 0xff) break;
			const marker = bytes[i + 1], length = (bytes[i + 2] << 8) | bytes[i + 3];
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { h = (bytes[i + 5] << 8) | bytes[i + 6]; w = (bytes[i + 7] << 8) | bytes[i + 8]; break; }
			i += 2 + length;
		}
	}
	return w > 0 && h > 0 ? w / h : 1;
}

/** The logo as the PDF renderer takes it: an SVG drawing, or the image itself. */
export function pdfLogo(uri: string): { svg: string } | { image: string } {
	return kindOf(uri) === 'svg' ? { svg: new TextDecoder().decode(decode(uri)) } : { image: uri };
}
