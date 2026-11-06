/** Where drafts and releases live. Small on purpose, so the host can change. */
export type Stored<T = unknown> = { data: T; version: string };
export class VersionConflict extends Error {}
export class AlreadyExists extends Error {}

export interface Storage {
	readonly kind: string;
	get<T = unknown>(path: string): Promise<Stored<T> | null>;
	/** `ifVersion`: only if unchanged, `null` meaning it must not exist yet. Leaving it out overwrites. */
	put(path: string, data: unknown, options?: { ifVersion?: string | null }): Promise<string>;
	list(prefix: string): Promise<string[]>;
	remove(path: string): Promise<void>;
}

export function memoryStorage(): Storage {
	const files = new Map<string, { text: string; version: number }>();
	let counter = 0;
	return {
		kind: 'memory',
		async get<T>(path: string) {
			const f = files.get(path);
			return f ? { data: JSON.parse(f.text) as T, version: String(f.version) } : null;
		},
		async put(path, data, options = {}) {
			const f = files.get(path);
			if (options.ifVersion === null && f) throw new AlreadyExists(path);
			if (options.ifVersion != null && (!f || String(f.version) !== options.ifVersion)) throw new VersionConflict(path);
			const version = ++counter;
			files.set(path, { text: JSON.stringify(data), version });
			return String(version);
		},
		async list(prefix) { return [...files.keys()].filter((k) => k.startsWith(prefix)).sort(); },
		async remove(path) { files.delete(path); }
	};
}
