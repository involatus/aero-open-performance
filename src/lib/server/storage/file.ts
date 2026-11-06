/** A folder on disk, for development, tests and self-hosting. Not for serverless hosts, whose disks are temporary. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { AlreadyExists, VersionConflict, type Storage } from './index.ts';

const versionOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24);

export function fileStorage(root: string): Storage {
	const base = resolve(root);
	const full = (path: string) => {
		const p = resolve(base, path);
		if (p !== base && !p.startsWith(base + sep)) throw new Error('Path is outside the storage folder');
		return p;
	};
	const read = (path: string) => { try { return readFileSync(full(path), 'utf8'); } catch { return null; } };
	const walk = (dir: string): string[] => {
		try {
			return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
		} catch { return []; }
	};
	return {
		kind: 'file',
		async get<T>(path: string) {
			const text = read(path);
			return text === null ? null : { data: JSON.parse(text) as T, version: versionOf(text) };
		},
		async put(path, data, options = {}) {
			const old = read(path);
			if (options.ifVersion === null && old !== null) throw new AlreadyExists(path);
			if (options.ifVersion != null && (old === null || versionOf(old) !== options.ifVersion)) throw new VersionConflict(path);
			const text = `${JSON.stringify(data, null, '\t')}\n`;
			mkdirSync(dirname(full(path)), { recursive: true });
			writeFileSync(full(path), text);
			return versionOf(text);
		},
		async list(prefix) {
			return walk(base).map((p) => relative(base, p).split(sep).join('/')).filter((p) => p.startsWith(prefix)).sort();
		},
		async remove(path) { rmSync(full(path), { force: true }); }
	};
}
