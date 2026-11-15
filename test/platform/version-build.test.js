/** @jest-environment node */
/**
 * Build-level check that a release label/revision is actually embedded in the produced JavaScript.
 * It copies source into a disposable workspace, reuses installed dependencies, runs the real
 * metadata generator and Parcel, then removes that workspace. It neither publishes a release nor
 * changes this checkout's build label.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('build metadata is embedded into the production frontend', () => {
    const root = process.cwd();
    const workspace = mkdtempSync(path.join(tmpdir(), 'athlima-version-build-'));
    try {
        cpSync(path.join(root, 'src'), path.join(workspace, 'src'), {recursive: true});
        for(const name of ['package.json', '.babelrc', '.htmlnanorc']) {
            copyFileSync(path.join(root, name), path.join(workspace, name));
        }
        symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'),
            process.platform === 'win32' ? 'junction' : 'dir');

        const infoPath = path.join(workspace, 'src/platform/build-info.json');
        const generator = path.join(root, 'scripts/write-build-info.mjs');
        /**
         * Clear inherited release values first to test the development fallback, then supply
         * explicit fictional release values for the production-bundle check.
         */
        const env = {...process.env, NODE_ENV: 'production', BABEL_ENV: 'production',
            ATHLIMA_BUILD_VERSION: '', ATHLIMA_BUILD_REVISION: ''};
        execFileSync(process.execPath, [generator, infoPath], {env});
        expect(JSON.parse(readFileSync(infoPath, 'utf8'))).toEqual({version: 'development', revision: null});

        env.ATHLIMA_BUILD_VERSION = 'build-987.3';
        env.ATHLIMA_BUILD_REVISION = '0123456789abcdef0123456789abcdef01234567';
        execFileSync(process.execPath, [generator, infoPath], {env});
        expect(JSON.parse(readFileSync(infoPath, 'utf8'))).toEqual({
            version: env.ATHLIMA_BUILD_VERSION, revision: env.ATHLIMA_BUILD_REVISION,
        });

        const dist = path.join(workspace, 'dist');
        execFileSync(process.execPath, [require.resolve('parcel/lib/bin.js'), 'build',
            '--dist-dir', dist, '--cache-dir', path.join(workspace, '.parcel-cache')],
        {cwd: workspace, env, timeout: 60000});
        const bundles = readdirSync(dist).filter(name => name.endsWith('.js'))
            .map(name => readFileSync(path.join(dist, name), 'utf8')).join('\n');
        expect(bundles).toContain(env.ATHLIMA_BUILD_VERSION);
        expect(bundles).toContain(env.ATHLIMA_BUILD_REVISION);
        expect(bundles).not.toContain('process.env.ATHLIMA_BUILD_');
    } finally {
        rmSync(workspace, {recursive: true, force: true});
    }
}, 90000);
