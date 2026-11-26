/** @jest-environment node */
/**
 * Guards the Trusted Types boundary: application code must not assign HTML strings directly to
 * DOM sinks. All markup goes through src/html.js, which wraps it in the `too-many-watts` policy. The
 * Content Security Policy then rejects any direct string assignment at runtime.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'src');
const allowed = new Set(['src/html.js']);

function javascriptFiles(directory) {
    return readdirSync(directory).flatMap(name => {
        const path = join(directory, name);
        if(statSync(path).isDirectory()) return javascriptFiles(path);
        return name.endsWith('.js') ? [path] : [];
    });
}

const files = javascriptFiles(root).map(path => ({path, relative: relative(process.cwd(), path)}));

test('no application module bypasses the shared HTML and XML sinks', () => {
    const sinks = /(?:\.innerHTML\s*=|insertAdjacentHTML\s*\(|\.outerHTML\s*=|document\.write\s*\(|\.parseFromString\s*\()/;
    const offenders = files
        .filter(file => !allowed.has(file.relative))
        .filter(file => sinks.test(readFileSync(file.path, 'utf8')))
        .map(file => file.relative);
    expect(offenders).toEqual([]);
});

test('worker and service-worker entry points use trustedScriptURL', () => {
    const workerSink = /(?:new\s+(?:Worker|SharedWorker)\s*\(|serviceWorker\s*\.\s*register\s*\()(?!\s*trustedScriptURL\s*\()/;
    const offenders = files.filter(file => workerSink.test(
        readFileSync(file.path, 'utf8').replace(/^\s*\/\/.*$/gm, ''),
    )).map(file => file.relative);
    expect(offenders).toEqual([]);
});

test('no application module evaluates arbitrary strings as code', () => {
    const dynamicCode = /(?:^|[^.\w])eval\s*\(|new\s+Function\s*\(/m;
    // Strip line comments so a comment mentioning eval does not fail the guard.
    const offenders = files.filter(file => dynamicCode.test(
        readFileSync(file.path, 'utf8').replace(/^\s*\/\/.*$/gm, ''),
    )).map(file => file.relative);
    expect(offenders).toEqual([]);
});
