import { fileStorage } from './file.ts';
import type { Storage } from './index.ts';

/** Null means the admin module is off, which is fine: hand-written files still work. */
export async function storageFromEnv(env: Record<string, string | undefined> = process.env): Promise<Storage | null> {
	if (env.AOP_STORAGE_DIR) return fileStorage(env.AOP_STORAGE_DIR);
	if (env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID) {
		const { vercelBlobStorage } = await import('./vercel-blob.ts');
		return vercelBlobStorage();
	}
	return null;
}
