/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('src');
const pngDimensions = path => {
    const bytes = readFileSync(resolve(source, path));
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

test('install manifest supplies correctly sized ordinary and distinct maskable icons', () => {
    const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.webmanifest'), 'utf8'));
    const standard = manifest.icons.filter(icon => !icon.purpose || icon.purpose === 'any');
    expect(standard.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(standard.some(icon => icon.src === maskable.src)).toBe(false);
    for(const icon of manifest.icons) {
        expect(icon.type).toBe('image/png');
        expect(pngDimensions(icon.src)).toEqual(icon.sizes.split('x').map(Number));
    }
});

test.each(['index.html', 'privacy.html'])('%s points to correctly sized browser and touch icons', page => {
    const html = readFileSync(resolve(source, page), 'utf8');
    const icons = [...html.matchAll(/<link rel="(?:apple-touch-icon|icon)"[^>]*sizes="(\d+)x\d+" href="([^"]+)"/g)];
    expect(icons).toHaveLength(4);
    for(const [, size, path] of icons) expect(pngDimensions(path)).toEqual([Number(size), Number(size)]);
});
