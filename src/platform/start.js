/**
 * The browser entry point named by index.html. It opens the standalone app without a login, mounts
 * the platform and then enables supported offline caching. Startup failures are shown as readable
 * text in the page, not hidden behind a blank screen.
 */
import { setAccountScope } from '../storage/account.js';

const root = document.querySelector('#platform');

/**
 * Select unscoped local storage without deleting older account data, redirect the retired account
 * link to Settings, then wait for the interface and offline registration.
 */
async function start() {
    setAccountScope(null);
    window.localStorage.removeItem('too-many-watts-server-mode');
    if(window.location.hash === '#/account') window.location.hash = '/settings';
    const { launchPlatform } = await import('./ui.js');
    await launchPlatform(root);
    const { registerPwa } = await import('./pwa.js');
    await registerPwa();
}

void start().catch(error => {
    console.error('Unable to start the local application:', error);
    root.replaceChildren();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `The application could not be opened: ${error.message}. Reload to retry.`;
    root.append(message);
});
