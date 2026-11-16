import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, LogoError, logoAspect, logoFromFile, parseLogo, pdfLogo, sameLogo } from './logo.ts';
import { describeChanges, indexFormatVersion, parseIndex, type ReleaseIndex } from './release.ts';
import { formatIsReadable } from '../aircraft/validate.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10" fill="#14263a"/></svg>';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const index = (over: Partial<ReleaseIndex> = {}): ReleaseIndex => ({ formatVersion: '0.6.0', operator: 'Test club', release: 1, published: '2026-11-16T00:00:00Z', aircraft: [{ registration: 'T', type: 'T', revision: 1, file: 'releases/1/T.json', sha256: 'a'.repeat(64) }], ...over });

describe('Operator logo', () => {
	it('takes PNG, JPEG and SVG files as data URIs', () => {
		expect(logoFromFile('logo.svg', bytes(SVG))).toMatch(/^data:image\/svg\+xml;base64,/);
		expect(logoFromFile('LOGO.PNG', PNG)).toMatch(/^data:image\/png;base64,/);
		expect(logoFromFile('logo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatch(/^data:image\/jpeg;base64,/);
	});
	it('refuses other types, wrong contents, big files and SVGs that are more than a drawing', () => {
		const problem = (name: string, data: Uint8Array) => { try { logoFromFile(name, data); return ''; } catch (e) { expect(e).toBeInstanceOf(LogoError); return (e as Error).message; } };
		expect(problem('logo.gif', PNG)).toContain('PNG, JPEG or SVG');
		expect(problem('logo.png', bytes(SVG))).toContain('not a PNG');
		expect(problem('logo.svg', bytes('hello'))).toContain('not an SVG');
		expect(problem('logo.png', new Uint8Array(LOGO_MAX_BYTES + 1).fill(0x89))).toContain('at most 48 KB');
		for (const bad of ['<script>x()</script>', '<image href="https://x.test/a.png"/>', '<rect onload="x()"/>', '<a href="https://x.test">x</a>', '<foreignObject/>'])
			expect(problem('logo.svg', bytes(SVG.replace('</svg>', `${bad}</svg>`)))).toContain('plain drawing');
		// A link inside the drawing itself is fine.
		expect(problem('logo.svg', bytes(SVG.replace('</svg>', '<use href="#r"/></svg>')))).toBe('');
	});
	it('is optional in the index, checked there like everything else', () => {
		const light = logoFromFile('logo.svg', bytes(SVG));
		expect(parseIndex(index({ logo: { light } })).logo?.light).toBe(light);
		expect(parseIndex(index()).logo).toBeUndefined();
		expect(() => parseIndex(index({ logo: { light: 'data:image/png;base64,AAAA' } }))).toThrow('not valid');
		expect(() => parseIndex(index({ logo: { light, extra: 1 } as never }))).toThrow('not valid');
		expect(parseLogo({ light: 'https://x.test/logo.png' }).ok).toBe(false);
		expect(parseLogo(undefined)).toEqual({ ok: true, logo: undefined });
	});
	it('tells pilots when it changes', () => {
		const a = { light: logoFromFile('a.svg', bytes(SVG)) }, b = { light: logoFromFile('b.svg', bytes(SVG.replace('#14263a', '#000'))) };
		expect(sameLogo(a, { ...a })).toBe(true);
		expect(describeChanges(index(), index({ release: 2, logo: a }))).toContainEqual({ registration: 'Test club', text: 'Logo added' });
		expect(describeChanges(index({ logo: a }), index({ release: 2, logo: b }))).toContainEqual({ registration: 'Test club', text: 'New logo' });
		expect(describeChanges(index({ logo: a }), index({ release: 2 }))).toContainEqual({ registration: 'Test club', text: 'Logo removed' });
		expect(describeChanges(index({ logo: a }), index({ release: 2, logo: a }))).toEqual([]);
	});
	it('knows its proportions, so layouts can centre it', () => {
		expect(logoAspect(logoFromFile('a.svg', bytes(SVG)))).toBe(4);
		expect(logoAspect(logoFromFile('b.svg', bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="300px" height="100px"><rect width="1" height="1"/></svg>')))).toBe(3);
		const png = new Uint8Array(24); png.set(PNG); png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0x2c, 0, 0, 0, 0x7b], 8);
		expect(logoAspect(logoFromFile('c.png', png))).toBeCloseTo(300 / 123);
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 0, 200, 3, 0, 0, 0]);
		expect(logoAspect(logoFromFile('d.jpg', jpeg))).toBe(4);
		expect(logoAspect(logoFromFile('e.svg', bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')))).toBe(1);
	});
	it('needs the new format only when a release has one, so older apps still read the rest', () => {
		const light = logoFromFile('logo.svg', bytes(SVG));
		expect(indexFormatVersion({ logo: { light } })).toBe('0.6.0');
		expect(indexFormatVersion({ operatorRules: { aboveTable: { takeoffPercentPer1000ft: 10, landingPercentPer1000ft: 5, alertAboveM: 500 } } })).toBe('0.2.0');
		expect(indexFormatVersion({})).toBe('0.1.0');
		// An app from before logos, which knows format 0.5.0.
		expect(formatIsReadable(indexFormatVersion({}), '0.5.0')).toBe(true);
		expect(formatIsReadable(indexFormatVersion({ logo: { light } }), '0.5.0')).toBe(false);
	});
	it('goes to the PDF as a drawing or an image', () => {
		expect(pdfLogo(logoFromFile('logo.svg', bytes(SVG)))).toEqual({ svg: SVG });
		const png = logoFromFile('logo.png', PNG);
		expect(pdfLogo(png)).toEqual({ image: png });
	});
});

describe('command-line tool with a logo', () => {
	const work = mkdtempSync(join(tmpdir(), 'data-logo-'));
	afterAll(() => rmSync(work, { recursive: true, force: true }));
	const source = join(work, 'source'), out = join(work, 'out'), light = join(work, 'logo.svg'), dark = join(work, 'logo-dark.svg');
	cpSync('aircraft-examples', source, { recursive: true });
	writeFileSync(light, SVG);
	writeFileSync(dark, SVG.replace('#14263a', '#ffffff'));
	const publish = (release: number, ...more: string[]) => spawnSync('node', ['--no-warnings', 'tools/data/cli.ts', 'publish', '--source', source, '--out', out, '--release', String(release), '--operator', 'Test', ...more], { encoding: 'utf8' });
	const published = () => parseIndex(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')));

	it('publishes it, keeps it in the next release, and removes it on request', () => {
		expect(publish(1, '--logo', light, '--logo-dark', dark).status).toBe(0);
		expect(published().logo).toEqual({ light: logoFromFile('logo.svg', bytes(SVG)), dark: logoFromFile('logo.svg', bytes(SVG.replace('#14263a', '#ffffff'))) });
		expect(published().formatVersion).toBe('0.6.0');
		expect(publish(2).status).toBe(0);
		expect(published().logo?.dark).toBeDefined();
		const r = publish(3, '--no-logo');
		expect(r.status).toBe(0);
		expect(r.stdout).toContain('Logo removed');
		expect(published().logo).toBeUndefined();
		expect(published().formatVersion).toBe('0.1.0');
	});
	it('refuses a dark logo alone, and both --logo and --no-logo', () => {
		expect(publish(4, '--logo-dark', dark).stderr).toContain('needs --logo');
		expect(publish(4, '--logo', light, '--no-logo').stderr).toContain('not both');
	});
});
