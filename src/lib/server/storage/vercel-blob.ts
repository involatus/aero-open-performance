/** Vercel Blob, in a private store. Pilots get files through this app, never straight from the store. */
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';
import { AlreadyExists, VersionConflict, type Storage } from './index.ts';

export function vercelBlobStorage(): Storage {
	return {
		kind: 'vercel-blob',
		async get<T>(path: string) {
			try {
				// Skips the cache, so an admin never edits or republishes from an old copy.
				const result = await get(path, { access: 'private', useCache: false });
				if (!result || result.statusCode !== 200) return null;
				const text = await new Response(result.stream).text();
				return { data: JSON.parse(text) as T, version: result.blob.etag };
			} catch (error) {
				if (error instanceof BlobNotFoundError) return null;
				throw error;
			}
		},
		async put(path, data, options = {}) {
			const body = JSON.stringify(data);
			const common = { access: 'private', contentType: 'application/json', addRandomSuffix: false } as const;
			try {
				if (options.ifVersion === null) return (await put(path, body, { ...common, allowOverwrite: false })).etag;
				if (options.ifVersion) return (await put(path, body, { ...common, ifMatch: options.ifVersion })).etag;
				return (await put(path, body, { ...common, allowOverwrite: true })).etag;
			} catch (error) {
				if (error instanceof BlobPreconditionFailedError) throw new VersionConflict(path);
				if (options.ifVersion === null && /already exists/i.test(String((error as Error).message))) throw new AlreadyExists(path);
				throw error;
			}
		},
		async list(prefix) {
			const paths: string[] = [];
			let cursor: string | undefined;
			do {
				const page = await list({ prefix, cursor, limit: 1000 });
				paths.push(...page.blobs.map((b) => b.pathname));
				cursor = page.hasMore ? page.cursor : undefined;
			} while (cursor);
			return paths.sort();
		},
		async remove(path) { await del(path); }
	};
}
