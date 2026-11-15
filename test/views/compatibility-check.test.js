/*
 * Checks which Bluetooth setup guidance the rider sees: insecure page address,
 * missing browser capability, or no warning when Bluetooth is available.
 *
 * jsdom supplies a simulated page but no real Bluetooth hardware. Tests replace
 * capability flags and browser names to check features, not guess from platform names.
 * The model stub keeps unrelated app data out of these display-only checks.
 */

/**
 * @jest-environment jsdom
 */

jest.mock('../../src/models/models.js', () => ({ models: {} }));

import '../../src/views/data-views.js';
import { webBle } from '../../src/ble/web-ble.js';

afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
});

// Set the simulated browser capabilities, then mount the tag to run its startup check.
function mount({ secure = true, bluetooth } = {}) {
    jest.replaceProperty(window, 'isSecureContext', secure);
    jest.replaceProperty(navigator, 'bluetooth', bluetooth);
    const element = document.createElement('compatibility-check');
    document.body.append(element);
    return element;
}

// Make browser-only properties replaceable so each scenario can set them independently.
beforeAll(() => {
    Object.defineProperty(window, 'isSecureContext', {
        configurable: true, writable: true, value: true,
    });
    Object.defineProperty(navigator, 'bluetooth', {
        configurable: true, writable: true, value: undefined,
    });
});

test.each([
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'],
    ['Linux Chrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'],
])('%s with Web Bluetooth has no warning', (name, userAgent) => {
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    const element = mount({ bluetooth: { requestDevice: jest.fn() } });
    expect(webBle.isAvailable()).toBe(true);
    expect(element.innerHTML).toBe('');
});

test('HTTP LAN access explains the secure-context requirement, not browser support', () => {
    const element = mount({ secure: false });
    expect(element.textContent).toContain('HTTPS');
    expect(element.textContent).toContain('same device');
    expect(element.textContent).toContain('HTTP LAN address');
    expect(element.textContent).not.toContain('NOT supported');
    expect(element.textContent).not.toContain('chrome://flags');
});

test('missing Web Bluetooth on HTTPS gives Linux and Android setup guidance', () => {
    const element = mount();
    expect(element.textContent).toContain('chrome://flags/#enable-experimental-web-platform-features');
    expect(element.textContent).toContain('relaunch Chrome');
    expect(element.textContent).toContain('directly in Chrome');
    expect(element.textContent).not.toContain('NOT supported');
});

test('a Bluetooth property without requestDevice is not sufficient', () => {
    const element = mount({ bluetooth: {} });
    expect(webBle.isAvailable()).toBe(false);
    expect(element.textContent).toContain('Bluetooth unavailable');
});

test('reconnecting the element clears a stale warning when Bluetooth is available', () => {
    const element = mount();
    element.remove();
    jest.replaceProperty(navigator, 'bluetooth', { requestDevice: jest.fn() });
    document.body.append(element);
    expect(element.innerHTML).toBe('');
});
