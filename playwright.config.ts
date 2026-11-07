import { defineConfig, devices } from '@playwright/test';

// Service worker support is Chromium-only in Playwright, so real iPad checks stay manual.
export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: 'http://localhost:4317', ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
	webServer: [
		{ command: 'npx vite preview --port 4317 --strictPort', url: 'http://localhost:4317', reuseExistingServer: true },
		// A separate server with its own temporary storage and a test password, so publishing can't affect other tests.
		{ command: 'rm -rf .playwright-admin-storage && npx vite preview --port 4319 --strictPort', url: 'http://localhost:4319', reuseExistingServer: false, env: { ADMIN_PASSWORD: 'playwright-test-password', AOP_STORAGE_DIR: '.playwright-admin-storage' } }
	]
});
