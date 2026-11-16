const KEY = 'aop-reloaded-at';
const WAIT_MS = 30000;

/** Reloads the page, unless it already reloaded this way in the last 30 s, so a lasting fault can't loop. */
export function reloadOnce(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeSession(), now = Date.now(), reload = () => location.reload()): boolean {
	// Without storage there is no loop guard, so don't reload by itself.
	if (!storage) return false;
	try {
		const last = Number(storage.getItem(KEY) ?? 0);
		if (now - last < WAIT_MS) return false;
		storage.setItem(KEY, String(now));
	} catch {
		return false;
	}
	reload();
	return true;
}

function safeSession(): Storage | null {
	try { return sessionStorage; } catch { return null; }
}
