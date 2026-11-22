/** @jest-environment node */
/**
 * Runs the real header generator on tiny HTML examples in a disposable directory. Checks that the
 * content security policy (CSP), a browser allowlist for page resources, authorizes exact
 * inline-script/import-map hashes without allowing arbitrary inline or evaluated scripts. No
 * running web server is reconfigured.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let directory;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'athlima-headers-')); });
afterEach(() => { rmSync(directory, {recursive: true, force: true}); });

/**
 * Write a sample HTML file, invoke the build script in a child Node process and read its generated
 * configuration for assertions.
 */
function headers(html) {
    const source = join(directory, 'index.html');
    const destination = join(directory, 'headers.conf');
    writeFileSync(source, html);
    execFileSync(process.execPath, ['scripts/write-security-headers.mjs', source, destination]);
    return readFileSync(destination, 'utf8');
}

test('authorizes the exact generated import map without allowing arbitrary inline scripts', () => {
    const content = '\n{"imports":{"app":"/app.12345678.js"}}\n';
    const result = headers(`<script type=importmap>${content}</script><script src="/app.12345678.js"></script>`);
    const hash = createHash('sha256').update(content).digest('base64');
    expect(result).toContain(`script-src 'self' 'sha256-${hash}';`);
    expect(result).toContain("script-src-attr 'none'");
    expect(result).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(result).toContain("connect-src 'self' https://intervals.icu");
    expect(result).toContain("worker-src 'self'");
    expect(result).toContain("require-trusted-types-for 'script'");
    expect(result).toContain("trusted-types athlima");
    expect(result).toContain('bluetooth=(self), serial=(self), usb=(self), screen-wake-lock=(self)');
    expect(result).toContain('add_header Cross-Origin-Opener-Policy "same-origin" always;');
    expect(result).toContain('add_header Cross-Origin-Resource-Policy "same-origin" always;');
    expect(headers(`<script type=importmap>${content.replace('app.12345678', 'app.87654321')}</script>`))
        .not.toContain(`'sha256-${hash}'`);
});

test('does not authorize the empty content of external scripts', () => {
    const result = headers('<script src="/app.js"></script>');
    expect(result).toContain("script-src 'self';");
    expect(result).not.toContain('sha256-');
});
