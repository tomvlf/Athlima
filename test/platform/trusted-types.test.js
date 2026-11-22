/**
 * Runs the real parser and worker entry modules with enforcing Trusted Types sinks. jsdom does
 * not enforce CSP itself, so branded values are checked before XML parsing or worker creation.
 * Separate module loaders share a document to reproduce Parcel's duplicated policy module.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createContext, Script } from 'node:vm';
import { transformSync } from '@babel/core';
import * as functions from '../../src/functions.js';
import { workouts } from '../../src/workouts/workouts.js';

const root = resolve('src');

function browser() {
    const htmlValues = new WeakSet();
    const scriptURLs = new WeakSet();
    const names = new Set();
    const brand = (value, values) => {
        const trusted = Object.freeze({toString: () => value});
        values.add(trusted);
        return trusted;
    };
    const createPolicy = jest.fn((name, rules) => {
        if(name !== 'athlima' || names.has(name)) throw new TypeError('CSP rejected the policy name.');
        names.add(name);
        return {
            createHTML: value => brand(rules.createHTML(value), htmlValues),
            createScriptURL: value => brand(rules.createScriptURL(value), scriptURLs),
        };
    });
    const parse = jest.fn((value, type) => {
        if(!htmlValues.has(value)) throw new TypeError('DOMParser requires TrustedHTML.');
        return new DOMParser().parseFromString(String(value), type);
    });
    const constructWorker = jest.fn(value => {
        if(!scriptURLs.has(value)) throw new TypeError('Worker requires TrustedScriptURL.');
    });
    const tickListeners = [];
    const register = jest.fn(async value => {
        if(!scriptURLs.has(value)) throw new TypeError('Service worker requires TrustedScriptURL.');
        return {active: {postMessage}};
    });
    const postMessage = jest.fn();
    const errors = [];
    const xf = {reg: jest.fn(), sub: jest.fn(), dispatch: jest.fn()};
    const context = createContext({
        URL, location: window.location, console, CustomEvent,
        trustedTypes: {createPolicy},
        DOMParser: class {
            parseFromString(value, type) { return parse(value, type); }
        },
        Worker: class {
            constructor(value, options) { constructWorker(value, options); }
            addEventListener(type, listener) {
                if(type === 'message') tickListeners.push(listener);
            }
            postMessage() {}
        },
        navigator: {serviceWorker: {register, ready: Promise.resolve()}},
        performance: {getEntriesByType: () => []},
        window: {dispatchEvent: event => errors.push(event.detail)},
    });

    function chunk() {
        const modules = new Map();
        function load(path) {
            const filename = resolve(root, path);
            if(modules.has(filename)) return modules.get(filename).exports;
            const module = {exports: {}};
            modules.set(filename, module);
            const {code} = transformSync(readFileSync(filename, 'utf8'), {
                filename, babelrc: false, configFile: false,
                plugins: [
                    ({types}) => ({
                        visitor: {
                            MetaProperty(path) {
                                if(path.node.meta.name === 'import' && path.node.property.name === 'meta') {
                                    path.replaceWith(types.valueToNode({url: new URL(
                                        relative(root, filename),
                                        window.location.href,
                                    ).href}));
                                }
                            },
                        },
                    }),
                    '@babel/plugin-transform-modules-commonjs',
                ],
            });
            const requireModule = name => {
                const dependency = resolve(dirname(filename), name);
                if(dependency === resolve(root, 'functions.js')) return {...functions, xf};
                if(dependency === resolve(root, 'models/models.js')) {
                    return {models: {session: {elapsed: jest.fn(), lap: jest.fn(), event: jest.fn()}}};
                }
                if(dependency === resolve(root, 'utils.js') ||
                   dependency === resolve(root, 'storage/idb.js') ||
                   dependency === resolve(root, 'ble/enums.js') ||
                   dependency === resolve(root, 'activity/enums.js') ||
                   dependency === resolve(root, 'activity/stop.js')) return {};
                return load(dependency);
            };
            new Script(`(function(require, module, exports) {${code}\n})`, {filename})
                .runInContext(context)(requireModule, module, module.exports);
            return module.exports;
        }
        return {load};
    }
    return {chunk, createPolicy, parse, constructWorker, register, postMessage, errors, xf, tickListeners};
}

test('ZWO startup parses every built-in workout through an enforcing TrustedHTML sink', () => {
    const page = browser();
    expect(() => page.parse('<workout_file />', 'text/xml')).toThrow('requires TrustedHTML');
    const {zwo} = page.chunk().load('workouts/zwo.js');
    for(const source of workouts) {
        const workout = zwo.readToInterval(source);
        expect(workout.meta.name).toBeTruthy();
        expect(Number.isFinite(workout.meta.duration)).toBe(true);
    }
    expect(page.parse).toHaveBeenCalledWith(expect.any(Object), 'text/xml');
    expect(() => zwo.read('<workout_file>')).toThrow('not valid ZWO XML');
    expect(page.createPolicy).toHaveBeenCalledTimes(1);
});

test('ride startup constructs the actual timer Worker with TrustedScriptURL and receives ticks', () => {
    const page = browser();
    expect(() => page.constructWorker(new URL('/timer.js', window.location.href)))
        .toThrow('requires TrustedScriptURL');
    const {watch} = page.chunk().load('watch.js');
    expect(page.constructWorker).toHaveBeenCalledTimes(2);
    const [url, options] = page.constructWorker.mock.calls[1];
    expect(String(url)).toBe(new URL('/timer.js', window.location.href).href);
    expect(options).toEqual({type: 'module'});
    expect(page.tickListeners).toHaveLength(1);
    page.tickListeners[0]({data: 'tick'});
    expect(page.xf.dispatch).toHaveBeenCalledWith('watch:elapsed', watch.elapsed + 1);
});

test('PWA registration from a separate chunk reuses the policy and reports no CSP failure', async () => {
    const page = browser();
    page.chunk().load('html.js').parseXML('<workout_file />');
    const {registerPwa} = page.chunk().load('platform/pwa.js');
    await registerPwa();
    expect(page.register).toHaveBeenCalledTimes(1);
    const [url, options] = page.register.mock.calls[0];
    expect(String(url)).toBe(new URL('/sw.js', window.location.href).href);
    expect(options).toEqual({type: 'module', scope: '/'});
    expect(page.postMessage).toHaveBeenCalledWith({type: 'CACHE_ASSETS', urls: []});
    expect(page.errors).toEqual([]);
    expect(page.createPolicy).toHaveBeenCalledTimes(1);
});

test('chunks loaded before policy creation share the policy and reject external worker URLs', () => {
    const page = browser();
    const first = page.chunk().load('html.js');
    const second = page.chunk().load('html.js');
    first.parseXML('<workout_file />');
    expect(String(second.trustedScriptURL(new URL('/timer.js', window.location.href))))
        .toBe(new URL('/timer.js', window.location.href).href);
    expect(() => second.trustedScriptURL('https://third-party.example/timer.js'))
        .toThrow('same-origin');
    expect(page.createPolicy).toHaveBeenCalledTimes(1);
});

test('a denied policy fails closed before XML parsing or worker construction', () => {
    const page = browser();
    page.createPolicy.mockImplementation(() => { throw new TypeError('Policy blocked by CSP'); });
    const {parseXML, trustedScriptURL} = page.chunk().load('html.js');
    expect(() => parseXML('<workout_file />')).toThrow('Policy blocked by CSP');
    expect(() => trustedScriptURL(new URL('/timer.js', window.location.href)))
        .toThrow('Policy blocked by CSP');
    expect(page.parse).not.toHaveBeenCalled();
    expect(page.constructWorker).not.toHaveBeenCalled();
});
