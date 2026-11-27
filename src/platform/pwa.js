/**
 * Enables supported offline loading after app startup. A service worker is a browser-managed helper
 * that can cache website files; PWA means Progressive Web App. This is separate from training-data
 * backups and does not synchronize to another device.
 */

import { trustedScriptURL } from '../html.js';

/**
 * Register the worker outside hot-reload development, wait until it is ready and send it the loaded
 * resource URLs for filtering/caching. Report registration failures to the page without turning
 * them into a successful offline claim.
 */
export async function registerPwa() {
    if(!('serviceWorker' in navigator) || (typeof module !== 'undefined' && module.hot)) return;
    try {
        const registration = await navigator.serviceWorker.register(
            trustedScriptURL(new URL('../sw.js', import.meta.url)), {
            type: 'module', scope: '/',
        });
        await navigator.serviceWorker.ready;
        const worker = registration.active;
        if(worker) {
            worker.postMessage({
                type: 'CACHE_ASSETS',
                urls: performance.getEntriesByType('resource').map(entry => entry.name),
            });
        }
    } catch(error) {
        window.dispatchEvent(new CustomEvent('pwa:error', {detail: `Offline app caching is unavailable: ${error.message}`}));
    }
}
