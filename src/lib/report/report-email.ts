/**
 * The Operator's address for Reports, from PUBLIC_REPORT_EMAIL in the host's settings.
 * Vite builds it into the app, so it works offline, and anyone with the app can read it: use a role address.
 * Empty when not set, or when it doesn't look like an address.
 */
const value = String(import.meta.env.PUBLIC_REPORT_EMAIL ?? '').trim();
export const REPORT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
